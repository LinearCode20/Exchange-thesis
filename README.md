# Stock Prediction Dashboard (Thesis)

Compare stock-price prediction models — **SRNN (baseline)** vs **GRU & LSTM
(proposed)** — on a 10-year daily dataset for four stocks (AAPL, MSFT, NVDA,
TSLA), with an 80/20 chronological train/test split and a 60-trading-day.
prediction horizon. Built with Next.js + React + Tailwind + Recharts.
**Not financial advice** — thesis/educational use only.

## Run it (Node only — no Python needed)

```bash
npm install
npm run dev        # http://localhost:3000
```

That's it. The models are trained ahead of time and their results are
committed as JSON artifacts in `data/results/`, which the API routes serve.
Everything works offline except the optional live rate and earnings media.

### Deploying to Vercel

Push to GitHub and import on [vercel.com](https://vercel.com) — no extra
configuration. The API routes are serverless functions; the artifacts are
bundled with them. No API key is needed on Vercel. The Alpha Vantage key
(`ALPHAVANTAGE_API_KEY`) is only needed on your machine to run
`npm run fetch-transcripts` / `npm run train`.

## The models & experiment

| | SRNN (Baseline) | GRU (Proposed) | LSTM (Proposed) |
| --- | --- | --- | --- |
| Type | Simple/Elman RNN | Gated Recurrent Unit | Long Short-Term Memory |
| Role | Baseline | Proposed | Proposed |

**Protocol (identical for all models):**

- **Dataset** — 10 years of daily closes per stock (~2,514 records) from
  Yahoo Finance.
- **Split** — chronological 80/20 (train 2016→2024, test 2024→2026); the test
  segment always lies after training data.
- **Scaling** — MinMax fitted on the **training** closes only (no leakage).
- **Windows** — sliding window of 60 trading days → next-day close.
- **Training** — Adam (lr 0.001), batch 32, 20 epochs, hidden units 32,
  gradient-norm clip 1.0, seeded and reproducible.
- **Evaluation** — one-step-ahead predictions on the held-out segment
  (RMSE / MAE / MAPE / R²).
- **Forecast** — the 60-day future path is generated iteratively: each
  prediction is appended to the input window.

The three architectures are implemented from scratch in TypeScript with full
BPTT; `npm run check-gradients` verifies every gradient against finite
differences (worst relative error < 1e-7).

### Latest results (see the Results tab for all four stocks)

| Stock | SRNN R² | GRU R² | LSTM R² |
| --- | --- | --- | --- |
| AAPL | 0.842 | **0.951** | 0.947 |
| MSFT | 0.921 | **0.950** | 0.935 |
| NVDA | 0.907 | **0.916** | 0.880 |
| TSLA | 0.932 | **0.950** | 0.927 |

GRU (proposed) achieves the best R² on all four stocks; LSTM is close behind;
the SRNN baseline trails clearly — supporting the thesis that gated
architectures model stock dynamics better than a simple recurrent network.

## Regenerating the artifacts

```bash
npm run train          # retrains all 4 stocks in parallel (~7-10 min)
node scripts/build-index.mjs   # only needed after per-stock runs
```

Per-stock / debug runs:

```bash
node scripts/train-models.mjs --stock AAPL --epochs 2   # smoke test
node scripts/train-models.mjs --kinds srnn              # one architecture
node scripts/check-gradients.mjs                        # BPTT gradient check
```

Artifacts are deterministic (fixed seeds): same inputs → same numbers.

## API routes

| Route | Purpose |
| --- | --- |
| `GET /api/predict?symbol=AAPL` | Full artifact: history, metrics, test predictions, 60-day forecast |
| `GET /api/dataset-index` | Cross-stock dataset + metrics summary |
| `GET /api/quote?symbol=AAPL` | Live rate from Yahoo Finance (Data Info tab) |
| `GET /api/earnings?symbol=AAPL` | News + video links (audio summary card) |

## Data sources — where the API data comes from

```
Yahoo Finance chart API (10y daily)
   │  npm run train  (scripts/train-models.mjs)
   ▼
data/results/<SYMBOL>.json + _index.json   (committed to git)
   │  static import
   ▼
/api/predict, /api/dataset-index           ← offline, no network

Yahoo Finance (chart + search) ──► /api/quote, /api/earnings   ← live, at request time
Financial Modeling Prep (optional) ──► /api/earnings (transcript)
```

| Route / step | Code | Source | What is used |
| --- | --- | --- | --- |
| `npm run train` | `scripts/train-models.mjs` | `https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}?range=10y&interval=1d` | Daily close history → model training, metrics, forecast |
| `/api/predict` | `app/api/predict/route.ts` | Local file `data/results/{SYMBOL}.json` | Whole artifact (history, metrics, test predictions, 60-day forecast) |
| `/api/dataset-index` | `app/api/dataset-index/route.ts` | Local file `data/results/_index.json` | Cross-stock dataset + metrics summary |
| `/api/quote` | `app/api/quote/route.ts` → `fetchChart()` in `lib/yahoo.ts` | `https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}?range=5d&interval=1d` | `meta.regularMarketPrice`, `chartPreviousClose`, `longName`, `currency`, `regularMarketTime` → price + % change |
| `/api/earnings` (news/videos) | `app/api/earnings/route.ts` → `fetchSearch()` in `lib/yahoo.ts` | `https://query1.finance.yahoo.com/v1/finance/search?q={SYMBOL}&newsCount=8` | News headlines + video links, company name for the YouTube query |
| Transcript pipeline (`npm run train` / `npm run fetch-transcripts`) | `scripts/fetch-transcripts.mjs`, `scripts/build-tone.mjs` | `https://www.alphavantage.co/query?function=EARNINGS_CALL_TRANSCRIPT&symbol={SYMBOL}&quarter={YYYY}Q{n}` | Earnings-call transcripts → one tone score per call (see "Earnings-call tone" below) |

Notes:

- **API keys** — Yahoo needs none. The Alpha Vantage key (`ALPHAVANTAGE_API_KEY`)
  is only used locally by `npm run fetch-transcripts`; it is never sent to the browser.
  `/api/earnings` no longer calls FMP.
- **Offline vs live** — `/api/predict` and `/api/dataset-index` never touch the
  network; the numbers only change after `npm run train` is re-run.
- **Resilience** — Yahoo calls send a browser User-Agent, time out after 10s and
  retry once. `/api/quote` returns `502` on failure; `/api/earnings` falls back
  to empty news/videos and caches each symbol's response in memory for 10 min.
- `lib/yahoo.ts` also has `fetchQuoteSummary()` (cookie + crumb flow for the
  `quoteSummary` endpoint); it is not used by any route at the moment.

### When do the JSON artifacts update?

**Only manually.** There is no cron job, GitHub Action or scheduled function —
`data/results/*.json` change only when someone runs `npm run train` and commits
the result. Until then the dashboard keeps showing the data (and the 60-day
forecast) from the last training run.

What `npm run train` does:

1. `scripts/train-all.mjs` starts one Node process per stock (AAPL, MSFT,
   NVDA, TSLA), each running `scripts/train-models.mjs --stock <SYMBOL>`.
2. `fetchTenYearChart()` downloads 10 years of daily data from
   `https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}?range=10y&interval=1d`
   (4 attempts, 20s timeout each — internet is needed for this step only).
3. `buildSeries()` keeps date / close / volume per trading day; the models are
   trained and evaluated, and the 60-day forecast is generated.
4. The result is written to `data/results/<SYMBOL>.json`, then
   `scripts/build-index.mjs` rebuilds `data/results/_index.json`.

Takes ~7-10 minutes. After that:

- **Local dev** — `/api/predict` serves the new files right away (dev server
  reloads them).
- **Vercel** — the JSON is bundled at build time, so commit + push the updated
  files; the new data goes live after the redeploy.
- **README** — metrics change with the new data, so update the results table
  above as well.

To see how fresh the current data is, check `generatedAt` and `dataPeriod.end`
in any `data/results/<SYMBOL>.json` (or in `_index.json`).

## FAQ — transcript, training data, fetch code

### Earnings-call tone — how are transcripts used?

Each earnings call is turned into one **tone** number in [−1, +1]:

1. `npm run fetch-transcripts` downloads the transcript of every quarter (2016 Q3 →
   last completed quarter) from Alpha Vantage (`EARNINGS_CALL_TRANSCRIPT`) and caches the raw
   JSON in `data/transcripts/<SYMBOL>/`. It is resumable and stops when the daily quota is hit.
2. `npm run build-tone` (also run first by `npm run train`) scores each transcript with a
   finance word list (`scripts/lib/tone.mjs`): `tone = (positive − negative) / (positive + negative)`.
   Result: `data/transcripts/<SYMBOL>.tone.json` (small, committed).
3. `scripts/train-models.mjs` trains each model twice: **price only** and **price + tone**.
   The tone is applied from the trading day *after* the call and held until the next call,
   so the model never sees a call before it happened. Results are shown on the Results tab
   ("Does the Earnings-Call Tone Help?").

The word list is a compact subset written for this thesis, not the full published dictionary.
Quarters with no transcript are neutral (tone 0).

### Is the news data used to train the models?

**No.** News headlines and the "Audio" sentiment are display-only. The only thing taken from
transcripts is the tone above. The price models use the **daily close** (plus tone in the
transcript run); the 60-day window of scaled closes is the input and the next day's close is
the target (`buildSeries()` and `trainOneModel()`). Volume is stored for display only.

### Where in the code is the data fetched?

| Step | File (lines) | What it does |
| --- | --- | --- |
| Browser → API routes | `app/page.tsx` (108, 123, 130-133) | `fetchApi()` calls `/api/predict`, `/api/dataset-index`, `/api/quote`, `/api/earnings` |
| Trained results | `app/api/predict/route.ts`, `app/api/dataset-index/route.ts` | Import `data/results/*.json` — no network call |
| Shared Yahoo fetch | `lib/yahoo.ts` (`safeFetch` 12, `fetchChart` 88, `fetchSearch` 151) | Browser User-Agent, 10s timeout, 1 retry |
| Live price | `app/api/quote/route.ts` → `fetchChart(symbol, "5d", "1d")` | Yahoo chart API → price, previous close, % change |
| News + videos | `app/api/earnings/route.ts` → `fetchSearch(symbol)` | Yahoo search API → headlines and video links |
| Transcript (tone) | `scripts/fetch-transcripts.mjs`, `scripts/build-tone.mjs` | Alpha Vantage `EARNINGS_CALL_TRANSCRIPT` → one tone score per call (local, used for training only) |
| Training data | `scripts/train-models.mjs` (`fetchTenYearChart`, 122-145) | Yahoo chart API, 10y daily → model training |

### How does the "audio" data work?

**Short answer: no real audio is downloaded, played or processed.** There is no
audio-fetching, speech-to-text or audio-parsing code in the project. Everything
labelled "audio" on the dashboard is derived from **news / video headlines**
returned by Yahoo Finance search.

```
Yahoo search API  /v1/finance/search?q={SYMBOL}&newsCount=8&videosCount=0
   │  lib/yahoo.ts → fetchSearch()          (title, publisher, link per item)
   ▼
/api/earnings  (app/api/earnings/route.ts, lines 101-112)
   │  link contains "/video/" or publisher contains "Video" → videos (max 4)
   │  everything else                                       → news   (max 5)
   ▼
app/page.tsx (lines 141-149)
   │  titles = videos + news
   │  files = titles.length · hours = files × 2 · sentiment = classifySentiment(titles)
   ▼
KpiRow "Audio Files"  +  DataAudioCard "Data & Audio Summary"
```

| Dashboard field | How it is computed | Code |
| --- | --- | --- |
| Audio Files (KPI row) | Number of news + video headlines (0-9) | `app/page.tsx` 141-149 → `components/dashboard/KpiRow.tsx` 65-69 |
| Audio / Media Files | Same count as above | `components/dashboard/DataAudioCard.tsx` |
| Audio Duration (est.) | `files × 2` hours — assumes a recorded earnings webcast is ~2 h; not measured | `app/page.tsx` line 146 |
| Headline Sentiment | Keyword count per headline: each positive word (beat, surge, growth…) +1, each negative word (miss, fall, loss…) −1; score > 0 → positive, < 0 → negative, else neutral; shown as % of headlines | `lib/sentiment.ts` |
| Transcript | Not shown on the audio card; used for training only, as the tone score (see the tone FAQ above) | `scripts/build-tone.mjs` |

Notes:

- Yahoo is asked for `videosCount=0`, so "videos" are just news items whose
  link looks like a video page — no audio/video stream is fetched.
- `/api/earnings` also returns `youtubeQuery` (e.g. "Apple Inc. AAPL earnings
  call"), but the UI does not use it.
- The sentiment is a simple word list, not an NLP model, and it runs on
  headlines only. None of this data is used in model training.

To work with **real** earnings-call audio you would need to: (1) get the
audio/webcast URL for each call (e.g. from the company's investor-relations page
or a paid data provider), (2) convert speech to text (e.g. with a Whisper
model), and (3) run sentiment on that transcript. Transcripts are already fetched
through Alpha Vantage for the tone model (see the tone FAQ above); the audio card
itself still shows only news/video counts.

## Structure

```
scripts/
  train-models.mjs      SRNN/GRU/LSTM training pipeline (fetch → split → train → evaluate → write)
  check-gradients.mjs   finite-difference verification of the BPTT implementations
  build-index.mjs       rebuilds data/results/_index.json after per-stock runs
  fetch-transcripts.mjs downloads earnings-call transcripts (Alpha Vantage, needs ALPHAVANTAGE_API_KEY)
  build-tone.mjs       transcripts → one tone score per call (data/transcripts/<SYMBOL>.tone.json)
  lib/tone.mjs         finance word-list tone scorer
data/results/           committed artifacts (one JSON per stock + _index.json)
app/
  page.tsx              dashboard (header, sidebar tabs, all sections)
  layout.tsx, globals.css
  api/predict/route.ts        serves the trained artifacts
  api/dataset-index/route.ts  serves the cross-stock summary
  api/quote/route.ts          live Yahoo rate
  api/earnings/route.ts       news + video links (audio summary card)
components/dashboard/
  Sidebar.tsx           section navigation (Overview … About)
  KpiRow.tsx            5 KPI cards (data, records, audio, horizon, models)
  charts.tsx            history+prediction chart, next-60 chart, test-set chart
  tables.tsx            performance comparison + prediction tables
  DataAudioCard.tsx     data & audio summary
  tabs.tsx              Data Info / Models / Predictions / Results / About
  icons.tsx, ui.tsx     icons and shared UI helpers
lib/
  yahoo.ts              Yahoo fetch helpers (chart endpoint, retries)
  sentiment.ts          keyword sentiment for headlines
  types.ts              shared types
backend/                (legacy Python FastAPI service — not required; kept for reference)
```

## Workflow

This section explains, step by step, what happens when the app runs.

### 0. The big picture

```
Browser (http://localhost:3000)
   │  picks a stock and a tab
   ▼
Next.js frontend (app/page.tsx)
   │  fetch("/api/predict?symbol=…")   ← artifact with everything the charts need
   │  + optional /api/quote and /api/earnings (side data, non-blocking)
   ▼
API routes (app/api/*)
   │  predict / dataset-index  → read the precomputed JSON artifacts
   │  quote / earnings         → call Yahoo Finance live
   ▼
React renders the dashboard
```

The heavy lifting (model training) happens **offline** via `npm run train`;
the running app only serves the committed artifacts, which is why it is fast
and works on Vercel without any ML runtime.

### 1. Selecting a stock

The header dropdown lists the four trained stocks (AAPL, MSFT, NVDA, TSLA).
Switching a symbol re-fetches `/api/predict` — a few dozen KB of JSON, so
tab switches are instant. The **Data Period** dropdown zooms the main chart
(1/3/5/10 years) without refetching.

### 2. The experiment pipeline (`npm run train`)

1. **Fetch** — `scripts/train-models.mjs` downloads 10y of daily closes per
   stock from Yahoo's chart endpoint (retries on flaky networks).
2. **Split** — the first 80% of records train the models; the last 20% are
   held out. The scaler is fitted on train prices only.
3. **Windowing** — each training sample is a 60-day close window mapped to
   the next day's close.
4. **Train** — SRNN, GRU and LSTM (hidden 32, Adam, 20 epochs, batch 32,
   clipped gradients, fixed seeds) — identical budget for a fair comparison.
5. **Evaluate** — one-step-ahead predictions on the test segment; RMSE, MAE,
   MAPE and R² are computed on real (inverse-scaled) prices.
6. **Forecast** — each model predicts day+1 from the last 60 closes, its
   prediction is appended to the window, and the process repeats for 60
   trading days (this is what makes the three dashed paths diverge).
7. **Write** — `data/results/<SYMBOL>.json` (history, metrics, test series,
   future forecast) and `_index.json` (cross-stock summary).

### 3. Rendering the dashboard

- **Overview tab** — KPI row (period, records, audio files, horizon, models),
  the main chart (historical black line + three dashed model forecasts, with
  a vertical marker and "Next 60 Days" label), the next-60-days panel, the
  performance comparison table (best value bold per column), the data & audio
  summary, and a sample of the 60-day prediction table.
- **Data Info** — dataset facts, the train/test split with dates, and the
  stock-selection criteria table (annual volatility, 10-year change, price
  range) plus the live rate from Yahoo.
- **Models** — the three architectures and the shared training configuration.
- **Predictions** — the full 60-day table and a larger forecast chart.
- **Results** — metrics table, the test-set actual-vs-predicted chart, and
  the best model per stock.
- **About** — methodology recap and the disclaimer.

### 4. Side data (optional, non-blocking)

`/api/quote` (live rate shown on Data Info) and `/api/earnings` (counts the
media items for the Audio Files card; sentiment is a simple keyword classifier
over headlines) call Yahoo at request time. If they fail, the dashboard still
renders fully — those cards show "—".

### 5. Resilience

- Artifacts are static — the core dashboard never depends on Yahoo.
- Live calls have 10s timeouts with one retry.
- Bad symbols return a clear 404 with the list of available stocks.
--------------------------------------------------------------

1. Transcript kyun nahi aa raha? ChatGPT sahi keh raha hai. Maine aapki .env.local wali FMP key se API ko direct call karke check kiya:

Code jo purana v3 transcript endpoint call karta hai, wo 403 "Legacy Endpoint" error deta hai. Ye endpoint sirf un users ke liye hai jinka subscription 31 Aug 2025 se pehle ka hai.
FMP ka naya endpoint 402 "Restricted" deta hai, yaani transcript ke liye paid plan chahiye.
Isliye API response me transcript: null aata hai.
Dashboard par transcript dikhane wala koi component bhi nahi hai. "Audio Files" card sirf news aur video ke titles ginta hai, aur "hours" sirf ek andaza hai (files × 2).
2. Kya transcript ya news model training me use hota hai? Nahi. SRNN, GRU aur LSTM sirf daily close price par train hote hain: pichhle 60 din ke close se agle din ka close predict hota hai. News, sentiment aur transcript sirf dashboard par dikhane ke liye hain. Training, results aur forecast me inka koi role nahi hai. Thesis me bhi ye clearly likhna theek rahega.

3. API se data fetch karne wala code kahan hai?

Browser se API call: app/page.tsx:108-133
Yahoo se data lene wale functions: lib/yahoo.ts (fetchChart, fetchSearch)
Live price: app/api/quote/route.ts
News aur transcript: app/api/earnings/route.ts
Training ke liye Yahoo se data: scripts/train-models.mjs:122-145
README me inki puri table hai, kis line par kya hota hai.

Transcript chahiye to teen kaam karne padenge: FMP ka paid plan lena, code ko naye stable endpoint par shift karna, aur transcript dikhane ke liye UI component banana. Agar aap chahte ho to code wala hissa main kar deta hoon.

README edit ke time file disk par kisi aur ne bhi change ki thi (shayad aapne). Mera section sahi jagah add ho gaya hai, par README ko preview me render karke check nahi kiya hai.



