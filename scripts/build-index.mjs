/**
 * Rebuilds data/results/_index.json from the per-stock artifacts.
 * Used after parallel single-stock training runs. Run:
 *   node scripts/build-index.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(ROOT, "data", "results");

const stocks = [];
for (const file of readdirSync(OUT_DIR)) {
  if (!file.endsWith(".json") || file === "_index.json") continue;
  const a = JSON.parse(readFileSync(path.join(OUT_DIR, file), "utf8"));
  stocks.push({
    symbol: a.symbol,
    name: a.companyName,
    records: a.records,
    period: { start: a.dataPeriod.start, end: a.dataPeriod.end },
    split: a.split,
    metrics: a.metrics,
    stats: a.stats,
    generatedAt: a.generatedAt,
  });
}
stocks.sort((x, y) => x.symbol.localeCompare(y.symbol));
const config = stocks.length > 0 ? JSON.parse(readFileSync(path.join(OUT_DIR, `${stocks[0].symbol}.json`), "utf8")).config : null;
writeFileSync(
  path.join(OUT_DIR, "_index.json"),
  JSON.stringify({ config, generatedAt: new Date().toISOString(), stocks }),
);
console.log(`_index.json written with ${stocks.length} stocks.`);
