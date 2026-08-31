# Stock Dashboard

A simple app: pick a ticker, press **Show data**, and get the current rate,
6-month history table, a next-month trend projection, and earnings call
material (audio/video links + transcript text).

- **Frontend:** Next.js + React + Tailwind
- **Backend:** Python (FastAPI) — all data fetching & computation live in `backend/`

Built for thesis/educational purposes — **not financial advice**.

## Run it

Requires **Node.js** and **Python 3.10+** (install from
[python.org](https://www.python.org/downloads/) and tick "Add to PATH").

**Terminal 1 — Python backend:**

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows (Git Bash: source .venv/Scripts/activate)
pip install -r requirements.txt
python main.py                # serves http://127.0.0.1:8000
```

**Terminal 2 — Next.js frontend:**

```bash
npm install
npm run dev                   # http://localhost:3000
```

The frontend proxies `/api/*` to the Python server (see `next.config.ts`), so
the browser only ever uses relative URLs. If a request fails, the page shows
an error banner — just press **Show data** again.

## Features

- **Dropdown** (AAPL, MSFT — more can be uncommented in `app/page.tsx`) + submit button
- **Current day rate** — price, day change, day range, 52-week range, volume
- **Historical data** — 6 months of daily OHLCV, latest 12 rows in a table
- **Next-month projection** — least-squares trend over the last ~3 months,
  extended ~21 trading days with a ±1σ band + next-earnings date & estimates
- **Earnings calls** — listen on YouTube, recent stock videos and news, plus
  full transcript text (see below)

## Data sources (all free)

| Data | Source | Key needed |
| --- | --- | --- |
| Quotes, 6-month history, earnings dates/estimates | Yahoo Finance endpoints | No |
| Stock videos & news | Yahoo Finance search | No |
| Earnings-call **audio/video** | YouTube search link (full webcast recordings) | No |
| Earnings-call **transcript text** | [Financial Modeling Prep](https://site.financialmodelingprep.com/developer/docs) | Free key |

### Optional: transcript text

1. Create a free API key at financialmodelingprep.com
2. Put it in `.env.local` (project root — the Python backend reads it):
   ```
   FMP_API_KEY=your_key_here
   ```
3. Restart the Python backend

Without a key everything else works; the transcript card shows setup
instructions instead.

## Structure

```
backend/
  main.py               FastAPI app: GET /api/stock, GET /api/earnings
  yahoo.py              Yahoo fetch helpers (incl. cookie/crumb flow, retries)
  forecast.py           linear-regression trend projection
  earnings.py           FMP transcript + videos/news + 10-min cache
  requirements.txt
app/
  page.tsx              Home page (dropdown + submit + all sections)
  layout.tsx, globals.css
components/
  StatCard.tsx          KPI tiles
  HistoryTable.tsx      recent OHLCV table
  ForecastCard.tsx      next-month outlook + methodology
  EarningsPanel.tsx     transcript + audio/video/news
lib/
  types.ts              shared types
next.config.ts          proxies /api/* -> http://127.0.0.1:8000
```

## Notes

- The "next month" number is a plain linear-regression trend extended ~21
  trading days with a ±1σ band — a statistical exercise, not a prediction.
- Yahoo data can be delayed and endpoints are unofficial; requests have a
  10-second timeout with one automatic retry for flaky networks.

## Workflow

This section explains, step by step, everything that happens when the app is
used — from the button click to the rendered dashboard.

### 0. The big picture

```
Browser (http://localhost:3000)
   │  user picks AAPL/MSFT, clicks "Show data"
   ▼
Next.js frontend (app/page.tsx)
   │  fetch("/api/stock?symbol=AAPL")  +  fetch("/api/earnings?symbol=AAPL")
   │        (sent in parallel)
   ▼
Next.js proxy (next.config.ts rewrites)
   │  /api/*  →  http://127.0.0.1:8000/api/*
   ▼
Python FastAPI backend (backend/main.py)
   │                       │
   ▼                       ▼
Yahoo Finance          Yahoo search + Financial Modeling Prep
(chart, calendar)      (videos/news + transcript text)
   │                       │
   └───────────┬───────────┘
               ▼
        JSON responses → React renders the dashboard
```

Two servers run side by side: the Python backend does all data fetching and
computation; the Next.js app only displays it. The frontend never talks to
Yahoo/FMP directly — it only calls its own `/api/...` URLs, and the proxy
forwards them to Python. That is why both terminals from "Run it" must be
running.

### 1. Selecting a company and submitting

- `app/page.tsx` keeps a `SYMBOLS` list (AAPL and MSFT active; others are
  commented out and can be re-enabled by uncommenting).
- The dropdown is plain React state (`useState`). Submitting a form calls
  `handleSubmit`, which fires **two requests at once** with `Promise.all`:
  `/api/stock?symbol=…` and `/api/earnings?symbol=…`.
- While they run, a loading spinner is shown. If the stock request fails, the
  error message from the backend is displayed in a red banner; press
  **Show data** again to retry.

### 2. Stock data pipeline (`GET /api/stock` → `backend/main.py`)

1. **Read & validate** — the `symbol` query parameter is trimmed and
   upper-cased; an empty one returns `400 {"error": "..."}`.
2. **Fetch the chart** (`backend/yahoo.py: fetch_chart`) — calls Yahoo's
   `/v8/finance/chart/<SYMBOL>` for **6 months of daily candles** (open,
   high, low, close, volume per trading day).
3. **Build the history list** — rows with a missing `close` (suspended days)
   are skipped; dates are converted from Unix timestamps to `YYYY-MM-DD`.
4. **Current-day numbers** — taken from the chart's `meta`: last price, day
   high/low, 52-week range, volume, exchange, currency. If the live price is
   missing, the last close is used instead. Yesterday's close (the candle
   before the last one) is kept for the day-change calculation.
5. **Earnings calendar** — Yahoo's `quoteSummary` endpoint needs a
   **cookie + crumb** pair, so `yahoo.py` first visits `fc.yahoo.com` to get
   the session cookie, then `/v1/test/getcrumb`, and caches the pair for
   reuse (refreshed automatically on a 401). From it we read: next earnings
   date, whether that date is an estimate, last call date, EPS and revenue
   estimates. This step is optional — if it fails, the rest still works.
6. **Trend projection** — `backend/forecast.py` (details in step 3).
7. **Respond** — one JSON object: `meta`, `history`, `forecast`, `earnings`.
   Any failure (network, bad symbol) becomes `502 {"error": "..."}`.

### 3. Next-month prediction (`backend/forecast.py`)

- Takes the **last 63 daily closes** (~3 months of trading days).
- Fits a **least-squares straight line** (linear regression): computes the
  slope and intercept that best describe the recent trend.
- Extends that line **21 trading days** into the future (weekends skipped),
  producing one projected price per day.
- Calculates the **residual standard deviation (σ)** of the fit — how far
  the real closes typically stray from the line — and shows each projection
  as a band of `price ± σ`.
- The **end value** (day 21) and its percent change versus today's close are
  what the "Next-month outlook" card displays.
- Deliberately simple on purpose: it is a statistical trend estimate for
  coursework, not a real market prediction (this disclaimer is shown in the
  UI and footer).

### 4. Earnings pipeline (`GET /api/earnings` → `backend/earnings.py`)

1. **Cache check** — results are cached per symbol for **10 minutes**, so
   repeated clicks are instant and gentle on the free APIs.
2. **Yahoo search** — `/v1/finance/search` returns recent articles for the
   symbol. Items whose link contains `/video/` (or publisher contains
   "Video") go to the **videos** list (max 4); the rest become **news**
   (max 5). The company's real name is taken from the first quote; if the
   search failed, the ticker alone is used (no "AAPL AAPL" queries).
3. **Transcript text (optional)** — if `FMP_API_KEY` is set in `.env.local`,
   the backend asks Financial Modeling Prep for the earnings-call transcript,
   trying the **last 8 quarters, newest first**. It stops early when the key
   is rejected (401/403) or the network is unreachable, instead of retrying
   all 8 quarters needlessly. Without a key this step is skipped and the UI
   shows setup instructions instead.
4. **YouTube fallback** — regardless of the above, the response carries a
   `youtubeQuery` ("Microsoft Corporation MSFT earnings call"). The frontend
   turns it into a YouTube search link so the **audio/recording of the call**
   is always one click away.

### 5. Rendering the dashboard (`app/page.tsx` + `components/`)

With both responses in hand, React renders, top to bottom:

1. **KPI row** — four `StatCard` tiles: current rate with day change
   (+/-, colored green/red), day range + volume, 52-week range + exchange,
   and next earnings date + EPS estimate.
2. **Historical data (most recent)** — `HistoryTable` shows the latest 12 of
   the ~126 loaded trading days: date, open, high, low, close, daily change %
   and volume. It sits in the wide left column of a two-column row.
3. **Next-month outlook** — `ForecastCard` in the right column of the same
   row: projected end price, percent change vs today, the typical ±1σ range,
   today's close, and a short methodology note.
4. **Earnings panel** — `EarningsPanel`: transcript text (with show
   more/less) on the left; "Listen to the latest earnings call" button
   (opens YouTube), video links and latest news on the right.
5. **Footer** — data-source and not-financial-advice disclaimer.

### 6. Resilience & performance details

- **Timeouts + retry** — every external call in `backend/yahoo.py` has a
  10-second timeout and is retried once; a dropped first attempt usually
  succeeds on the second, and a total failure surfaces in ~10–20s instead of
  hanging the page.
- **Graceful degradation** — the earnings calendar, videos/news and
  transcript are all optional; if any of them fails, the page still renders
  the core price, history and projection.
- **Two-level caching** — the Python backend caches earnings responses for
  10 minutes; Yahoo's crumb/cookie pair is cached until it expires.
- **No keys needed to start** — everything except transcript text works with
  no API key at all; the free FMP key only unlocks the transcript card.
