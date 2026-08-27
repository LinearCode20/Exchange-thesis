"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Forecast, HistoryPoint } from "@/lib/types";

interface ChartRow {
  t: string;
  price: number | null;
  forecast: number | null;
}

interface TooltipPayloadEntry {
  dataKey?: string | number;
  value?: number | string;
}

/** Light/dark steps from the validated chart palette. */
const THEME = {
  light: {
    s1: "#2a78d6",
    s2: "#eb6834",
    ink: "#0b0b0b",
    ink2: "#52514e",
    muted: "#898781",
    grid: "#e1e0d9",
    axis: "#c3c2b7",
    surface: "#fcfcfb",
  },
  dark: {
    s1: "#3987e5",
    s2: "#d95926",
    ink: "#ffffff",
    ink2: "#c3c2b7",
    muted: "#898781",
    grid: "#2c2c2a",
    axis: "#383835",
    surface: "#1a1a19",
  },
} as const;

const RANGES = [
  { key: "1m", label: "1M", days: 22 },
  { key: "3m", label: "3M", days: 66 },
  { key: "6m", label: "6M", days: Infinity },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

function usePrefersDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDark(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return dark;
}

const fmtTick = (t: string) =>
  new Date(`${t}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const fmtMoney = (v: number) =>
  `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PriceChart({
  history,
  forecast,
}: {
  history: HistoryPoint[];
  forecast: Forecast;
}) {
  const dark = usePrefersDark();
  const c = THEME[dark ? "dark" : "light"];
  const [rangeKey, setRangeKey] = useState<RangeKey>("6m");
  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[2];

  const rows = useMemo<ChartRow[]>(() => {
    const sliced = range.days === Infinity ? history : history.slice(-range.days);
    const out: ChartRow[] = sliced.map((h) => ({ t: h.date, price: h.close, forecast: null }));
    if (out.length > 0) {
      out[out.length - 1].forecast = out[out.length - 1].price; // join actual & projected lines
    }
    for (const p of forecast.points) {
      out.push({ t: p.date, price: null, forecast: p.price });
    }
    return out;
  }, [history, forecast, range]);

  const lastPoint = forecast.points[forecast.points.length - 1];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Legend (two series) */}
        <div className="flex items-center gap-5 text-sm" style={{ color: "var(--ink-2)" }}>
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-0.5 w-5 rounded-full"
              style={{ background: c.s1 }}
            />
            Close
          </span>
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-0.5 w-5 rounded-full"
              style={{
                background: `repeating-linear-gradient(90deg, ${c.s2} 0 4px, transparent 4px 7px)`,
              }}
            />
            Trend projection
          </span>
        </div>

        {/* Range filter */}
        <div className="flex gap-1 rounded-lg p-1" style={{ background: "var(--wash)" }}>
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRangeKey(r.key)}
              className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
              style={
                r.key === rangeKey
                  ? { background: "var(--surface)", color: "var(--ink)" }
                  : { color: "var(--muted)" }
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={c.grid} strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={fmtTick}
              tick={{ fill: c.muted, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: c.axis }}
              minTickGap={48}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fill: c.muted, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={58}
              tickFormatter={(v: number) => `$${v}`}
            />
            <Tooltip
              cursor={{ stroke: c.axis, strokeWidth: 1 }}
              content={(props: unknown) => {
                const { active, label, payload } = props as {
                  active?: boolean;
                  label?: string;
                  payload?: TooltipPayloadEntry[];
                };
                if (!active || !payload?.length) return null;
                const price = payload.find((p) => p.dataKey === "price")?.value;
                const proj = payload.find((p) => p.dataKey === "forecast")?.value;
                return (
                  <div
                    className="rounded-lg px-3 py-2 text-xs shadow-sm"
                    style={{
                      background: c.surface,
                      border: "1px solid var(--border)",
                      color: c.ink2,
                    }}
                  >
                    <div className="font-medium" style={{ color: c.ink }}>
                      {fmtTick(String(label))}
                    </div>
                    {price != null && (
                      <div className="mt-1 flex items-center gap-1.5">
                        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: c.s1 }} />
                        Close {fmtMoney(Number(price))}
                      </div>
                    )}
                    {proj != null && (
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: c.s2 }} />
                        Projected {fmtMoney(Number(proj))}
                      </div>
                    )}
                  </div>
                );
              }}
            />
            <Area
              dataKey="price"
              stroke={c.s1}
              strokeWidth={2}
              fill={c.s1}
              fillOpacity={0.1}
              connectNulls={false}
              dot={false}
              activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }}
            />
            <Line
              dataKey="forecast"
              stroke={c.s2}
              strokeWidth={2}
              strokeDasharray="6 4"
              connectNulls={false}
              dot={false}
              activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }}
            />
            {lastPoint && (
              <ReferenceDot
                x={lastPoint.date}
                y={lastPoint.price}
                r={4}
                fill={c.s2}
                stroke={c.surface}
                strokeWidth={2}
                label={{
                  value: fmtMoney(lastPoint.price),
                  position: "top",
                  fill: c.ink,
                  fontSize: 12,
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
