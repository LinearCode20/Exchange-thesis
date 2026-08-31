"""Linear-regression trend projection - a naive statistical estimate, NOT a
prediction of the market."""

from __future__ import annotations

from datetime import datetime, timedelta

FIT_WINDOW = 63  # ~3 months of trading days the trend is fit on
HORIZON = 21  # ~1 month of trading days to project
DAY = timedelta(days=1)


def linear_forecast(history: list[dict]) -> dict:
    closes = [h["close"] for h in history[-FIT_WINDOW:]]
    n = len(closes)

    mean_x = (n - 1) / 2
    mean_y = sum(closes) / n

    num = sum((i - mean_x) * (closes[i] - mean_y) for i in range(n))
    den = sum((i - mean_x) ** 2 for i in range(n))
    slope = 0 if den == 0 else num / den
    intercept = mean_y - slope * mean_x

    ss = sum((closes[i] - (intercept + slope * i)) ** 2 for i in range(n))
    sigma = (ss / (n - 2)) ** 0.5 if n > 2 else 0

    cursor = datetime.strptime(history[-1]["date"], "%Y-%m-%d")
    points = []
    for k in range(1, HORIZON + 1):
        cursor += DAY
        while cursor.weekday() >= 5:  # skip Sat/Sun
            cursor += DAY
        price = intercept + slope * (n - 1 + k)
        points.append(
            {
                "date": cursor.strftime("%Y-%m-%d"),
                "price": price,
                "low": price - sigma,
                "high": price + sigma,
            }
        )

    last = points[-1]
    last_close = closes[-1]
    return {
        "points": points,
        "endPrice": last["price"],
        "endLow": last["low"],
        "endHigh": last["high"],
        "changePct": (last["price"] - last_close) / last_close * 100,
        "windowDays": n,
        "sigma": sigma,
    }
