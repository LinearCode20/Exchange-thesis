/**
 * Downloads earnings-call transcripts from Alpha Vantage
 * (function=EARNINGS_CALL_TRANSCRIPT) and caches each raw response under
 *   data/transcripts/<SYMBOL>/<YYYY>Q<n>.json
 *
 * Resumable: quarters already on disk are skipped, so re-running after the
 * daily quota resets just continues where it stopped.
 *
 * Needs ALPHAVANTAGE_API_KEY in .env.local (never printed or committed).
 *
 * Usage:
 *   node scripts/fetch-transcripts.mjs                 # all stocks
 *   node scripts/fetch-transcripts.mjs --stock AAPL    # one stock
 *
 * Exit codes: 0 done, 2 endpoint is premium for this key, 3 daily quota hit.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { quarterList } from "./lib/fiscal.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_ROOT = path.join(ROOT, "data", "transcripts");
const STOCKS = ["AAPL", "MSFT", "NVDA", "TSLA"];
const SLEEP_MS = 13_000; // Alpha Vantage free tier: ~5 requests/minute
const RECENT_DAYS = 90; // an empty answer for a call this recent may just be "not published yet"

// ------------------------------------------------------------------ env --

/** Reads ALPHAVANTAGE_API_KEY from .env.local without echoing it. */
function loadKey() {
  if (process.env.ALPHAVANTAGE_API_KEY) return process.env.ALPHAVANTAGE_API_KEY.trim();
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) return null;
  const line = readFileSync(envPath, "utf8")
    .split("\n")
    .find((l) => /^\s*ALPHAVANTAGE_API_KEY\s*=/.test(l));
  if (!line) return null;
  const value = line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  return value || null;
}

// ------------------------------------------------------------------ api --

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Alpha Vantage reports limits and premium gating as a JSON note instead of an
 * HTTP error, so inspect the body.
 * @returns {null | "premium" | "quota" | "other"}
 */
function classifyNote(json) {
  const msg = `${json?.Information ?? ""} ${json?.Note ?? ""} ${json?.["Error Message"] ?? ""}`.toLowerCase();
  if (!msg.trim()) return null;
  // Quota message also contains "premium plans" (as an upgrade link), so check it first.
  if (msg.includes("rate limit") || msg.includes("per day") || msg.includes("call frequency")) return "quota";
  if (msg.includes("premium endpoint") || msg.includes("premium api")) return "premium";
  return "other";
}

async function fetchQuarter(key, symbol, year, quarter) {
  const url =
    `https://www.alphavantage.co/query?function=EARNINGS_CALL_TRANSCRIPT` +
    `&symbol=${encodeURIComponent(symbol)}&quarter=${year}Q${quarter}&apikey=${encodeURIComponent(key)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ----------------------------------------------------------------- main --

async function main() {
  const key = loadKey();
  if (!key) {
    console.error("ALPHAVANTAGE_API_KEY is not set in .env.local — add it first (see .env.example).");
    process.exit(1);
  }

  const onlyArg = process.argv.indexOf("--stock");
  const only = onlyArg >= 0 ? process.argv[onlyArg + 1]?.toUpperCase() : null;
  const stocks = only ? STOCKS.filter((s) => s === only) : STOCKS;
  if (stocks.length === 0) {
    console.error(`Unknown stock "${only}". Options: ${STOCKS.join(", ")}`);
    process.exit(1);
  }

  let fetched = 0;
  let cached = 0;
  const now = new Date();

  for (const symbol of stocks) {
    const dir = path.join(OUT_ROOT, symbol);
    mkdirSync(dir, { recursive: true });
    const quarters = quarterList(symbol, now); // fiscal labels, as Alpha Vantage uses them
    console.log(`\n=== ${symbol} (${quarters.length} fiscal quarters) ===`);

    for (const { year, quarter, callDate } of quarters) {
      const file = path.join(dir, `${year}Q${quarter}.json`);
      if (existsSync(file)) {
        cached += 1;
        continue;
      }

      let json;
      try {
        json = await fetchQuarter(key, symbol, year, quarter);
      } catch (err) {
        // Network blip: leave the quarter uncached so the next run retries it.
        console.log(`  ${year}Q${quarter}  request failed: ${err.message}`);
        continue;
      }
      fetched += 1;

      const note = classifyNote(json);
      if (note === "premium") {
        console.error(`\n  ${symbol} ${year}Q${quarter}: this endpoint needs a premium Alpha Vantage plan for this key.`);
        console.error("  Stopping. Options: upgrade the plan, or place transcript text manually (see plan).");
        throw new StopRun(2);
      }
      if (note === "quota") {
        console.error(`\n  Daily quota reached after ${fetched} request(s) this run (${cached} already cached).`);
        console.error("  Run `node scripts/fetch-transcripts.mjs` again after the quota resets.");
        throw new StopRun(3);
      }

      const hasText = Array.isArray(json?.transcript) && json.transcript.length > 0;
      const isRecent = Date.parse(callDate) > now.getTime() - RECENT_DAYS * 86_400_000;
      if (!hasText && isRecent) {
        // Probably not published yet: don't cache, so the next run asks again.
        console.log(`  ${year}Q${quarter}  no transcript yet (recent call) — will retry next run`);
        await sleep(SLEEP_MS);
        continue;
      }

      // Save everything else (including old "no transcript" answers) so it is not re-requested.
      writeFileSync(file, JSON.stringify({ symbol, year, quarter, fetchedAt: new Date().toISOString(), raw: json }, null, 2));
      console.log(`  ${year}Q${quarter}  saved${hasText ? "" : "  (no transcript text)"}${note === "other" ? "  (API returned a note — check the file)" : ""}`);
      await sleep(SLEEP_MS);
    }
  }

  console.log(`\nDone. ${fetched} request(s) this run, ${cached} already cached. Files in data/transcripts/.`);
}

/** Thrown to stop with a specific exit code without calling process.exit() (keeps open sockets from aborting Node on Windows). */
class StopRun extends Error {
  constructor(code) {
    super(`stop with exit code ${code}`);
    this.code = code;
  }
}

main().catch((err) => {
  if (err instanceof StopRun) {
    process.exitCode = err.code;
    return;
  }
  console.error("fetch-transcripts failed:", err);
  process.exitCode = 1;
});
