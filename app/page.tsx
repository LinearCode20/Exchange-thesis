"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar, { type TabKey } from "@/components/dashboard/Sidebar";
import KpiRow from "@/components/dashboard/KpiRow";
import DataAudioCard from "@/components/dashboard/DataAudioCard";
import { HistoryPredictionChart, FutureChart } from "@/components/dashboard/charts";
import { MetricsTableCard, PredictionTableCard } from "@/components/dashboard/tables";
import { AboutTab, DataInfoTab, ModelsTab, PredictionsTab, ResultsTab } from "@/components/dashboard/tabs";
import { Card } from "@/components/dashboard/ui";
import { ChevronDownIcon, InfoIcon, LogoMark, RefreshIcon } from "@/components/dashboard/icons";
import { classifySentiment } from "@/lib/sentiment";
import type {
  DatasetIndex,
  EarningsResponse,
  QuoteResponse,
  StockArtifact,
} from "@/lib/types";

const STOCKS = [
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "MSFT", name: "Microsoft Corporation" },
  { symbol: "NVDA", name: "NVIDIA Corporation" },
  { symbol: "TSLA", name: "Tesla, Inc." },
];

const PERIOD_DAYS: { key: string; days: number; years: number }[] = [
  { key: "10y", days: Infinity, years: 10 },
  { key: "5y", days: 1260, years: 5 },
  { key: "3y", days: 756, years: 3 },
  { key: "1y", days: 252, years: 1 },
];

/** Fetch JSON, turning non-JSON error pages into readable messages. */
async function fetchApi<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Request failed with HTTP ${res.status}.`);
  }
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed with HTTP ${res.status}.`;
    throw new Error(message);
  }
  return body as T;
}

function SelectCard({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className="relative block rounded-xl px-4 py-2.5"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <span className="block text-xs" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-transparent pr-7 text-sm font-medium outline-none"
        style={{ color: "var(--ink)" }}
      >
        {children}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 bottom-3"
        style={{ color: "var(--muted)" }}
      >
        <ChevronDownIcon size={16} />
      </span>
    </label>
  );
}

export default function Home() {
  const [symbol, setSymbol] = useState("AAPL");
  const [periodKey, setPeriodKey] = useState("10y");
  const [tab, setTab] = useState<TabKey>("overview");

  const [data, setData] = useState<StockArtifact | null>(null);
  const [index, setIndex] = useState<DatasetIndex | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [earnings, setEarnings] = useState<EarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (sym: string) => {
    setLoading(true);
    setError(null);
    try {
      const artifact = await fetchApi<StockArtifact>(`/api/predict?symbol=${encodeURIComponent(sym)}`);
      setData(artifact);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(symbol);
  }, [symbol, load]);

  useEffect(() => {
    fetchApi<DatasetIndex>("/api/dataset-index").then(setIndex).catch(() => setIndex(null));
  }, []);

  // Optional, non-blocking side data (failures leave the cards empty).
  useEffect(() => {
    setQuote(null);
    setEarnings(null);
    fetchApi<QuoteResponse>(`/api/quote?symbol=${symbol}`).then(setQuote).catch(() => setQuote(null));
    fetchApi<EarningsResponse>(`/api/earnings?symbol=${symbol}`)
      .then(setEarnings)
      .catch(() => setEarnings(null));
  }, [symbol]);

  const period = useMemo(
    () => PERIOD_DAYS.find((p) => p.key === periodKey) ?? PERIOD_DAYS[0],
    [periodKey],
  );

  const audio = useMemo(() => {
    if (!earnings) return null;
    const titles = [...earnings.videos, ...earnings.news].map((m) => m.title);
    return {
      files: titles.length,
      hours: titles.length * 2, // a recorded earnings webcast is ~2 hours
      sentiment: classifySentiment(titles),
    };
  }, [earnings]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <LogoMark size={34} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Stock Prediction Dashboard</h1>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Baseline: SRNN&ensp;|&ensp;Proposed Models: GRU &amp; LSTM
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <SelectCard label="Select Stock" value={symbol} onChange={setSymbol}>
            {STOCKS.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.symbol} - {s.name}
              </option>
            ))}
          </SelectCard>
          {data && (
            <SelectCard label="Data Period" value={periodKey} onChange={setPeriodKey}>
              {PERIOD_DAYS.map((p) => {
                const n = data.history.dates.length;
                const start =
                  p.days === Infinity
                    ? data.history.dates[0]
                    : data.history.dates[Math.max(0, n - p.days)];
                return (
                  <option key={p.key} value={p.key}>
                    {start} to {data.dataPeriod.end} ({p.years} {p.years === 1 ? "Year" : "Years"})
                  </option>
                );
              })}
            </SelectCard>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 pb-10 sm:px-6 lg:flex-row">
        <Sidebar tab={tab} onTab={setTab} />

        <main className="min-w-0 flex-1 space-y-4">
          {error && (
            <div
              className="flex items-center justify-between gap-3 rounded-xl p-4 text-sm"
              style={{ background: "var(--surface)", border: "1px solid #fca5a5", color: "#b91c1c" }}
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={() => load(symbol)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                style={{ background: "var(--primary)" }}
              >
                <RefreshIcon size={14} /> Retry
              </button>
            </div>
          )}

          {loading && (
            <Card className="flex items-center gap-3 text-sm">
              <span
                aria-hidden
                className="inline-block h-4 w-4 animate-spin rounded-full border-2"
                style={{ borderColor: "var(--muted)", borderTopColor: "transparent" }}
              />
              <span style={{ color: "var(--muted)" }}>Loading model results for {symbol}…</span>
            </Card>
          )}

          {data && !loading && (
            <>
              {tab === "overview" && (
                <div className="space-y-4">
                  <KpiRow data={data} audioFiles={audio?.files ?? null} />
                  <section className="grid gap-4 xl:grid-cols-3">
                    <div className="xl:col-span-2">
                      <HistoryPredictionChart data={data} days={period.days} />
                    </div>
                    <FutureChart data={data} />
                  </section>
                  <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    <MetricsTableCard metrics={data.metrics} />
                    <DataAudioCard data={data} audio={audio} />
                    <PredictionTableCard data={data} />
                  </section>
                  <div
                    className="flex items-start gap-3 rounded-xl p-4 text-sm"
                    style={{ background: "var(--primary-soft)", border: "1px solid var(--border)" }}
                  >
                    <span aria-hidden style={{ color: "var(--primary)" }}>
                      <InfoIcon size={20} />
                    </span>
                    <p>
                      <strong>Note:</strong> Past performance is not indicative of future results.
                    </p>
                  </div>
                </div>
              )}
              {tab === "data" && <DataInfoTab data={data} index={index} quote={quote} />}
              {tab === "models" && <ModelsTab data={data} />}
              {tab === "predictions" && <PredictionsTab data={data} />}
              {tab === "results" && <ResultsTab data={data} index={index} />}
              {tab === "about" && <AboutTab />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
