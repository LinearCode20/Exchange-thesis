"""Earnings-call material: transcript text via Financial Modeling Prep and
videos/news via Yahoo search, cached for a few minutes per symbol."""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import requests

from yahoo import fetch_search

FMP_BASE = "https://financialmodelingprep.com/api/v3"
CACHE_TTL = 10 * 60  # seconds

# Load the project-root .env.local so the existing FMP_API_KEY keeps working
# without needing python-dotenv.
_load_root = Path(__file__).resolve().parent.parent / ".env.local"
try:
    for _line in _load_root.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _key, _, _value = _line.partition("=")
        os.environ.setdefault(_key.strip(), _value.strip())
except OSError:
    pass

_cache: dict[str, dict] = {}  # symbol -> {"data": ..., "expires": epoch}


def _quarter_candidates() -> list[dict]:
    """Most recent 8 calendar quarters, newest first."""
    now = datetime.now(timezone.utc)
    candidates: list[dict] = []
    year, quarter = now.year, (now.month - 1) // 3 + 1
    for _ in range(8):
        candidates.append({"year": year, "quarter": quarter})
        quarter -= 1
        if quarter == 0:
            quarter = 4
            year -= 1
    return candidates


def fetch_transcript(symbol: str) -> dict | None:
    """Earnings-call transcript text via FMP. Returns None when no key is
    configured, the host is unreachable, or nothing was found."""
    key = os.getenv("FMP_API_KEY")
    if not key:
        return None

    for candidate in _quarter_candidates():
        try:
            res = requests.get(
                f"{FMP_BASE}/earning_call_transcript/{quote(symbol)}",
                params={
                    "quarter": candidate["quarter"],
                    "year": candidate["year"],
                    "apikey": key,
                },
                timeout=8,
            )
            data = res.json()
        except (requests.RequestException, ValueError):
            # Network unreachable - every further quarter will hit the same wall.
            break
        if res.status_code in (401, 403):
            break  # key rejected - no point trying the other quarters
        if res.status_code != 200:
            continue
        item = data[0] if isinstance(data, list) and data else None
        if isinstance(item, dict) and item.get("content"):
            return {
                "symbol": symbol,
                "quarter": item.get("quarter") or candidate["quarter"],
                "year": item.get("year") or candidate["year"],
                "date": item.get("date") or "",
                "content": item["content"],
            }
    return None


def get_earnings(symbol: str) -> dict:
    cached = _cache.get(symbol)
    if cached and cached["expires"] > time.time():
        return cached["data"]

    # News/video lookups are a nice-to-have: on a flaky network this fetch may
    # fail entirely, and the panel should still render (YouTube search link).
    try:
        search = fetch_search(symbol)
    except requests.RequestException:
        search = {"quotes": [], "news": []}

    quotes = search.get("quotes") or []
    raw_name = ""
    if quotes:
        raw_name = quotes[0].get("longname") or quotes[0].get("shortname") or ""
    # Search can come back empty (network); avoid a "AAPL AAPL" YouTube query.
    company_name = f"{raw_name} " if raw_name and raw_name != symbol else ""

    videos: list[dict] = []
    news: list[dict] = []
    for item in search.get("news") or []:
        if not item.get("link"):
            continue
        is_video = "/video/" in item["link"] or "Video" in item["publisher"]
        (videos if is_video else news).append(item)

    body = {
        "videos": videos[:4],
        "news": news[:5],
        "youtubeQuery": f"{company_name}{symbol} earnings call",
        "transcript": fetch_transcript(symbol),
        "transcriptAvailable": bool(os.getenv("FMP_API_KEY")),
    }
    _cache[symbol] = {"data": body, "expires": time.time() + CACHE_TTL}
    return body
