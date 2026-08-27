interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  /** Signed percent change; picks the up/down color. */
  delta?: number;
  /** Preformatted change text, e.g. "+$1.23 (+0.39%)". */
  deltaText?: string;
}

export default function StatCard({ label, value, sub, delta, deltaText }: StatCardProps) {
  const up = (delta ?? 0) >= 0;
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="text-sm" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight break-words">{value}</div>
      {deltaText && (
        <div
          className="mt-1 text-sm font-medium"
          style={{ color: up ? "var(--up)" : "var(--down)" }}
        >
          <span aria-hidden>{up ? "▲" : "▼"}</span> {deltaText}
        </div>
      )}
      {sub && (
        <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
