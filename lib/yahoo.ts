const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const BASE = "https://query1.finance.yahoo.com";
const TIMEOUT_MS = 10_000;

/**
 * GET with a hard timeout - on flaky networks a connect can hang for
 * minutes otherwise; this fails fast so the page can show an error.
 * One retry, since a dropped or timed-out attempt usually succeeds on retry.
 */
async function safeFetch(
  url: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  try {
    return await fetch(url, {
      headers: { "User-Agent": UA, ...headers },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return fetch(url, {
      headers: { "User-Agent": UA, ...headers },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }
}

/**
 * Yahoo's quoteSummary endpoint requires a cookie + crumb pair.
 * The pair is obtained once and reused until it stops working.
 */
let crumbCache: { crumb: string; cookie: string } | null = null;

async function getCrumb(): Promise<{ crumb: string; cookie: string }> {
  if (crumbCache) return crumbCache;

  // fc.yahoo.com answers 404 but sets the A3 cookie the crumb endpoint needs.
  const first = await safeFetch("https://fc.yahoo.com");
  const cookie = first.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

  const second = await safeFetch(`${BASE}/v1/test/getcrumb`, { Cookie: cookie });
  const crumb = (await second.text()).trim();

  if (!crumb || crumb.length > 40) {
    throw new Error("Could not obtain Yahoo Finance crumb");
  }
  crumbCache = { crumb, cookie };
  return crumbCache;
}

export async function resetCrumb() {
  crumbCache = null;
}

export interface YahooChartResult {
  meta: Record<string, unknown> & {
    symbol: string;
    currency: string;
    exchangeName: string;
    fullExchangeName?: string;
    regularMarketPrice: number;
    chartPreviousClose: number;
    regularMarketDayHigh?: number;
    regularMarketDayLow?: number;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
    regularMarketVolume?: number;
    regularMarketTime?: number;
    longName?: string;
    shortName?: string;
  };
  timestamp: number[];
  quote: {
    open: (number | null)[];
    high: (number | null)[];
    low: (number | null)[];
    close: (number | null)[];
    volume: (number | null)[];
  };
}

export async function fetchChart(
  symbol: string,
  range = "6mo",
  interval = "1d",
): Promise<YahooChartResult> {
  const res = await safeFetch(
    `${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`,
  );
  if (!res.ok) {
    throw new Error(`Yahoo chart request failed (${res.status})`);
  }
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) {
    throw new Error(`No data found for symbol "${symbol}"`);
  }
  return {
    meta: result.meta,
    timestamp: result.timestamp ?? [],
    quote: result.indicators?.quote?.[0] ?? { open: [], high: [], low: [], close: [], volume: [] },
  };
}

export async function fetchQuoteSummary(
  symbol: string,
  modules: string,
): Promise<Record<string, unknown> | null> {
  const makeRequest = async (crumb: string) => {
    const res = await safeFetch(
      `${BASE}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`,
      { Cookie: crumbCache?.cookie ?? "" },
    );
    return res;
  };

  let { crumb } = await getCrumb();
  let res = await makeRequest(crumb);

  // A stale cookie/crumb pair returns 401 - refresh once and retry.
  if (res.status === 401) {
    await resetCrumb();
    ({ crumb } = await getCrumb());
    res = await makeRequest(crumb);
  }
  if (!res.ok) return null;

  const json = await res.json();
  return json?.quoteSummary?.result?.[0] ?? null;
}

export interface YahooSearchResult {
  quotes: {
    symbol: string;
    shortname?: string;
    longname?: string;
  }[];
  news: {
    title: string;
    publisher: string;
    link: string;
  }[];
}

export async function fetchSearch(symbol: string): Promise<YahooSearchResult> {
  const res = await safeFetch(
    `${BASE}/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=8&videosCount=0&quotesCount=2`,
  );
  if (!res.ok) return { quotes: [], news: [] };
  const json = await res.json();
  return {
    quotes: json?.quotes ?? [],
    news: (json?.news ?? []).map(
      (n: { title?: string; publisher?: string; link?: string }) => ({
        title: n.title ?? "",
        publisher: n.publisher ?? "",
        link: n.link ?? "",
      }),
    ),
  };
}

export function isoDateFromTimestamp(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}
