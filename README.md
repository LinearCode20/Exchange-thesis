# Stock Prediction Dashboard (Thesis)

Compares stock-price prediction models — **SRNN (baseline)** vs **GRU & LSTM (proposed)** —
on 10 years of daily prices for four stocks (AAPL, MSFT, NVDA, TSLA). Each model is
trained on historical closes, optionally with an **earnings-call tone** score, and
predicts the next day's close and a 60-trading-day path.

Built with Next.js, React, Tailwind and Recharts. **Not financial advice** — thesis and
educational use only.

---

## Summary

- **What it does:** shows historical prices, model predictions (next day and a 60-day path),
  metrics, and an ablation that asks whether the earnings-call tone helps.
- **What the models predict:** the **price level** (next-day close). They do **not** predict
  direction reliably.
- **Data:** 10 years of daily closes (Yahoo Finance) plus one **tone** number per fiscal
  quarter, from earnings-call transcripts (Alpha Vantage).
- **Results:** GRU is the strongest learned model. Adding the tone helps GRU slightly and hurts
  LSTM slightly, in single-seed runs. A naive "tomorrow = today" baseline (PERSIST) still beats
  every model. See [Results](#results).
- **Status:** all 168 transcripts (4 stocks × 42 fiscal quarters) are cached and the models are
  retrained with them. Changes are on branch `transcript-tone-model`, not pushed yet.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

No key is needed to run the dashboard: the trained results are committed in `data/results/`.

## Commands

| Command | What it does | Needs |
| --- | --- | --- |
| `npm run dev` | Starts the dashboard | — |
| `npm run build` | Production build | — |
| `npm run fetch-transcripts` | Downloads earnings-call transcripts (resumable, stops at the daily quota) | `ALPHAVANTAGE_API_KEY` in `.env.local` |
| `npm run build-tone` | Scores transcripts into one tone number per call; prints coverage | cached transcripts |
| `npm run train` | Runs `build-tone`, then retrains all four stocks (price-only and price+tone), ~15–20 min | Yahoo access |
| `npm run check-gradients` | Verifies the hand-written backprop against finite differences (D=1 and D=2) | — |

Before `npm run train`, commit your current `data/results/` (it is overwritten). Train only when
transcript coverage is high, because a quarter with no transcript counts as a neutral tone.

## How it works

### 1. Two kinds of data

| Layer | When | Data |
| --- | --- | --- |
| **Offline (committed)** | Only when you run `npm run train` | `data/results/<SYMBOL>.json`: price history, metrics, test predictions, 60-day forecast. `_index.json`: summary across stocks. |
| **Live (per request)** | Every time the page loads | Current price from Yahoo (`/api/quote`) and news and video headlines from Yahoo search (`/api/earnings`) |

The dashboard reads the offline files. The live calls only fill the small side cards and the
Data Info "Live rate". Nothing on the charts depends on a live call, so the app works when
Yahoo is down.

### 2. Where each piece of data comes from

| Data | Source | Code | Shown where |
| --- | --- | --- | --- |
| 10 years of daily close and volume | Yahoo chart API (`range=10y&interval=1d`) | `scripts/train-models.mjs` (`fetchTenYearChart`) | Main chart (black line), Predictions, Data Info |
| Model predictions and 60-day forecast | Trained models | `scripts/train-models.mjs` | Dashed model lines, Predictions, Results |
| Metrics (RMSE, MAE, MAPE, R²) | Computed on the test set | `computeMetrics()` | Results and Overview tables |
| Earnings-call transcripts | Alpha Vantage `EARNINGS_CALL_TRANSCRIPT`, one fiscal quarter per request | `scripts/fetch-transcripts.mjs` | Cached in `data/transcripts/` (raw, not committed) |
| Tone score per call | Word count on the transcript | `scripts/lib/tone.mjs`, `scripts/build-tone.mjs` | `data/transcripts/<SYMBOL>.tone.json` (committed); Data Info call table; Results ablation |
| Call date (estimate) | Fiscal quarter end + 45 days | `scripts/lib/fiscal.mjs` | Data Info "Date source" column |
| Live price and % change | Yahoo chart API (`range=5d`) | `app/api/quote/route.ts` | Data Info "Live rate" |
| News and video headlines | Yahoo search API | `app/api/earnings/route.ts` | "Audio Files" KPI, "Data & Audio Summary" card |
| Headline sentiment | Keyword count on headlines | `lib/sentiment.ts` | "Headline Sentiment" in the audio card |

### 3. The earnings-call tone (how the transcript is used)

1. **Download.** `fetch-transcripts` requests each **fiscal** quarter in the 10-year window.
   Alpha Vantage labels quarters by fiscal year: NVDA `2024Q1` is the quarter ending April 2023.
   Fiscal year ends: AAPL September, MSFT June, NVDA January, TSLA December.
2. **Score.** Each transcript is scored with a finance word list:
   `tone = (positive words − negative words) / (positive + negative)`, a value from −1 to +1.
   The word list is a compact subset written for this thesis, not the full published dictionary.
3. **Date.** Alpha Vantage does not return the call date, so the date is estimated as
   fiscal quarter end + 45 days. This is conservative, so the model never sees a call before it
   could have happened. The `EARNINGS` endpoint does return real `reportedDate` values; the
   pipeline does not use them yet.
4. **Daily signal.** The tone applies from the trading day **after** the call and stays until the
   next call. Before the first call it is 0 (neutral).
5. **Model input.** Each day becomes `[scaled close, tone]` (2 numbers). The model reads 60 days
   of these and predicts the next day's close.
6. **Forecast.** During the 60-day forecast, the tone stays at the last known value, because future
   calls are unknown.

Every stock is trained twice: **price only** and **price + tone**. The dashboard shows the
price + tone run as the primary result, and the price-only run as the ablation.

### 4. The models

| | SRNN (baseline) | GRU (proposed) | LSTM (proposed) |
| --- | --- | --- | --- |
| Type | Simple (Elman) RNN | Gated Recurrent Unit | Long Short-Term Memory |
| Role | Baseline | Proposed | Proposed |

**Shared protocol (identical for all models):**

- **Split:** chronological 80/20. The test segment always lies after the training segment.
- **Scaling:** MinMax fitted on the training closes only (no leakage).
- **Window:** 60 trading days → next-day close.
- **Training:** Adam (lr 0.001), batch 32, 20 epochs, 32 hidden units, gradient-norm clip 1.0,
  fixed seeds.
- **Evaluation:** one-step-ahead predictions on the test segment (RMSE, MAE, MAPE, R²).
- **Forecast:** 60 days, generated iteratively. Each prediction is appended to the window.

The three architectures are implemented from scratch in plain JavaScript (`scripts/train-models.mjs`)
with full backpropagation through time. `npm run check-gradients` verifies every gradient against
finite differences; the worst relative error is below 1e-6 for both feature sets.

## Results

Test-set R² for the **price + tone** models (primary run). Data: 2016-11 → 2026-11.

| Stock | SRNN R² | GRU R² | LSTM R² | PERSIST R² |
| --- | --- | --- | --- | --- |
| AAPL | 0.863 | **0.973** | 0.936 | 0.989 |
| MSFT | 0.939 | **0.961** | 0.924 | 0.976 |
| NVDA | 0.856 | **0.950** | 0.920 | 0.983 |
| TSLA | 0.901 | **0.939** | 0.886 | 0.951 |

**Tone ablation** (same models; Δ = price+tone R² minus price-only R², so a positive Δ means the tone helped):

| Stock | SRNN Δ | GRU Δ | LSTM Δ |
| --- | --- | --- | --- |
| AAPL | −0.004 | +0.013 | −0.014 |
| MSFT | +0.013 | +0.004 | −0.016 |
| NVDA | −0.073 | +0.027 | −0.026 |
| TSLA | −0.010 | +0.014 | −0.017 |

**How to read these numbers:**

- **GRU is the best learned model on every stock**, and its R² rises with the tone on every stock.
  LSTM's R² falls on every stock. Both are single-seed runs on four stocks, so differences of about
  ±0.01 are within what another seed could change. Treat the pattern as suggestive, not proven.
- **PERSIST** (tomorrow's price = today's close) has a higher R² than every model. The R² values
  look high mainly because prices change slowly, not because the models predict well.
- **Direction is close to a coin flip.** On the test sets, the models predict the sign of the next
  day's move correctly about 47–51% of the time. A rule that always says "up" gets 50–54%, depending
  on the stock (the share of up days in the test set), so the models do no better than that rule.
- **Event study (tone vs price after the call).** Using the reported dates from Alpha Vantage's
  `EARNINGS` endpoint, the correlation between a call's tone and the next day's return is 0.16
  (160 calls). Over three days it is 0.07. Per stock it ranges from −0.13 (AAPL) to +0.24 (MSFT).
  This is weak and inconsistent, and not enough to predict prices. This check is not in the
  repository yet.

## What the models can and cannot do

- They predict a **price level**, one day ahead. The 60-day path is a model extrapolation, and its
  error grows with the horizon.
- They do **not** predict whether the price will go up or down with reliable accuracy.
- The tone is a single number per quarter, held for about three months, so it carries no daily
  information. It cannot represent a one-day reaction to a call.
- The tone comes from a simple word list, and most values are positive (per-stock means 0.39 to
  0.75), so the feature has little variance.

## Limitations and known issues

- **Call dates are estimated** (+45 days). The reported dates are available from Alpha Vantage's
  `EARNINGS` endpoint and would be more accurate.
- The most recent quarters (AAPL 2026 Q4, MSFT 2027 Q1, TSLA 2026 Q3) have an estimated call date of
  14 Nov 2026, which is after the last trading day in the data, so their tone is not used yet.
- **Single seed.** The ablation differences need multiple seeds before any claim is made.
- **Tone is not a sentiment model.** It is a word count; there is no NLP model and no audio is
  processed.
- **The tables are not comparable with older versions of this README:** the 10-year window has moved
  forward, and the tone feature has been added.
- **`FMP_API_KEY`** in `.env.example` is no longer used by the code.

## Deploying to Vercel

Push to GitHub and import the repository on [vercel.com](https://vercel.com). No configuration is
needed. The API routes are serverless functions, and the committed JSON artifacts are bundled with
them. No API key is needed on Vercel. Vercel cannot run training (it has a time limit and a read-only
filesystem), so retrain locally and commit the updated `data/results/` files.

## API routes

| Route | Purpose |
| --- | --- |
| `GET /api/predict?symbol=AAPL` | Full artifact: history, metrics, test predictions, 60-day forecast, tone calls |
| `GET /api/dataset-index` | Cross-stock dataset and metrics summary |
| `GET /api/quote?symbol=AAPL` | Live price from Yahoo Finance (Data Info tab) |
| `GET /api/earnings?symbol=AAPL` | News and video links (audio summary card) |

Bad symbols return a 404 with the list of available stocks. Live calls have a 10-second timeout and
one retry. `/api/earnings` caches each symbol for 10 minutes.

## Project structure

```
scripts/
  train-models.mjs        SRNN / GRU / LSTM training (price-only and price+tone), evaluation, forecast
  train-all.mjs           runs train-models for all stocks in parallel, then build-index
  check-gradients.mjs     finite-difference check of the backprop (D=1 and D=2)
  build-index.mjs         rebuilds data/results/_index.json
  fetch-transcripts.mjs   earnings-call transcripts from Alpha Vantage (resumable)
  build-tone.mjs          transcripts → one tone number per call, with coverage report
  lib/fiscal.mjs          fiscal year-ends, quarter ends, estimated call dates
  lib/tone.mjs            word-list tone scorer
data/
  results/                committed training artifacts (one JSON per stock + _index.json)
  transcripts/
    <SYMBOL>.tone.json    committed tone per call
    <SYMBOL>/             raw transcripts (git-ignored)
app/
  page.tsx                dashboard shell (header, sidebar, all sections)
  api/predict/            serves a stock's artifact
  api/dataset-index/      serves the cross-stock summary
  api/quote/              live price (Yahoo)
  api/earnings/           news and video links (Yahoo)
components/dashboard/
  tabs.tsx                Data Info, Models, Predictions, Results, About
  charts.tsx              history + prediction chart, 60-day chart, test-set chart
  KpiRow.tsx, DataAudioCard.tsx, tables.tsx, Sidebar.tsx, ui.tsx, icons.tsx
lib/
  types.ts                shared types
  yahoo.ts                Yahoo fetch helpers
  sentiment.ts            keyword sentiment for headlines
backend/                  legacy Python service, not used; kept for reference
```

## Environment

| Variable | Used by | Where |
| --- | --- | --- |
| `ALPHAVANTAGE_API_KEY` | `fetch-transcripts` only | `.env.local` on your machine. Never sent to the browser. |

Yahoo needs no key.
