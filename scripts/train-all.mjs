/**
 * Trains all stocks in parallel (one Node process per stock) and rebuilds
 * the index. Node is single-threaded, so CPU-bound training only truly
 * parallelizes across OS processes. Run: node scripts/train-all.mjs
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TRAIN = path.join(ROOT, "scripts", "train-models.mjs");
const SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA"];

// Extra CLI args (e.g. --epochs 5) are forwarded to every child.
const extra = process.argv.slice(2);

const children = SYMBOLS.map((sym) => {
  const child = spawn(process.execPath, [TRAIN, "--stock", sym, ...extra], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => {
    for (const line of chunk.toString().split("\n")) {
      if (line.trim()) console.log(`[${sym}] ${line}`);
    }
  });
  child.stderr.on("data", (chunk) => {
    for (const line of chunk.toString().split("\n")) {
      if (line.trim()) console.error(`[${sym}] ${line}`);
    }
  });
  return new Promise((resolve) => {
    child.on("exit", (code) => resolve({ sym, code }));
  });
});

const results = await Promise.all(children);
let failed = 0;
for (const { sym, code } of results) {
  if (code !== 0) {
    failed++;
    console.error(`${sym} failed with exit code ${code}`);
  }
}
if (failed === 0) {
  await spawn(process.execPath, [path.join(ROOT, "scripts", "build-index.mjs")], {
    stdio: "inherit",
  }).on("exit", (code) => process.exit(code ?? 0));
} else {
  process.exit(1);
}
