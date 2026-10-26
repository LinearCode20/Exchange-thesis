/**
 * Finite-difference gradient check for the hand-written BPTT implementations.
 * Compares analytic gradients (backward) against central finite differences
 * of the MSE loss. Run: node scripts/check-gradients.mjs
 */
import { SRNN, GRU, LSTM, mulberry32 } from "./train-models.mjs";

const EPS = 1e-5;
const T = 12; // short window keeps the numeric check stable
const GRAD_KEYS = { Wx: "dWx", Ux: "dUx", b: "db", V: "dV", bv: "dbv" };

function checkModel(name, ModelClass, D) {
  const model = new ModelClass(8, mulberry32(7), D); // H=8, D features per step
  const wRng = mulberry32(11);
  const x = Float64Array.from({ length: T * D }, () => wRng()); // inputs in [0,1] like scaled closes / tone
  const target = 0.6;

  const pred = model.forward(x);
  const dOut = 2 * (pred - target);
  model.opt.zeroGrad();
  model.backward(x, dOut);

  let worst = 0;
  let worstAt = "";
  const r = mulberry32(3);
  for (const [key, gradKey] of Object.entries(GRAD_KEYS)) {
    const arr = model[key];
    const grads = model[gradKey];
    for (let s = 0; s < 6; s++) {
      const i = Math.floor(r() * arr.length);
      const orig = arr[i];
      arr[i] = orig + EPS;
      const lp = model.forward(x);
      arr[i] = orig - EPS;
      const lm = model.forward(x);
      arr[i] = orig;
      const numeric = ((lp - lm) / (2 * EPS)) * dOut; // numeric dLoss/dw
      const a = grads[i];
      const rel = Math.abs(a - numeric) / Math.max(1e-8, Math.abs(a) + Math.abs(numeric));
      if (rel > worst) {
        worst = rel;
        worstAt = `${key}[${i}]`;
      }
      if (rel > 1e-4) {
        console.log(`  MISMATCH ${name} ${key}[${i}]: analytic ${a.toExponential(4)} vs numeric ${numeric.toExponential(4)}`);
      }
    }
  }
  console.log(`${name} (D=${D}): worst relative error ${worst.toExponential(2)} at ${worstAt}`);
}

// D=1: price-only (regression of the original model). D=2: price + transcript tone.
for (const D of [1, 2]) {
  checkModel("SRNN", SRNN, D);
  checkModel("GRU", GRU, D);
  checkModel("LSTM", LSTM, D);
}
console.log("Gradient check complete.");
