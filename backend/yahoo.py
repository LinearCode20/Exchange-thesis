"""Yahoo Finance helpers - unofficial endpoints used by the dashboard."""

from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import quote

import requests

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
BASE = "https://query1.finance.yahoo.com"
TIMEOUT = 10  # seconds - fail fast on a flaky network instead of hanging

# The quoteSummary endpoint requires a cookie + crumb pair, obtained once
# and reused until it stops working.
_crumb_cache: dict | None = None


def safe_get(url: str, **kwargs) -> requests.Response:
    """GET with a hard timeout and one retry - a dropped or timed-out
    attempt usually succeeds on the retry."""
    last_exc: Exception | None = None
    for _ in range(2):
        try:
            return requests.get(url, timeout=TIMEOUT, **kwargs)
        except requests.RequestException as exc:  # network-level failure
            last_exc = exc
    assert last_exc is not None
    raise last_exc


def get_crumb() -> dict:
    global _crumb_cache
    if _crumb_cache:
        return _crumb_cache

    # fc.yahoo.com answers 404 but sets the A3 cookie the crumb endpoint needs.
    session = requests.Session()
    session.headers["User-Agent"] = UA
    session.get("https://fc.yahoo.com", timeout=TIMEOUT)

    res = session.get(f"{BASE}/v1/test/getcrumb", timeout=TIMEOUT)
    crumb = res.text.strip()
    if not crumb or len(crumb) > 40:
        raise RuntimeError("Could not obtain Yahoo Finance crumb")

    _crumb_cache = {"session": session, "crumb": crumb}
    return _crumb_cache


def reset_crumb() -> None:
    global _crumb_cache
    _crumb_cache = None


def fetch_chart(symbol: str, range_: str = "6mo", interval: str = "1d") -> dict:
    res = safe_get(
        f"{BASE}/v8/finance/chart/{quote(symbol)}?range={range_}&interval={interval}",
        headers={"User-Agent": UA},
    )
    if res.status_code != 200:
        raise RuntimeError(f"Yahoo chart request failed ({res.status_code})")
    result = (res.json().get("chart", {}).get("result") or [None])[0]
    if not result:
        raise RuntimeError(f'No data found for symbol "{symbol}"')
    return {
        "meta": result.get("meta") or {},
        "timestamp": result.get("timestamp") or [],
        "quote": (result.get("indicators", {}).get("quote") or [{}])[0],
    }


def _quote_summary_request(cached: dict, symbol: str, modules: str):
    try:
        return cached["session"].get(
            f"{BASE}/v10/finance/quoteSummary/{quote(symbol)}"
            f"?modules={modules}&crumb={quote(cached['crumb'])}",
            timeout=TIMEOUT,
        )
    except requests.RequestException:
        return None


def fetch_quote_summary(symbol: str, modules: str) -> dict | None:
    cached = get_crumb()
    res = _quote_summary_request(cached, symbol, modules)

    # A stale cookie/crumb pair returns 401 - refresh once and retry.
    if res is not None and res.status_code == 401:
        reset_crumb()
        cached = get_crumb()
        res = _quote_summary_request(cached, symbol, modules)
    if res is None or res.status_code != 200:
        return None

    return (res.json().get("quoteSummary", {}).get("result") or [None])[0]


def fetch_search(symbol: str) -> dict:
    """Raises on network failure - callers decide how to degrade."""
    res = safe_get(
        f"{BASE}/v1/finance/search?q={quote(symbol)}"
        f"&newsCount=8&videosCount=0&quotesCount=2",
        headers={"User-Agent": UA},
    )
    if res.status_code != 200:
        return {"quotes": [], "news": []}
    data = res.json()
    return {
        "quotes": data.get("quotes") or [],
        "news": [
            {
                "title": n.get("title") or "",
                "publisher": n.get("publisher") or "",
                "link": n.get("link") or "",
            }
            for n in (data.get("news") or [])
        ],
    }


def iso_date_from_timestamp(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
