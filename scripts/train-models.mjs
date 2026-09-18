/**
 * Thesis model training pipeline (pure Node — no Python required).
 *
 * Trains three recurrent models on 10 years of daily closes per stock:
 *   - SRNN (Simple RNN)  — baseline
 *   - GRU                — proposed
 *   - LSTM               — proposed
 *
 * Protocol: chronological 80/20 train/test split, MinMax scaling fitted on
 * the TRAIN segment only (no leakage), sliding window of 60 trading days →
 * next-day close. Test metrics (RMSE / MAE / MAPE / R²) are one-step-ahead
 * predictions on the held-out segment. The 60-day future forecast is
 * generated iteratively (each prediction is appended to the input window).
 *
 * Results are written to data/results/<SYMBOL>.json + _index.json and are
 * what the dashboard serves via /api/predict.
 *
 * Usage:
 *   node scripts/train-models.mjs                     # all stocks, defaults
 *   node scripts/train-models.mjs --stock AAPL        # one stock
 *   node scripts/train-models.mjs --epochs 2 --stock AAPL   # smoke test
 */

import { writeFileSync, mkdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(ROOT, "data", "results");

// ---------------------------------------------------------------- config --

const CONFIG = {
  window: 60, // input window (trading days)
  horizon: 60, // future days to project
  hidden: 32, // recurrent hidden units (identical for all models)
  epochs: 20, // identical training budget for all models
  batch: 32,
  lr: 0.001,
  splitPct: 80,
  clipNorm: 1.0,
  seed: 42,
};

const STOCKS = [
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "MSFT", name: "Microsoft Corporation" },
  { symbol: "NVDA", name: "NVIDIA Corporation" },
  { symbol: "TSLA", name: "Tesla, Inc." },
];

// ------------------------------------------------------------------ args --

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
const ONLY_STOCK = argValue("--stock")?.toUpperCase() ?? null;
if (argValue("--epochs")) CONFIG.epochs = Number(argValue("--epochs"));
if (argValue("--hidden")) CONFIG.hidden = Number(argValue("--hidden"));
if (argValue("--horizon")) CONFIG.horizon = Number(argValue("--horizon"));

const stocks = ONLY_STOCK ? STOCKS.filter((s) => s.symbol === ONLY_STOCK) : STOCKS;
if (stocks.length === 0) {
  console.error(`Unknown stock "${ONLY_STOCK}". Options: ${STOCKS.map((s) => s.symbol).join(", ")}`);
  process.exit(1);
}

/** Distinct init seeds so the three models don't share an RNG stream. */
const MODEL_SEED_OFFSET = { srnn: 101, gru: 202, lstm: 303 };

/** Optional --kinds srnn,gru filter for debugging single architectures. */
const KIND_FILTER = argValue("--kinds")
  ? argValue("--kinds").split(",").map((k) => k.trim().toLowerCase())
  : ["srnn", "gru", "lstm"];

// ------------------------------------------------------------ utilities --

/** Deterministic PRNG so every run of the experiment is reproducible. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function round(v, dp) {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

function isoDate(tsSeconds) {
  return new Date(tsSeconds * 1000).toISOString().slice(0, 10);
}

/** Next `n` weekdays strictly after `date` (YYYY-MM-DD, UTC). */
function nextTradingDates(dateStr, n) {
  const out = [];
  const d = new Date(`${dateStr}T00:00:00Z`);
  while (out.length < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// ------------------------------------------------------------------ data --

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function fetchTenYearChart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=10y&interval=1d`;
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result?.timestamp) throw new Error("empty chart payload");
      return result;
    } catch (err) {
      lastErr = err;
      console.log(`  fetch attempt ${attempt} failed: ${err.message}`);
      await sleep(2500);
    }
  }
  throw lastErr;
}

function buildSeries(chart) {
  const { timestamp, indicators } = chart;
  const quote = indicators?.quote?.[0];
  const rows = [];
  for (let i = 0; i < timestamp.length; i++) {
    const close = quote?.close?.[i];
    if (close == null) continue; // skip suspended/half days without a close
    rows.push({
      date: isoDate(timestamp[i]),
      close,
      volume: quote.volume?.[i] ?? 0,
    });
  }
  return rows;
}

// ------------------------------------------------------------- modeling --

/** Adam optimizer with global-gradient-norm clipping. */
class Adam {
  constructor(weights, grads) {
    this.groups = weights.map((w, i) => ({
      w,
      g: grads[i],
      m: new Float64Array(w.length),
      v: new Float64Array(w.length),
    }));
    this.t = 0;
  }
  zeroGrad() {
    for (const grp of this.groups) grp.g.fill(0);
  }
  clipGrad(maxNorm) {
    let sum = 0;
    for (const grp of this.groups) {
      const g = grp.g;
      for (let i = 0; i < g.length; i++) sum += g[i] * g[i];
    }
    const norm = Math.sqrt(sum);
    if (norm > maxNorm) {
      const f = maxNorm / norm;
      for (const grp of this.groups) {
        const g = grp.g;
        for (let i = 0; i < g.length; i++) g[i] *= f;
      }
    }
  }
  step(lr) {
    this.t += 1;
    const bc1 = 1 - Math.pow(0.9, this.t);
    const bc2 = 1 - Math.pow(0.999, this.t);
    for (const grp of this.groups) {
      const { w, g, m, v } = grp;
      for (let i = 0; i < w.length; i++) {
        const gi = g[i]; // grads are already batch-averaged in backward()
        m[i] = 0.9 * m[i] + 0.1 * gi;
        v[i] = 0.999 * v[i] + 0.001 * gi * gi;
        w[i] -= (lr * (m[i] / bc1)) / (Math.sqrt(v[i] / bc2) + 1e-8);
      }
    }
  }
}

/** Glorot-uniform init for a flat array of `len` elements with given fan-in/out. */
function initWeights(len, fanIn, fanOut, rng, scale = 1) {
  const limit = Math.sqrt(6 / (fanIn + fanOut)) * scale;
  const w = new Float64Array(len);
  for (let i = 0; i < len; i++) w[i] = (rng() * 2 - 1) * limit;
  return w;
}

/**
 * SRNN — Simple RNN (Elman network), the baseline.
 *   h_t = tanh(Wx·x_t + Uh·h_{t-1} + b)
 * Output: y = V·h_T + bv.
 */
class SRNN {
  constructor(H, rng) {
    this.H = H;
    this.Wx = initWeights(H, 1, H, rng); // input is a scalar close price
    // Near-zero recurrent + damped output init (IRNN-style): a vanilla tanh
    // RNN with full Glorot recurrence saturates over a 60-step window and
    // collapses to a mean predictor. Starting U small keeps units in the
    // linear regime so the direct "last input" path is learned first.
    this.Ux = initWeights(H * H, H, H, rng, 0.1);
    this.b = new Float64Array(H);
    this.V = initWeights(H, H, 1, rng, 0.5);
    this.b = new Float64Array(H);
    this.V = initWeights(H, H, 1, rng, 0.5);
    this.bv = new Float64Array(1);
    this.dWx = new Float64Array(H);
    this.dUx = new Float64Array(H * H);
    this.db = new Float64Array(H);
    this.dV = new Float64Array(H);
    this.dbv = new Float64Array(1);
    // reusable per-sample caches (samples are processed sequentially)
    this.hCache = new Float64Array(CONFIG.window * H);
    this.hprev = new Float64Array(H);
    this.dh = new Float64Array(H);
    this.dpre = new Float64Array(H);
    this.opt = new Adam([this.Wx, this.Ux, this.b, this.V, this.bv], [this.dWx, this.dUx, this.db, this.dV, this.dbv]);
  }

  /** x: Float64Array of window scalars → predicted (scaled) close. */
  forward(x) {
    const { H, hCache, hprev } = this;
    const T = x.length;
    hprev.fill(0);
    for (let t = 0; t < T; t++) {
      const xt = x[t];
      const hc = t * H;
      for (let j = 0; j < H; j++) {
        let s = this.Wx[j] * xt + this.b[j];
        const ur = j * H;
        for (let m = 0; m < H; m++) s += this.Ux[ur + m] * hprev[m];
        hCache[hc + j] = Math.tanh(s);
      }
      hprev.set(hCache.subarray(hc, hc + H));
    }
    let pred = this.bv[0];
    const last = (T - 1) * H;
    for (let j = 0; j < H; j++) pred += this.V[j] * hCache[last + j];
    return pred;
  }

  /** dOut: dLoss/dPred. Accumulates into the grad arrays. */
  backward(x, dOut) {
    const { H, hCache, dh, dpre } = this;
    const T = x.length;
    for (let j = 0; j < H; j++) {
      this.dV[j] += dOut * hCache[(T - 1) * H + j];
      dh[j] = dOut * this.V[j];
    }
    this.dbv[0] += dOut;
    for (let t = T - 1; t >= 0; t--) {
      const hc = t * H;
      const hprev = t > 0 ? hCache.subarray((t - 1) * H, t * H) : null;
      for (let j = 0; j < H; j++) {
        const h = hCache[hc + j];
        dpre[j] = dh[j] * (1 - h * h);
      }
      const xt = x[t];
      // h_{t-1} feeds only step t, so the fresh gradient is Uᵀ·dpre_t —
      // the stale dh from step t+1 must be discarded, not added to.
      dh.fill(0);
      for (let j = 0; j < H; j++) {
        const dp = dpre[j];
        this.db[j] += dp;
        this.dWx[j] += dp * xt;
        const ur = j * H;
        for (let m = 0; m < H; m++) {
          this.dUx[ur + m] += dp * (hprev ? hprev[m] : 0);
          dh[m] += this.Ux[ur + m] * dp;
        }
      }
    }
  }
}

/**
 * LSTM — proposed. Standard peephole-free cell:
 *   i,f,o = σ(W·x + U·h + b), g = tanh(...), c_t = f⊙c_{t-1} + i⊙g,
 *   h_t = o⊙tanh(c_t). Full BPTT through the window.
 */
class LSTM {
  constructor(H, rng) {
    this.H = H;
    const G = 4; // i, f, o, g
    this.Wx = initWeights(G * H, 1, G * H, rng);
    this.Ux = initWeights(G * H * H, G * H, H, rng, 0.5);
    this.b = new Float64Array(G * H);
    this.V = initWeights(H, H, 1, rng);
    this.bv = new Float64Array(1);
    this.dWx = new Float64Array(G * H);
    this.dUx = new Float64Array(G * H * H);
    this.db = new Float64Array(G * H);
    this.dV = new Float64Array(H);
    this.dbv = new Float64Array(1);
    const T = CONFIG.window;
    this.hCache = new Float64Array(T * H); // h_t
    this.cCache = new Float64Array(T * H); // c_t
    this.aCache = new Float64Array(T * H); // tanh(c_t)
    this.ifogCache = new Float64Array(T * G * H); // [i f o g] per step
    this.hprev = new Float64Array(H);
    this.cprev = new Float64Array(H);
    this.dh = new Float64Array(H);
    this.dcNext = new Float64Array(H);
    this.dc = new Float64Array(H);
    this.dpre = new Float64Array(G * H);
    this.dhNew = new Float64Array(H);
    this.opt = new Adam([this.Wx, this.Ux, this.b, this.V, this.bv], [this.dWx, this.dUx, this.db, this.dV, this.dbv]);
  }

  forward(x) {
    const { H, hCache, cCache, aCache, ifogCache, hprev, cprev } = this;
    const T = x.length;
    hprev.fill(0);
    cprev.fill(0);
    for (let t = 0; t < T; t++) {
      const xt = x[t];
      const gc = t * 4 * H;
      // gate pre-activations
      for (let k = 0; k < 4; k++) {
        const gr = k * H;
        for (let j = 0; j < H; j++) {
          let s = this.Wx[gr + j] * xt + this.b[gr + j];
          const ur = (gr + j) * H;
          for (let m = 0; m < H; m++) s += this.Ux[ur + m] * hprev[m];
          this.dpre[gr + j] = s; // reuse dpre as scratch during forward
        }
      }
      for (let j = 0; j < H; j++) {
        const i = sigmoid(this.dpre[j]);
        const f = sigmoid(this.dpre[H + j]);
        const o = sigmoid(this.dpre[2 * H + j]);
        const g = Math.tanh(this.dpre[3 * H + j]);
        ifogCache[gc + j] = i;
        ifogCache[gc + H + j] = f;
        ifogCache[gc + 2 * H + j] = o;
        ifogCache[gc + 3 * H + j] = g;
        const c = f * cprev[j] + i * g;
        const a = Math.tanh(c);
        cCache[t * H + j] = c;
        aCache[t * H + j] = a;
        hCache[t * H + j] = o * a;
      }
      hprev.set(hCache.subarray(t * H, t * H + H));
      cprev.set(cCache.subarray(t * H, t * H + H));
    }
    let pred = this.bv[0];
    const last = (T - 1) * H;
    for (let j = 0; j < H; j++) pred += this.V[j] * hCache[last + j];
    return pred;
  }

  backward(x, dOut) {
    const { H, hCache, cCache, aCache, ifogCache, dh, dcNext, dc, dpre, dhNew } = this;
    const T = x.length;
    for (let j = 0; j < H; j++) {
      this.dV[j] += dOut * hCache[(T - 1) * H + j];
      dh[j] = dOut * this.V[j];
    }
    this.dbv[0] += dOut;
    dcNext.fill(0);
    for (let t = T - 1; t >= 0; t--) {
      const hc = t * H;
      const gc = t * 4 * H;
      const hprev = t > 0 ? hCache.subarray((t - 1) * H, t * H) : null;
      const cprev = t > 0 ? cCache.subarray((t - 1) * H, t * H) : null;
      for (let j = 0; j < H; j++) {
        const o = ifogCache[gc + 2 * H + j];
        const a = aCache[hc + j];
        // dc from h (via o·tanh(c)) and from the future (via f·c)
        dc[j] = dh[j] * o * (1 - a * a) + dcNext[j];
      }
      for (let j = 0; j < H; j++) {
        const i = ifogCache[gc + j];
        const f = ifogCache[gc + H + j];
        const o = ifogCache[gc + 2 * H + j];
        const g = ifogCache[gc + 3 * H + j];
        const c = dc[j];
        const di = c * g;
        const df = c * (cprev ? cprev[j] : 0);
        const doo = dh[j] * aCache[hc + j];
        const dg = c * i;
        dpre[j] = di * i * (1 - i);
        dpre[H + j] = df * f * (1 - f);
        dpre[2 * H + j] = doo * o * (1 - o);
        dpre[3 * H + j] = dg * (1 - g * g);
        dcNext[j] = c * f;
      }
      const xt = x[t];
      dhNew.fill(0);
      for (let k = 0; k < 4; k++) {
        const gr = k * H;
        for (let j = 0; j < H; j++) {
          const dp = dpre[gr + j];
          this.db[gr + j] += dp;
          this.dWx[gr + j] += dp * xt;
          const ur = (gr + j) * H;
          for (let m = 0; m < H; m++) {
            this.dUx[ur + m] += dp * (hprev ? hprev[m] : 0);
            dhNew[m] += this.Ux[ur + m] * dp;
          }
        }
      }
      dh.set(dhNew);
    }
  }
}

/**
 * GRU — proposed.
 *   z = σ(...), r = σ(...), n = tanh(Wn·x + Un·(r⊙h) + bn),
 *   h_t = (1−z)⊙h_{t-1} + z⊙n
 */
class GRU {
  constructor(H, rng) {
    this.H = H;
    const G = 3; // z, r, n
    this.Wx = initWeights(G * H, 1, G * H, rng);
    this.Ux = initWeights(G * H * H, G * H, H, rng, 0.5);
    this.b = new Float64Array(G * H);
    this.V = initWeights(H, H, 1, rng);
    this.bv = new Float64Array(1);
    this.dWx = new Float64Array(G * H);
    this.dUx = new Float64Array(G * H * H);
    this.db = new Float64Array(G * H);
    this.dV = new Float64Array(H);
    this.dbv = new Float64Array(1);
    const T = CONFIG.window;
    this.hCache = new Float64Array(T * H);
    this.zCache = new Float64Array(T * H);
    this.rCache = new Float64Array(T * H);
    this.nCache = new Float64Array(T * H);
    this.hprev = new Float64Array(H);
    this.dh = new Float64Array(H);
    this.dhNew = new Float64Array(H);
    this.drh = new Float64Array(H); // d(r⊙h)
    this.dpre = new Float64Array(G * H);
    this.opt = new Adam([this.Wx, this.Ux, this.b, this.V, this.bv], [this.dWx, this.dUx, this.db, this.dV, this.dbv]);
  }

  forward(x) {
    const { H, hCache, zCache, rCache, nCache, hprev } = this;
    const T = x.length;
    hprev.fill(0);
    for (let t = 0; t < T; t++) {
      const xt = x[t];
      for (let j = 0; j < H; j++) {
        // gates z and r (vector-valued; r gates h element-wise below)
        let sz = this.Wx[j] * xt + this.b[j];
        let sr = this.Wx[H + j] * xt + this.b[H + j];
        const uzr = j * H;
        for (let m = 0; m < H; m++) {
          sz += this.Ux[uzr + m] * hprev[m];
          sr += this.Ux[(H + j) * H + m] * hprev[m];
        }
        zCache[t * H + j] = sigmoid(sz);
        rCache[t * H + j] = sigmoid(sr);
      }
      for (let j = 0; j < H; j++) {
        // gates z and r (vector-valued; r gates h element-wise below)
        let sz = this.Wx[j] * xt + this.b[j];
        let sr = this.Wx[H + j] * xt + this.b[H + j];
        const uzr = j * H;
        for (let m = 0; m < H; m++) {
          sz += this.Ux[uzr + m] * hprev[m];
          sr += this.Ux[(H + j) * H + m] * hprev[m];
        }
        zCache[t * H + j] = sigmoid(sz);
        rCache[t * H + j] = sigmoid(sr);
      }
      for (let j = 0; j < H; j++) {
        // candidate: pre_n[j] = Wn·x + Un·(r ⊙ h) + bn
        let sn = this.Wx[2 * H + j] * xt + this.b[2 * H + j];
        const unr = (2 * H + j) * H;
        for (let m = 0; m < H; m++) sn += this.Ux[unr + m] * (rCache[t * H + m] * hprev[m]);
        nCache[t * H + j] = Math.tanh(sn);
      }
      for (let j = 0; j < H; j++) {
        const z = zCache[t * H + j];
        const n = nCache[t * H + j];
        hCache[t * H + j] = (1 - z) * hprev[j] + z * n;
      }
      hprev.set(hCache.subarray(t * H, t * H + H));
    }
    let pred = this.bv[0];
    const last = (T - 1) * H;
    for (let j = 0; j < H; j++) pred += this.V[j] * hCache[last + j];
    return pred;
  }

  backward(x, dOut) {
    const { H, hCache, zCache, rCache, nCache, dh, dhNew, drh, dpre } = this;
    const T = x.length;
    for (let j = 0; j < H; j++) {
      this.dV[j] += dOut * hCache[(T - 1) * H + j];
      dh[j] = dOut * this.V[j];
    }
    this.dbv[0] += dOut;
    for (let t = T - 1; t >= 0; t--) {
      const hc = t * H;
      const hprev = t > 0 ? hCache.subarray((t - 1) * H, t * H) : null;
      const z = zCache.subarray(hc, hc + H);
      const r = rCache.subarray(hc, hc + H);
      const n = nCache.subarray(hc, hc + H);
      // dz, dn, dh via the blend
      for (let j = 0; j < H; j++) {
        dpre[2 * H + j] = dh[j] * z[j] * (1 - n[j] * n[j]); // dpre_n
      }
      const xt = x[t];
      // dh_{t-1} = (1-z)⊙dh_t + Uᵀ terms; the z⊙n path already went into dn,
      // so starting from dh itself would double-count it.
      dhNew.fill(0);
      // candidate path: dUn, d(r⊙h)
      drh.fill(0);
      for (let j = 0; j < H; j++) {
        const dpn = dpre[2 * H + j];
        this.db[2 * H + j] += dpn;
        this.dWx[2 * H + j] += dpn * xt;
        const unr = (2 * H + j) * H;
        for (let m = 0; m < H; m++) {
          const rh = r[m] * (hprev ? hprev[m] : 0);
          this.dUx[unr + m] += dpn * rh;
          drh[m] += this.Ux[unr + m] * dpn;
        }
      }
      for (let m = 0; m < H; m++) {
        // dz
        const dz = dh[m] * (n[m] - (hprev ? hprev[m] : 0));
        dpre[m] = dz * z[m] * (1 - z[m]); // dpre_z
        dhNew[m] += dh[m] * (1 - z[m]); // direct path
        // r path
        const drm = drh[m] * (hprev ? hprev[m] : 0); // d r[m]
        if (hprev) dhNew[m] += drh[m] * r[m];
        dpre[H + m] = drm * r[m] * (1 - r[m]); // dpre_r
      }
      // z and r recurrent paths
      for (let k = 0; k < 2; k++) {
        const gr = k * H;
        for (let j = 0; j < H; j++) {
          const dp = dpre[gr + j];
          this.db[gr + j] += dp;
          this.dWx[gr + j] += dp * xt;
          const ur = (gr + j) * H;
          for (let m = 0; m < H; m++) {
            this.dUx[ur + m] += dp * (hprev ? hprev[m] : 0);
            dhNew[m] += this.Ux[ur + m] * dp;
          }
        }
      }
      dh.set(dhNew);
    }
  }
}

function makeModel(kind, rng) {
  if (kind === "srnn") return new SRNN(CONFIG.hidden, rng);
  if (kind === "gru") return new GRU(CONFIG.hidden, rng);
  return new LSTM(CONFIG.hidden, rng);
}

/** One epoch of shuffled mini-batch SGD (Adam) over the training windows. */
function trainEpoch(model, xs, ys, order, epochRng) {
  // Fisher–Yates shuffle of the window order (windows overlap; shuffling
  // their presentation order keeps batches varied without changing data).
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(epochRng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  let lossSum = 0;
  for (let start = 0; start < order.length; start += CONFIG.batch) {
    const end = Math.min(start + CONFIG.batch, order.length);
    const batchN = end - start;
    model.opt.zeroGrad();
    for (let b = start; b < end; b++) {
      const idx = order[b];
      const pred = model.forward(xs[idx]);
      const err = pred - ys[idx];
      lossSum += err * err;
      model.backward(xs[idx], (2 * err) / batchN);
    }
    model.opt.clipGrad(CONFIG.clipNorm);
    model.opt.step(CONFIG.lr);
  }
  return lossSum / order.length;
}

// -------------------------------------------------------------- metrics --

function computeMetrics(actual, preds) {
  const n = actual.length;
  let se = 0,
    ae = 0,
    ape = 0,
    ssRes = 0,
    ssTot = 0;
  const mean = actual.reduce((a, b) => a + b, 0) / n;
  for (let i = 0; i < n; i++) {
    const e = preds[i] - actual[i];
    se += e * e;
    ae += Math.abs(e);
    if (actual[i] !== 0) ape += Math.abs(e / actual[i]);
    ssRes += e * e;
    ssTot += (actual[i] - mean) ** 2;
  }
  return {
    rmse: round(Math.sqrt(se / n), 4),
    mae: round(ae / n, 4),
    mape: round((ape / n) * 100, 4),
    r2: round(1 - ssRes / ssTot, 4),
  };
}

// ------------------------------------------------------------- pipeline --

function trainOneModel(kind, closesScaled, trainEnd, seed) {
  const W = CONFIG.window;
  const rng = mulberry32(seed);
  const model = makeModel(kind, rng);
  const xs = [];
  const ys = [];
  for (let i = W; i < trainEnd; i++) {
    xs.push(closesScaled.slice(i - W, i));
    ys.push(closesScaled[i]);
  }
  const order = xs.map((_, i) => i);
  const epochRng = mulberry32(seed + 1);
  for (let epoch = 1; epoch <= CONFIG.epochs; epoch++) {
    const t0 = Date.now();
    const loss = trainEpoch(model, xs, ys, order, epochRng);
    console.log(
      `    ${kind.toUpperCase()} epoch ${String(epoch).padStart(2)}/${CONFIG.epochs}  loss ${loss.toFixed(6)}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
    );
  }
  return model;
}

function predictSeries(model, closesScaled, fromIdx, toIdx) {
  const W = CONFIG.window;
  const out = [];
  for (let i = fromIdx; i < toIdx; i++) {
    out.push(model.forward(closesScaled.subarray(i - W, i)));
  }
  return out;
}

function forecastFuture(model, closesScaled, min, max) {
  const W = CONFIG.window;
  const window = closesScaled.slice(closesScaled.length - W);
  const out = [];
  for (let k = 0; k < CONFIG.horizon; k++) {
    const p = model.forward(window);
    out.push(p * (max - min) + min);
    window.copyWithin(0, 1);
    window[W - 1] = p;
  }
  return out;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(
    `Training SRNN (baseline) vs GRU & LSTM (proposed) — window ${CONFIG.window}, hidden ${CONFIG.hidden}, epochs ${CONFIG.epochs}, split ${CONFIG.splitPct}/${100 - CONFIG.splitPct}`,
  );
  const index = [];
  for (const stock of stocks) {
    index.push(await processStock(stock));
  }
  // With --stock, several processes train in parallel; build the merged
  // index afterwards with scripts/build-index.mjs instead.
  if (!ONLY_STOCK) {
    writeFileSync(
      path.join(OUT_DIR, "_index.json"),
      JSON.stringify({ config: CONFIG, generatedAt: new Date().toISOString(), stocks: index }),
    );
  }
  console.log(`\nAll done — ${index.length} stock(s) trained. Artifacts in data/results/.`);
}

/** Per-stock pipeline: fetch → split → scale → train ×3 → evaluate → write. */
async function processStock({ symbol, name }) {
  console.log(`\n=== ${symbol} — ${name} ===`);
  console.log("  fetching 10y daily chart from Yahoo Finance…");
  const chart = await fetchTenYearChart(symbol);
  const series = buildSeries(chart);
  const n = series.length;
  const dates = series.map((r) => r.date);
  const closes = series.map((r) => r.close);
  const volumes = series.map((r) => r.volume);
  console.log(`  ${n} trading days  (${dates[0]} → ${dates[n - 1]})`);

  // Chronological 80/20 split; the scaler sees TRAIN prices only.
  const trainEnd = Math.floor((n * CONFIG.splitPct) / 100);
  let min = Infinity,
    max = -Infinity;
  for (let i = 0; i < trainEnd; i++) {
    if (closes[i] < min) min = closes[i];
    if (closes[i] > max) max = closes[i];
  }
  const scale = (v) => (v - min) / (max - min);
  const closesScaled = Float64Array.from(closes, scale);
  console.log(
    `  split: train ${trainEnd} (${dates[0]} → ${dates[trainEnd - 1]}), test ${n - trainEnd} (${dates[trainEnd]} → ${dates[n - 1]})`,
  );

  const models = {};
  for (const kind of KIND_FILTER) {
    console.log(`  training ${kind.toUpperCase()}…`);
    const t0 = Date.now();
    models[kind] = trainOneModel(kind, closesScaled, trainEnd, CONFIG.seed + MODEL_SEED_OFFSET[kind]);
    console.log(`    done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  // ---- test-set one-step-ahead predictions (inverse-scaled) ----
  const testActual = closes.slice(trainEnd);
  const testPreds = {};
  for (const kind of Object.keys(models)) {
    const scaled = predictSeries(models[kind], closesScaled, trainEnd, n);
    testPreds[kind] = scaled.map((p) => p * (max - min) + min);
  }
  const metrics = {};
  for (const kind of Object.keys(models)) {
    metrics[kind] = computeMetrics(testActual, testPreds[kind]);
    const m = metrics[kind];
    console.log(`  ${kind.toUpperCase()}  RMSE ${m.rmse}  MAE ${m.mae}  MAPE ${m.mape}%  R² ${m.r2}`);
    if (process.env.DEBUG_PRED) {
      for (let i = 0; i < 5; i++) {
        console.log(`    [${kind}] t+${i + 1} pred ${testPreds[kind][i].toFixed(2)}  actual ${testActual[i].toFixed(2)}`);
      }
    }
  }
  // Persistence reference (pred = yesterday's close) — the bar any model
  // should beat; printed for experiment sanity only.
  const persPreds = closes.slice(trainEnd - 1, n - 1);
  const pers = computeMetrics(testActual, persPreds);
  console.log(`  PERSIST  RMSE ${pers.rmse}  MAE ${pers.mae}  MAPE ${pers.mape}%  R² ${pers.r2}`);

  // ---- iterative 60-trading-day forecast ----
  const future = {};
  for (const kind of Object.keys(models)) {
    future[kind] = forecastFuture(models[kind], closesScaled, min, max).map((v) => round(v, 2));
  }
  const futureDates = nextTradingDates(dates[n - 1], CONFIG.horizon);

  // ---- descriptive stats used for the stock-selection criteria table ----
  const rets = [];
  for (let i = 1; i < n; i++) rets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  const meanRet = rets.reduce((a, b) => a + b, 0) / rets.length;
  const vol = Math.sqrt(rets.reduce((a, r) => a + (r - meanRet) ** 2, 0) / (rets.length - 1));
  const stats = {
    annualVolPct: round(vol * Math.sqrt(252) * 100, 2),
    totalChangePct: round(((closes[n - 1] - closes[0]) / closes[0]) * 100, 1),
    minClose: round(Math.min(...closes), 2),
    maxClose: round(Math.max(...closes), 2),
  };

  const artifact = {
    symbol,
    companyName: name,
    currency: "USD",
    generatedAt: new Date().toISOString(),
    config: CONFIG,
    dataPeriod: { start: dates[0], end: dates[n - 1], years: 10 },
    records: n,
    split: {
      trainRecords: trainEnd,
      testRecords: n - trainEnd,
      trainStart: dates[0],
      trainEnd: dates[trainEnd - 1],
      testStart: dates[trainEnd],
      testEnd: dates[n - 1],
    },
    history: {
      dates,
      close: closes.map((v) => round(v, 4)),
      volume: volumes,
    },
    metrics,
    testSeries: {
      dates: dates.slice(trainEnd),
      actual: testActual.map((v) => round(v, 2)),
      srnn: testPreds.srnn.map((v) => round(v, 2)),
      gru: testPreds.gru.map((v) => round(v, 2)),
      lstm: testPreds.lstm.map((v) => round(v, 2)),
    },
    future: { dates: futureDates, srnn: future.srnn, gru: future.gru, lstm: future.lstm },
    stats,
  };

  const outPath = path.join(OUT_DIR, `${symbol}.json`);
  writeFileSync(outPath, JSON.stringify(artifact));
  const kb = (statSync(outPath).size / 1024).toFixed(0);
  console.log(`  wrote ${path.relative(ROOT, outPath)} (${kb} KB)`);
  return {
    symbol,
    name,
    records: n,
    period: { start: dates[0], end: dates[n - 1] },
    split: artifact.split,
    metrics,
    stats,
    generatedAt: artifact.generatedAt,
  };
}

export { SRNN, GRU, LSTM, Adam, initWeights, mulberry32, computeMetrics, CONFIG };

// Only run the full pipeline when executed directly (allows gradient-check
// scripts to import the model classes).
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error("Training failed:", err);
    process.exit(1);
  });
}
