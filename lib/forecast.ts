import type { Forecast, ForecastPoint, HistoryPoint } from "./types";

const FIT_WINDOW = 63; // ~3 months of trading days the trend is fit on
const HORIZON = 21; // ~1 month of trading days to project

/**
 * Simple linear-regression trend projection ("least squares" line over the
 * last FIT_WINDOW daily closes, extended HORIZON trading days ahead).
 * The band is +/- one residual standard deviation of the fit.
 * This is a naive statistical estimate - NOT a prediction of the market.
 */
export function linearForecast(history: HistoryPoint[]): Forecast {
  const closes = history.slice(-FIT_WINDOW).map((h) => h.close);
  const n = closes.length;

  const meanX = (n - 1) / 2;
  const meanY = closes.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (closes[i] - meanY);
    den += (i - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;

  let ss = 0;
  for (let i = 0; i < n; i++) {
    ss += (closes[i] - (intercept + slope * i)) ** 2;
  }
  const sigma = n > 2 ? Math.sqrt(ss / (n - 2)) : 0;

  const lastDate = new Date(`${history[history.length - 1].date}T00:00:00Z`);
  const points: ForecastPoint[] = [];
  let cursor = lastDate;
  for (let k = 1; k <= HORIZON; k++) {
    do {
      cursor = new Date(cursor.getTime() + 86400000);
    } while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6);
    const price = intercept + slope * (n - 1 + k);
    points.push({
      date: cursor.toISOString().slice(0, 10),
      price,
      low: price - sigma,
      high: price + sigma,
    });
  }

  const last = points[points.length - 1];
  const lastClose = closes[closes.length - 1];
  return {
    points,
    endPrice: last.price,
    endLow: last.low,
    endHigh: last.high,
    changePct: ((last.price - lastClose) / lastClose) * 100,
    windowDays: n,
    sigma,
  };
}
