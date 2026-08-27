# Stock Dashboard

A simple Next.js app: pick a ticker, press **Show data**, and get the current
rate, 6-month history with charts, a next-month trend projection, and earnings
call material (audio/video links + transcript text).

Built for thesis/educational purposes — **not financial advice**.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 (Next.js runs its own server — Apache/XAMPP is not
involved). Press `npm run build && npm start` for a production build.

## Features

- **Dropdown** with 15 tickers (AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, AMD,
  INTC, ADBE, NFLX, QCOM, CSCO, AVGO, PYPL) + submit button
- **Current day rate** — price, day change, day range, 52-week range, volume
- **Historical data** — 6 months of daily OHLCV in a chart (1M/3M/6M filter)
  and a recent-days table
- **Charts & analysis** — closing-price chart with a **next-month projection**
  (least-squares trend over the last ~3 months, ±1σ band), current rate card,
  next-earnings date & estimates
- **Earnings calls** — latest call date, listen on YouTube, recent stock videos
  and news, plus full transcript text (see below)

## Data sources (all free)

| Data | Source | Key needed |
| --- | --- | --- |
| Quotes, 6-month history, earnings dates/estimates | Yahoo Finance endpoints | No |
| Stock videos & news | Yahoo Finance search | No |
| Earnings-call **audio/video** | YouTube search link (full webcast recordings) | No |
| Earnings-call **transcript text** | [Financial Modeling Prep](https://site.financialmodelingprep.com/developer/docs) | Free key |

### Optional: transcript text

1. Create a free API key at financialmodelingprep.com
2. Put it in `.env.local`:
   ```
   FMP_API_KEY=your_key_here
   ```
3. Restart `npm run dev`

Without a key everything else works; the transcript card shows setup
instructions instead.

## Structure

```
app/
  page.tsx              Home page (dropdown + submit + all sections)
  layout.tsx, globals.css
  api/stock/route.ts    Quote + 6-month history + projection + earnings date
  api/earnings/route.ts Transcript + videos/news + YouTube search link
components/
  PriceChart.tsx        recharts chart (history + dashed projection)
  StatCard.tsx          KPI tiles
  HistoryTable.tsx      recent OHLCV table
  ForecastCard.tsx      next-month outlook + methodology
  EarningsPanel.tsx     transcript + audio/video/news
lib/
  yahoo.ts              Yahoo fetch helpers (incl. cookie/crumb flow)
  forecast.ts           linear-regression trend projection
  types.ts              shared types
```

## Notes

- The "next month" number is a plain linear-regression trend extended ~21
  trading days with a ±1σ band — a statistical exercise, not a prediction.
- Yahoo data can be delayed and endpoints are unofficial; if a request fails,
  the page shows an error banner — just retry.
