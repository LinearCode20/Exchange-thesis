"use client";

import type { DatasetIndex, QuoteResponse, StockArtifact } from "@/lib/types";
import { Card, CardTitle, MODEL_COLORS, MODEL_LABELS, fmtDate, fmtInt, money } from "./ui";
import { FutureChart, HistoryPredictionChart, TestSetChart } from "./charts";
import { MetricsTableCard, PredictionTable, PredictionTableCard } from "./tables";
import { InfoIcon } from "./icons";

/* ------------------------------- Data Info ------------------------------ */

export function DataInfoTab({
  data,
  index,
  quote,
}: {
  data: StockArtifact;
  index: DatasetIndex | null;
  quote: QuoteResponse | null;
}) {
  const cfg = data.config;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardTitle>Dataset Overview</CardTitle>
        <dl className="mt-3 space-y-2 text-sm">
          {[
            ["Stock", `${data.symbol} — ${data.companyName}`],
            ["Stocks in study", "AAPL, MSFT, NVDA, TSLA (4)"],
            ["Data source", "Yahoo Finance (daily closes)"],
            ["Frequency", "1 trading day"],
            ["Period", `${data.dataPeriod.start} → ${data.dataPeriod.end} (${data.dataPeriod.years} years)`],
            ["Total records", `${fmtInt(data.records)} daily records`],
            ["Input window", `${cfg.window} trading days`],
            ["Prediction horizon", `${cfg.horizon} trading days`],
            ["Baseline model", "SRNN (Simple RNN)"],
            ["Proposed models", "GRU & LSTM"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b pb-2 last:border-0" style={{ borderColor: "var(--border)" }}>
              <dt style={{ color: "var(--muted)" }}>{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        {quote && (
          <p className="mt-4 rounded-lg p-3 text-sm" style={{ background: "var(--primary-soft)" }}>
            <span style={{ color: "var(--muted)" }}>Live rate (Yahoo): </span>
            <span className="font-semibold">{money(quote.price)}</span>{" "}
            <span style={{ color: quote.changePct >= 0 ? "#059669" : "#dc2626" }}>
              {quote.changePct >= 0 ? "+" : ""}
              {quote.changePct.toFixed(2)}%
            </span>{" "}
            <span style={{ color: "var(--muted)" }}>as of {fmtDate(quote.marketTime.slice(0, 10))}</span>
          </p>
        )}
      </Card>

      <Card>
        <CardTitle>Train / Test Split</CardTitle>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg p-3" style={{ background: "var(--primary-soft)" }}>
            <div className="text-2xl font-bold" style={{ color: "var(--primary)" }}>
              {cfg.splitPct}%
            </div>
            <div className="font-medium">Training — {fmtInt(data.split.trainRecords)} records</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              {data.split.trainStart} → {data.split.trainEnd}
            </div>
          </div>
          <div className="rounded-lg p-3" style={{ background: "#fff7ed" }}>
            <div className="text-2xl font-bold" style={{ color: "#ea580c" }}>
              {100 - cfg.splitPct}%
            </div>
            <div className="font-medium">Testing — {fmtInt(data.split.testRecords)} records</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              {data.split.testStart} → {data.split.testEnd}
            </div>
          </div>
        </div>
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm" style={{ color: "var(--ink-2)" }}>
          <li>Chronological split — the test segment always lies strictly after the training segment.</li>
          <li>MinMax scaling is fitted on the training closes only; test prices are transformed with the same scaler (no data leakage).</li>
          <li>Test metrics are one-step-ahead predictions; the {cfg.horizon}-day forecast is generated iteratively from the last {cfg.window} closes.</li>
        </ul>
      </Card>

      <Card className="xl:col-span-2">
        <CardTitle>Stock Selection Criteria</CardTitle>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Stocks chosen for high intraday volatility and high long-run price fluctuation, so the models are
          evaluated under different behaviours.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr style={{ color: "var(--muted)" }}>
                {["Symbol", "Company", "Annual Volatility", "10Y Change", "Price Range", "Selection"].map((h) => (
                  <th key={h} className="px-2 py-2 text-left font-medium first:pl-0">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(index?.stocks ?? []).map((s) => (
                <tr key={s.symbol} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-2 py-2.5 pl-0 font-semibold" style={{ color: s.symbol === data.symbol ? "var(--primary)" : "var(--ink)" }}>
                    {s.symbol}
                  </td>
                  <td className="px-2 py-2.5">{s.name}</td>
                  <td className="px-2 py-2.5 tabular-nums">{s.stats.annualVolPct.toFixed(1)}%</td>
                  <td className="px-2 py-2.5 tabular-nums">+{s.stats.totalChangePct.toFixed(0)}%</td>
                  <td className="px-2 py-2.5 tabular-nums">
                    ${s.stats.minClose} – ${s.stats.maxClose}
                  </td>
                  <td className="px-2 py-2.5" style={{ color: "var(--muted)" }}>
                    High volatility · High fluctuation
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------- Models -------------------------------- */

export function ModelsTab({ data }: { data: StockArtifact }) {
  const cfg = data.config;
  const hp: [string, string][] = [
    ["Input window", `${cfg.window} trading days`],
    ["Hidden units", String(cfg.hidden)],
    ["Epochs", String(cfg.epochs)],
    ["Batch size", String(cfg.batch)],
    ["Optimizer", `Adam (lr ${cfg.lr})`],
    ["Loss", "MSE (scaled closes)"],
    ["Gradient clipping", `global norm ${cfg.clipNorm}`],
    ["Scaling", "MinMax, fitted on train"],
    ["Train / test", `${cfg.splitPct} / ${100 - cfg.splitPct} chronological`],
    ["Random seed", String(cfg.seed)],
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h3 className="font-semibold" style={{ color: MODEL_COLORS.srnn }}>
            {MODEL_LABELS.srnn}
          </h3>
          <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink-2)" }}>
            Elman network: a single recurrent layer h<sub>t</sub> = tanh(W·x<sub>t</sub> + U·h
            <sub>t-1</sub> + b) with a linear readout from the last hidden state. Recurrent weights start
            near zero (IRNN-style) to avoid saturation over long windows. Used as the baseline the
            proposed models must beat.
          </p>
        </Card>
        <Card>
          <h3 className="font-semibold" style={{ color: MODEL_COLORS.gru }}>
            {MODEL_LABELS.gru}
          </h3>
          <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink-2)" }}>
            Gated Recurrent Unit. Update (z) and reset (r) gates control what is remembered: n =
            tanh(W<sub>n</sub>·x + U<sub>n</sub>·(r ⊙ h) + b<sub>n</sub>), h<sub>t</sub> = (1−z) ⊙ h
            <sub>t-1</sub> + z ⊙ n. Fewer parameters than LSTM with comparable accuracy.
          </p>
        </Card>
        <Card>
          <h3 className="font-semibold" style={{ color: MODEL_COLORS.lstm }}>
            {MODEL_LABELS.lstm}
          </h3>
          <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink-2)" }}>
            Long Short-Term Memory. Input, forget and output gates protect the cell state (c
            <sub>t</sub> = f ⊙ c<sub>t-1</sub> + i ⊙ g), letting gradients flow across the full 60-day
            window and capturing longer dependencies than the baseline.
          </p>
        </Card>
      </div>
      <Card>
        <CardTitle>Training Configuration (identical for all models)</CardTitle>
        <div className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {hp.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b pb-1.5" style={{ borderColor: "var(--border)" }}>
              <span style={{ color: "var(--muted)" }}>{k}</span>
              <span className="font-medium">{v}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
          Implemented from scratch in TypeScript (BPTT verified against finite differences to &lt;1e-7
          relative error) — see scripts/train-models.mjs. Results are precomputed and served as static
          artifacts, so the dashboard is fully reproducible.
        </p>
      </Card>
    </div>
  );
}

/* ------------------------------ Predictions ----------------------------- */

export function PredictionsTab({ data }: { data: StockArtifact }) {
  return (
    <div className="space-y-4">
      <FutureChart data={data} height="h-96" />
      <Card>
        <CardTitle>{data.config.horizon} Days Prediction Table (Full)</CardTitle>
        <div className="mt-3">
          <PredictionTable data={data} />
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------- Results ------------------------------- */

export function ResultsTab({
  data,
  index,
}: {
  data: StockArtifact;
  index: DatasetIndex | null;
}) {
  return (
    <div className="space-y-4">
      <MetricsTableCard metrics={data.metrics} />
      <TestSetChart data={data} />
      {index && (
        <Card>
          <CardTitle>Best Model per Stock (R²)</CardTitle>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr style={{ color: "var(--muted)" }}>
                  {["Symbol", MODEL_LABELS.srnn, MODEL_LABELS.gru, MODEL_LABELS.lstm].map((h) => (
                    <th key={h} className="px-2 py-2 text-left font-medium first:pl-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {index.stocks.map((s) => (
                  <tr key={s.symbol} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-2 py-2.5 pl-0 font-semibold">{s.symbol}</td>
                    {(["srnn", "gru", "lstm"] as const).map((k) => (
                      <td
                        key={k}
                        className="px-2 py-2.5 tabular-nums"
                        style={{ color: MODEL_COLORS[k], fontWeight: s.metrics[k].r2 >= Math.max(s.metrics.srnn.r2, s.metrics.gru.r2, s.metrics.lstm.r2) ? 700 : 400 }}
                      >
                        {s.metrics[k].r2.toFixed(3)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* --------------------------------- About -------------------------------- */

export function AboutTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>About This Project</CardTitle>
        <div className="mt-3 space-y-3 text-sm leading-6" style={{ color: "var(--ink-2)" }}>
          <p>
            This dashboard is the practical part of a thesis comparing stock-price prediction models: a
            <strong> Simple Recurrent Neural Network (SRNN)</strong> as the baseline against two proposed
            architectures, <strong>GRU</strong> and <strong>LSTM</strong>. Each model is trained on 10
            years of daily closes for four stocks (AAPL, MSFT, NVDA, TSLA), selected for high intraday
            volatility and strong long-run price fluctuations.
          </p>
          <p>
            Pipeline: fetch 10 years of daily data → chronological 80/20 train/test split → MinMax
            scaling fitted on the training segment only → train each model with a sliding 60-day input
            window (identical hyperparameters) → evaluate one-step-ahead predictions on the test segment
            (RMSE, MAE, MAPE, R²) → generate the 60-trading-day forecast iteratively.
          </p>
          <p>
            Training runs offline via <code>npm run train</code> (scripts/train-models.mjs — pure
            TypeScript, no Python or ML libraries required); the dashboard serves the resulting artifacts,
            so every number shown is reproducible.
          </p>
          <p>
            Tech stack: Next.js (App Router), React, Tailwind CSS, Recharts, and a Yahoo Finance data
            connector. Earnings-call audio links and headlines come from the /api/earnings route.
          </p>
        </div>
      </Card>
      <div
        className="flex items-start gap-3 rounded-xl p-4 text-sm"
        style={{ background: "var(--primary-soft)", border: "1px solid var(--border)" }}
      >
        <span aria-hidden style={{ color: "var(--primary)" }}>
          <InfoIcon size={20} />
        </span>
        <p>
          <strong>Note:</strong> Past performance is not indicative of future results. All projections
          are statistical estimates produced for educational/thesis purposes only — not financial advice.
        </p>
      </div>
    </div>
  );
}
