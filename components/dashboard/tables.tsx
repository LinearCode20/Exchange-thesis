"use client";

import type { ModelKey, ModelMetrics, StockArtifact } from "@/lib/types";
import { Card, CardTitle, MODEL_COLORS, MODEL_LABELS, money } from "./ui";

const ORDER: ModelKey[] = ["srnn", "gru", "lstm"];

/** Performance comparison — best value per column is bold. */
export function MetricsTable({ metrics }: { metrics: Record<ModelKey, ModelMetrics> }) {
  const best = {
    rmse: Math.min(...ORDER.map((k) => metrics[k].rmse)),
    mae: Math.min(...ORDER.map((k) => metrics[k].mae)),
    mape: Math.min(...ORDER.map((k) => metrics[k].mape)),
    r2: Math.max(...ORDER.map((k) => metrics[k].r2)),
  };
  const headers = ["Model", "RMSE (↓)", "MAE (↓)", "MAPE (%, ↓)", "R² Score (↑)"];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[440px] text-sm">
        <thead>
          <tr style={{ color: "var(--muted)" }}>
            {headers.map((h) => (
              <th key={h} className="px-2 py-2 text-left font-medium first:pl-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ORDER.map((k) => {
            const m = metrics[k];
            const cell = (v: number, bestV: number, fmt: (x: number) => string) => (
              <td className="px-2 py-2.5 tabular-nums" style={{ fontWeight: v === bestV ? 700 : 400 }}>
                {fmt(v)}
              </td>
            );
            return (
              <tr key={k} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-2 py-2.5 pl-0 font-medium" style={{ color: MODEL_COLORS[k] }}>
                  {MODEL_LABELS[k]}
                </td>
                {cell(m.rmse, best.rmse, (v) => v.toFixed(2))}
                {cell(m.mae, best.mae, (v) => v.toFixed(2))}
                {cell(m.mape, best.mape, (v) => v.toFixed(2))}
                {cell(m.r2, best.r2, (v) => v.toFixed(3))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
        ↓ Lower is better&emsp;↑ Higher is better
      </p>
    </div>
  );
}

/** 60-day prediction table; sample mode shows Day 1–3, …, Day 60. */
export function PredictionTable({
  data,
  sample = false,
}: {
  data: StockArtifact;
  sample?: boolean;
}) {
  const n = data.config.horizon;
  const dayIndices = sample
    ? [...Array(Math.min(3, n)).keys(), -1, n - 1] // Day 1..3, ellipsis, Day 60
    : [...Array(n).keys()];

  return (
    <div className={sample ? "overflow-x-auto" : "max-h-[520px] overflow-y-auto overflow-x-auto"}>
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr style={{ color: "var(--muted)" }}>
            <th className="sticky top-0 px-2 py-2 text-left font-medium pl-0" style={{ background: "var(--surface)" }}>
              {sample ? "Date" : "Day / Date"}
            </th>
            <th className="sticky top-0 px-2 py-2 text-right font-medium" style={{ background: "var(--surface)", color: MODEL_COLORS.srnn }}>
              {MODEL_LABELS.srnn}
            </th>
            <th className="sticky top-0 px-2 py-2 text-right font-medium" style={{ background: "var(--surface)", color: MODEL_COLORS.gru }}>
              {MODEL_LABELS.gru}
            </th>
            <th className="sticky top-0 px-2 py-2 text-right font-medium" style={{ background: "var(--surface)", color: MODEL_COLORS.lstm }}>
              {MODEL_LABELS.lstm}
            </th>
          </tr>
        </thead>
        <tbody>
          {dayIndices.map((k) =>
            k < 0 ? (
              <tr key="dots" className="border-t text-center" style={{ borderColor: "var(--border)" }}>
                <td className="py-2" colSpan={4} style={{ color: "var(--muted)" }}>
                  …
                </td>
              </tr>
            ) : (
              <tr key={k} className="border-t" style={{ borderColor: "var(--border)", color: "var(--ink-2)" }}>
                <td className="px-2 py-2 pl-0">
                  Day {k + 1}
                  {!sample && (
                    <span className="block text-xs" style={{ color: "var(--muted)" }}>
                      {data.future.dates[k]}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{money(data.future.srnn[k])}</td>
                <td className="px-2 py-2 text-right tabular-nums">{money(data.future.gru[k])}</td>
                <td className="px-2 py-2 text-right tabular-nums">{money(data.future.lstm[k])}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

export function PredictionTableCard({ data }: { data: StockArtifact }) {
  return (
    <Card>
      <CardTitle>{data.config.horizon} Days Prediction Table (Sample)</CardTitle>
      <div className="mt-3">
        <PredictionTable data={data} sample />
      </div>
    </Card>
  );
}

export function MetricsTableCard({ metrics, title = "Model Performance Comparison" }: { metrics: Record<ModelKey, ModelMetrics>; title?: string }) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <div className="mt-3">
        <MetricsTable metrics={metrics} />
      </div>
    </Card>
  );
}
