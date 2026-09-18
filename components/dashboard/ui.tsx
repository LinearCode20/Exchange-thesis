import type { ReactNode } from "react";

/** White rounded card used for every panel of the dashboard. */
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl p-5 ${className}`}
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-base font-semibold">{children}</h2>;
}

/** Dashed line swatch for chart legends. */
export function LineSwatch({ color, dashed = false }: { color: string; dashed?: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block h-0.5 w-5 rounded-full"
      style={{
        background: dashed
          ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)`
          : color,
      }}
    />
  );
}

export const MODEL_COLORS = {
  srnn: "#3b82f6", // baseline — blue
  gru: "#22c55e", // proposed — green
  lstm: "#ef4444", // proposed — red
  hist: "#111827", // historical — near black
} as const;

export const MODEL_LABELS = {
  srnn: "SRNN (Baseline)",
  gru: "GRU (Proposed)",
  lstm: "LSTM (Proposed)",
} as const;

export const money = (v: number) =>
  `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtInt = (v: number) => v.toLocaleString("en-US");

export const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
