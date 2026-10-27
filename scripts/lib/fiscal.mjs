/**
 * Fiscal-quarter helpers for earnings calls.
 *
 * Alpha Vantage labels transcripts by FISCAL quarter (e.g. NVDA "2024Q1" is the
 * quarter ending April 2023), and its response has no call date. So the call
 * date is estimated as fiscal quarter end + 45 days. Real calls usually come
 * 3–5 weeks after quarter end, so the estimate is conservative: the model never
 * sees a call before it could have happened.
 */

/** Month (1–12) in which each company's fiscal year ends. */
export const FISCAL_YEAR_END_MONTH = {
  AAPL: 9, // late September
  MSFT: 6, // June
  NVDA: 1, // late January
  TSLA: 12, // December (calendar year)
};

const CALL_LAG_DAYS = 45;
const REPORTED_LAG_DAYS = 25; // treat a quarter as reported this long after its end
const FIRST_CALL_WINDOW = Date.UTC(2016, 5, 1); // 2016-06-01, covers the 10y window start

/**
 * Last day of the fiscal quarter, as a UTC Date.
 * @param {string} symbol  e.g. "NVDA"
 * @param {number} fy      fiscal year label used by Alpha Vantage (e.g. 2024)
 * @param {number} q       fiscal quarter 1–4
 */
export function fiscalQuarterEnd(symbol, fy, q) {
  const fyEnd = FISCAL_YEAR_END_MONTH[symbol];
  if (!fyEnd) throw new Error(`No fiscal year-end month configured for ${symbol}`);
  // Each quarter ends 3 months apart; Q4 ends in the fiscal year-end month itself.
  let month = fyEnd - 3 * (4 - q);
  let year = fy;
  if (month < 1) {
    month += 12;
    year -= 1;
  }
  // Date.UTC(year, month, 0) = last day of `month` (month is 1-based here).
  return new Date(Date.UTC(year, month, 0));
}

/** Estimated call date: quarter end + 45 days, as YYYY-MM-DD. */
export function estimatedCallDate(symbol, fy, q) {
  const d = fiscalQuarterEnd(symbol, fy, q);
  d.setUTCDate(d.getUTCDate() + CALL_LAG_DAYS);
  return d.toISOString().slice(0, 10);
}

/**
 * Fiscal quarters whose calls fall inside the 10-year window and that should
 * already be reported by `now`. Oldest first.
 * @returns {{ year: number, quarter: number, quarterEnd: string, callDate: string }[]}
 */
export function quarterList(symbol, now = new Date()) {
  const out = [];
  const nowMs = now.getTime();
  for (let fy = 2015; fy <= 2028; fy++) {
    for (let q = 1; q <= 4; q++) {
      const end = fiscalQuarterEnd(symbol, fy, q);
      const reportedAt = end.getTime() + REPORTED_LAG_DAYS * 86_400_000;
      const callMs = end.getTime() + CALL_LAG_DAYS * 86_400_000;
      if (callMs < FIRST_CALL_WINDOW) continue;
      if (reportedAt > nowMs) continue;
      out.push({
        year: fy,
        quarter: q,
        quarterEnd: end.toISOString().slice(0, 10),
        callDate: estimatedCallDate(symbol, fy, q),
      });
    }
  }
  return out;
}
