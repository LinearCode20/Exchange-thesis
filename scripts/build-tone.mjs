/**
 * Turns cached transcripts (data/transcripts/<SYMBOL>/*.json, written by
 * fetch-transcripts.mjs) into one small summary per stock:
 *   data/transcripts/<SYMBOL>.tone.json
 *   [{ quarter, year, callDate, dateSource, tone, uncertainty, words }]
 *
 * Missing or empty quarters are simply left out; train-models.mjs treats
 * "no call yet" as tone = 0 (neutral). Coverage is printed so you can see it.
 *
 * Usage: node scripts/build-tone.mjs
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { scoreTranscript } from "./lib/tone.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TRANSCRIPT_ROOT = path.join(ROOT, "data", "transcripts");
const STOCKS = ["AAPL", "MSFT", "NVDA", "TSLA"];

/**
 * Pulls the spoken text out of an Alpha Vantage response. The exact shape is
 * confirmed by the probe step; this collects `content` / `text` strings from
 * whatever structure is returned, so it works for the common layouts.
 */
function extractText(node) {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractText).filter(Boolean).join("\n");
  if (typeof node === "object") {
    const direct = node.content ?? node.text;
    if (typeof direct === "string") return direct;
    if (node.transcript != null) return extractText(node.transcript);
  }
  return "";
}

/** Date of the call. Uses an explicit date when the response has one, else a conservative estimate. */
function callDateFor(raw, year, quarter) {
  const explicit = raw?.date ?? raw?.transcript_date ?? raw?.callDate;
  if (typeof explicit === "string" && /^\d{4}-\d{2}-\d{2}/.test(explicit)) {
    return { date: explicit.slice(0, 10), source: "response" };
  }
  // Quarter end + 45 days: results normally come out within ~6 weeks, so this
  // avoids using a tone before the market could have seen it.
  const quarterEnd = new Date(Date.UTC(year, quarter * 3, 0)); // last day of quarter
  quarterEnd.setUTCDate(quarterEnd.getUTCDate() + 45);
  return { date: quarterEnd.toISOString().slice(0, 10), source: "quarter-end+45d" };
}

function buildSymbol(symbol) {
  const dir = path.join(TRANSCRIPT_ROOT, symbol);
  if (!existsSync(dir)) return { rows: [], skipped: 0 };

  const rows = [];
  let skipped = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const cached = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    const text = extractText(cached.raw?.transcript ?? cached.raw);
    if (!text.trim()) {
      skipped += 1;
      continue;
    }
    const { tone, uncertainty, words } = scoreTranscript(text);
    const { date, source } = callDateFor(cached.raw, cached.year, cached.quarter);
    rows.push({
      quarter: cached.quarter,
      year: cached.year,
      callDate: date,
      dateSource: source,
      tone,
      uncertainty,
      words,
    });
  }
  rows.sort((a, b) => a.callDate.localeCompare(b.callDate));
  return { rows, skipped };
}

function main() {
  mkdirSync(TRANSCRIPT_ROOT, { recursive: true });
  for (const symbol of STOCKS) {
    const { rows, skipped } = buildSymbol(symbol);
    const out = path.join(TRANSCRIPT_ROOT, `${symbol}.tone.json`);
    writeFileSync(out, JSON.stringify({ symbol, generatedAt: new Date().toISOString(), calls: rows }, null, 2));
    console.log(`${symbol}: ${rows.length} call(s) scored, ${skipped} empty/missing skipped → ${path.relative(ROOT, out)}`);
  }
}

main();
