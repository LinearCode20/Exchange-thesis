# Stock Prediction Dashboard (Thesis)

Compare stock-price prediction models — **SRNN (baseline)** vs **GRU & LSTM
(proposed)** — on a 10-year daily dataset for four stocks (AAPL, MSFT, NVDA,
TSLA), with an 80/20 chronological train/test split and a 60-trading-day
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
bundled with them. Optionally set `FMP_API_KEY` (Project → Settings →
Environment Variables) to enable transcript text on the earnings panel's data
source; everything else needs no key.

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
| `GET /api/earnings?symbol=AAPL` | Earnings-call media + transcript (audio summary card) |

## Structure

```
scripts/
  train-models.mjs      SRNN/GRU/LSTM training pipeline (fetch → split → train → evaluate → write)
  check-gradients.mjs   finite-difference verification of the BPTT implementations
  build-index.mjs       rebuilds data/results/_index.json after per-stock runs
data/results/           committed artifacts (one JSON per stock + _index.json)
app/
  page.tsx              dashboard (header, sidebar tabs, all sections)
  layout.tsx, globals.css
  api/predict/route.ts        serves the trained artifacts
  api/dataset-index/route.ts  serves the cross-stock summary
  api/quote/route.ts          live Yahoo rate
  api/earnings/route.ts       earnings-call media + transcript
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
