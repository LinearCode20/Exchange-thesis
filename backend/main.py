"""Stock Dashboard API - FastAPI backend (replaces the old Next.js API routes).

Run from this folder:
    uvicorn main:app --port 8000        (or simply:  python main.py)

The Next.js frontend proxies /api/* here (see next.config.ts), so the browser
keeps using relative URLs like /api/stock?symbol=AAPL.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import earnings
from forecast import linear_forecast
from yahoo import fetch_chart, fetch_quote_summary, iso_date_from_timestamp

app = FastAPI(title="Stock Dashboard API")

# Handy if the frontend ever calls this server directly, bypassing the proxy.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"status": "ok", "service": "stock-dashboard-api"}


@app.get("/api/stock")
def get_stock(request: Request):
    symbol = (request.query_params.get("symbol") or "").strip().upper()
    if not symbol:
        return JSONResponse(
            status_code=400, content={"error": "A stock symbol is required."}
        )

    try:
        chart = fetch_chart(symbol)
        meta, timestamps, quote = chart["meta"], chart["timestamp"], chart["quote"]
        opens = quote.get("open") or []
        highs = quote.get("high") or []
        lows = quote.get("low") or []
        closes = quote.get("close") or []
        volumes = quote.get("volume") or []

        history: list[dict] = []
        for i, ts in enumerate(timestamps):
            close = closes[i] if i < len(closes) else None
            if close is None:
                continue
            history.append(
                {
                    "date": iso_date_from_timestamp(ts),
                    "open": opens[i] if i < len(opens) and opens[i] is not None else close,
                    "high": highs[i] if i < len(highs) and highs[i] is not None else close,
                    "low": lows[i] if i < len(lows) and lows[i] is not None else close,
                    "close": close,
                    "volume": volumes[i] if i < len(volumes) and volumes[i] is not None else 0,
                }
            )
        if not history:
            raise RuntimeError("No historical data returned for this symbol.")
        last = history[-1]

        # Yesterday's close = the candle before the latest one.
        previous_close = (
            history[-2]["close"] if len(history) > 1 else meta.get("chartPreviousClose")
        )

        # Earnings calendar (optional - the page still works without it).
        next_date = last_call_date = eps_estimate = revenue_estimate = None
        is_estimate = False
        try:
            summary = fetch_quote_summary(symbol, "calendarEvents") or {}
            cal = summary.get("calendarEvents") or {}
            cal_earnings = cal.get("earnings") or {}
            dates = cal_earnings.get("earningsDate") or []
            call_dates = cal_earnings.get("earningsCallDate") or []
            next_date = (dates[0] if dates else {}).get("fmt")
            last_call_date = (call_dates[0] if call_dates else {}).get("fmt")
            is_estimate = bool(cal_earnings.get("isEarningsDateEstimate"))
            eps_estimate = (cal_earnings.get("earningsAverage") or {}).get("raw")
            revenue_estimate = (cal_earnings.get("revenueAverage") or {}).get("raw")
        except Exception:
            pass  # calendar is a nice-to-have; ignore failures

        market_time = meta.get("regularMarketTime") or 0
        return {
            "meta": {
                "symbol": meta.get("symbol"),
                "companyName": meta.get("longName") or meta.get("shortName") or symbol,
                "currency": meta.get("currency") or "USD",
                "exchangeName": meta.get("fullExchangeName")
                or meta.get("exchangeName")
                or "",
                "price": meta.get("regularMarketPrice")
                if meta.get("regularMarketPrice") is not None
                else last["close"],
                "previousClose": previous_close,
                "dayHigh": meta.get("regularMarketDayHigh")
                if meta.get("regularMarketDayHigh") is not None
                else last["high"],
                "dayLow": meta.get("regularMarketDayLow")
                if meta.get("regularMarketDayLow") is not None
                else last["low"],
                "fiftyTwoWeekHigh": meta.get("fiftyTwoWeekHigh") or 0,
                "fiftyTwoWeekLow": meta.get("fiftyTwoWeekLow") or 0,
                "volume": meta.get("regularMarketVolume")
                if meta.get("regularMarketVolume") is not None
                else last["volume"],
                "marketTime": datetime.fromtimestamp(market_time, tz=timezone.utc)
                .isoformat(timespec="milliseconds")
                .replace("+00:00", "Z"),
            },
            "history": history,
            "forecast": linear_forecast(history),
            "earnings": {
                "nextDate": next_date,
                "isEstimate": is_estimate,
                "lastCallDate": last_call_date,
                "epsEstimate": eps_estimate,
                "revenueEstimate": revenue_estimate,
            },
        }
    except Exception as exc:
        return JSONResponse(
            status_code=502,
            content={"error": str(exc) or "Failed to load stock data."},
        )


@app.get("/api/earnings")
def get_earnings(request: Request):
    symbol = (request.query_params.get("symbol") or "").strip().upper()
    if not symbol:
        return JSONResponse(
            status_code=400, content={"error": "A stock symbol is required."}
        )
    return earnings.get_earnings(symbol)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
