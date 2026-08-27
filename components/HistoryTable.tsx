import type { HistoryPoint } from "@/lib/types";

const ROWS_SHOWN = 12;

export default function HistoryTable({ history }: { history: HistoryPoint[] }) {
  const rows = [...history].reverse().slice(0, ROWS_SHOWN);
  const money = (v: number) =>
    v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr style={{ color: "var(--muted)" }}>
            <th className="py-2 pr-4 text-left font-medium">Date</th>
            <th className="py-2 pr-4 text-right font-medium">Open</th>
            <th className="py-2 pr-4 text-right font-medium">High</th>
            <th className="py-2 pr-4 text-right font-medium">Low</th>
            <th className="py-2 pr-4 text-right font-medium">Close</th>
            <th className="py-2 pr-4 text-right font-medium">Change</th>
            <th className="py-2 text-right font-medium">Volume</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const prev = rows[i + 1]?.close ?? r.open;
            const chg = prev ? ((r.close - prev) / prev) * 100 : 0;
            const up = chg >= 0;
            return (
              <tr
                key={r.date}
                className="border-t"
                style={{ borderColor: "var(--border)", color: "var(--ink-2)" }}
              >
                <td className="py-2 pr-4" style={{ color: "var(--ink)" }}>
                  {r.date}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">{money(r.open)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{money(r.high)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{money(r.low)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{money(r.close)}</td>
                <td
                  className="py-2 pr-4 text-right tabular-nums"
                  style={{ color: up ? "var(--up)" : "var(--down)" }}
                >
                  {up ? "+" : ""}
                  {chg.toFixed(2)}%
                </td>
                <td className="py-2 text-right tabular-nums">{r.volume.toLocaleString("en-US")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
