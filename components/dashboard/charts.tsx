"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { StockArtifact } from "@/lib/types";
import { Card, CardTitle, LineSwatch, MODEL_COLORS, MODEL_LABELS, money } from "./ui";

interface ChartRow {
  t: string;
  hist: number | null;
  srnn: number | null;
  gru: number | null;
  lstm: number | null;
}

interface TooltipEntry {
  dataKey?: string | number;
  value?: number | string;
}

const THEME = {
  grid: "#eceef2",
  axis: "#d7dbe2",
  tick: "#8a919c",
  ink: "#374151",
  surface: "#ffffff",
};

const fmtTick = (t: string) =>
  new Date(`${t}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const fmtYear = (t: string) => t.slice(0, 4);

function TooltipBox({
  active,
  label,
  payload,
  labelFmt = fmtTick,
}: {
  active?: boolean;
  label?: string;
  payload?: TooltipEntry[];
  labelFmt?: (t: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-sm"
      style={{ background: THEME.surface, border: "1px solid var(--border)", color: THEME.ink }}
    >
      <div className="font-medium" style={{ color: "var(--ink)" }}>
        {labelFmt(String(label))}
      </div>
      {payload.map((p) => (
        <div key={p.dataKey} className="mt-1 flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ background: MODEL_COLORS[p.dataKey as keyof typeof MODEL_COLORS] ?? "#111" }}
          />
          {p.dataKey === "hist" ? "Close" : MODEL_LABELS[p.dataKey as "srnn" | "gru" | "lstm"]}{" "}
          {money(Number(p.value))}
        </div>
      ))}
    </div>
  );
}

function Legend({ showHistorical }: { showHistorical: boolean }) {
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm"
      style={{ color: "var(--ink-2)" }}
    >
      {showHistorical && (
        <span className="flex items-center gap-2">
          <LineSwatch color={MODEL_COLORS.hist} /> Historical
        </span>
      )}
      <span className="flex items-center gap-2">
        <LineSwatch color={MODEL_COLORS.srnn} dashed /> {MODEL_LABELS.srnn}
      </span>
      <span className="flex items-center gap-2">
        <LineSwatch color={MODEL_COLORS.gru} dashed /> {MODEL_LABELS.gru}
      </span>
      <span className="flex items-center gap-2">
        <LineSwatch color={MODEL_COLORS.lstm} dashed /> {MODEL_LABELS.lstm}
      </span>
    </div>
  );
}

/** Main chart: full history (solid black) + 60-day prediction (dashed). */
export function HistoryPredictionChart({
  data,
  days,
}: {
  data: StockArtifact;
  days: number; // history window to display (Infinity = all)
}) {
  const rows = useMemo<ChartRow[]>(() => {
    const n = data.history.dates.length;
    const start = days === Infinity ? 0 : Math.max(0, n - days);
    const out: ChartRow[] = [];
    for (let i = start; i < n; i++) {
      out.push({
        t: data.history.dates[i],
        hist: data.history.close[i],
        srnn: null,
        gru: null,
        lstm: null,
      });
    }
    for (let k = 0; k < data.future.dates.length; k++) {
      out.push({
        t: data.future.dates[k],
        hist: null,
        srnn: data.future.srnn[k],
        gru: data.future.gru[k],
        lstm: data.future.lstm[k],
      });
    }
    return out;
  }, [data, days]);

  const lastHistDate = data.history.dates[data.history.dates.length - 1];
  const maxY = useMemo(() => {
    let m = 0;
    for (const r of rows) {
      for (const v of [r.hist, r.srnn, r.gru, r.lstm]) if (v != null && v > m) m = v;
    }
    return m * 1.08;
  }, [rows]);

  const dashed = (key: "srnn" | "gru" | "lstm", color: string) => (
    <Line
      dataKey={key}
      stroke={color}
      strokeWidth={2}
      strokeDasharray="6 4"
      connectNulls={false}
      dot={false}
      activeDot={{ r: 4, strokeWidth: 0 }}
    />
  );

  return (
    <Card>
      <CardTitle>Stock Price: Historical Data + Next {data.config.horizon} Days Prediction</CardTitle>
      <div className="mt-3">
        <Legend showHistorical />
      </div>
      <div className="mt-3 h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={THEME.grid} vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={fmtYear}
              tick={{ fill: THEME.tick, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: THEME.axis }}
              minTickGap={72}
            />
            <YAxis
              domain={[0, maxY]}
              tick={{ fill: THEME.tick, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => `$${v}`}
            />
            <Tooltip content={(props: unknown) => <TooltipBox {...(props as object)} />} />
            <Line
              dataKey="hist"
              stroke={MODEL_COLORS.hist}
              strokeWidth={1.6}
              connectNulls={false}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
            {dashed("srnn", MODEL_COLORS.srnn)}
            {dashed("gru", MODEL_COLORS.gru)}
            {dashed("lstm", MODEL_COLORS.lstm)}
            <ReferenceLine
              x={lastHistDate}
              stroke="#9ca3af"
              strokeDasharray="6 4"
              label={{
                value: `Next ${data.config.horizon} Days`,
                position: "insideBottomRight",
                fill: THEME.ink,
                fontSize: 12,
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 text-center text-xs" style={{ color: "var(--muted)" }}>
        Year
      </div>
    </Card>
  );
}

/** Right-hand chart: the three model forecasts across the horizon. */
export function FutureChart({
  data,
  height = "h-72",
}: {
  data: StockArtifact;
  height?: string;
}) {
  const lastClose = data.history.close[data.history.close.length - 1];
  const rows = useMemo(() => {
    const out = [
      { day: 0, srnn: lastClose, gru: lastClose, lstm: lastClose },
    ];
    for (let k = 0; k < data.future.dates.length; k++) {
      out.push({
        day: k + 1,
        srnn: data.future.srnn[k],
        gru: data.future.gru[k],
        lstm: data.future.lstm[k],
      });
    }
    return out;
  }, [data, lastClose]);

  let min = Infinity;
  let max = -Infinity;
  for (const r of rows) {
    min = Math.min(min, r.srnn, r.gru, r.lstm);
    max = Math.max(max, r.srnn, r.gru, r.lstm);
  }

  return (
    <Card className="flex flex-col">
      <CardTitle>Next {data.config.horizon} Days Prediction</CardTitle>
      <div className="mt-3 flex-1">
        <Legend showHistorical={false} />
        <div className={`mt-3 w-full ${height}`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={THEME.grid} vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fill: THEME.tick, fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: THEME.axis }}
                domain={[0, data.config.horizon]}
                ticks={[0, 10, 20, 30, 40, 50, 60].filter((t) => t <= data.config.horizon)}
              />
              <YAxis
                domain={[min * 0.96, max * 1.04]}
                tick={{ fill: THEME.tick, fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v: number) => `$${Math.round(v)}`}
              />
              <Tooltip content={(props: unknown) => <TooltipBox {...(props as object)} labelFmt={(l) => `Day ${l}`} />} />
              <Line dataKey="srnn" stroke={MODEL_COLORS.srnn} strokeWidth={2} strokeDasharray="6 4" dot={false} />
              <Line dataKey="gru" stroke={MODEL_COLORS.gru} strokeWidth={2} strokeDasharray="6 4" dot={false} />
              <Line dataKey="lstm" stroke={MODEL_COLORS.lstm} strokeWidth={2} strokeDasharray="6 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 text-center text-xs" style={{ color: "var(--muted)" }}>
          Days
        </div>
      </div>
    </Card>
  );
}

/** Results tab: one-step-ahead test-set predictions vs actual. */
export function TestSetChart({ data }: { data: StockArtifact }) {
  const rows = useMemo<ChartRow[]>(
    () =>
      data.testSeries.dates.map((d, i) => ({
        t: d,
        hist: data.testSeries.actual[i],
        srnn: data.testSeries.srnn[i],
        gru: data.testSeries.gru[i],
        lstm: data.testSeries.lstm[i],
      })),
    [data],
  );

  return (
    <Card>
      <CardTitle>Test Set: Actual vs Predicted (one step ahead)</CardTitle>
      <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
        {data.split.testStart} → {data.split.testEnd} · {data.split.testRecords} trading days
      </p>
      <div className="mt-3">
        <Legend showHistorical />
      </div>
      <div className="mt-3 h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={THEME.grid} vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={fmtTick}
              tick={{ fill: THEME.tick, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: THEME.axis }}
              minTickGap={72}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fill: THEME.tick, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => `$${v}`}
            />
            <Tooltip content={(props: unknown) => <TooltipBox {...(props as object)} />} />
            <Line dataKey="hist" stroke={MODEL_COLORS.hist} strokeWidth={1.6} dot={false} />
            <Line dataKey="srnn" stroke={MODEL_COLORS.srnn} strokeWidth={2} strokeDasharray="6 4" dot={false} />
            <Line dataKey="gru" stroke={MODEL_COLORS.gru} strokeWidth={2} strokeDasharray="6 4" dot={false} />
            <Line dataKey="lstm" stroke={MODEL_COLORS.lstm} strokeWidth={2} strokeDasharray="6 4" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
