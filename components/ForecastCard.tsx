import type { Forecast } from "@/lib/types";

export default function ForecastCard({
  forecast,
  lastClose,
}: {
  forecast: Forecast;
  lastClose: number;
}) {
  const up = forecast.changePct >= 0;
  const money = (v: number) =>
    `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div
      className="flex flex-col rounded-xl p-5"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <h2 className="font-semibold">Next-month outlook</h2>
      <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
        ~21 trading days ahead
      </p>

      <div className="mt-4 text-3xl font-semibold tracking-tight">{money(forecast.endPrice)}</div>
      <div
        className="mt-1 text-sm font-medium"
        style={{ color: up ? "var(--up)" : "var(--down)" }}
      >
        <span aria-hidden>{up ? "▲" : "▼"}</span> {up ? "+" : ""}
        {forecast.changePct.toFixed(1)}% vs today
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt style={{ color: "var(--muted)" }}>Typical range</dt>
          <dd className="text-right tabular-nums">
            {money(forecast.endLow)} – {money(forecast.endHigh)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt style={{ color: "var(--muted)" }}>Today&apos;s close</dt>
          <dd className="tabular-nums">{money(lastClose)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt style={{ color: "var(--muted)" }}>Method</dt>
          <dd>Linear trend</dd>
        </div>
      </dl>

      <p className="mt-4 text-xs leading-5" style={{ color: "var(--muted)" }}>
        Least-squares trend fitted on the last {forecast.windowDays} trading days and extended one
        month out; the range is ±1σ (≈ {money(forecast.sigma)}) of that fit. A statistical
        estimate for coursework only — not a market prediction.
      </p>
    </div>
  );
}
