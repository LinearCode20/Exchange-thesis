"use client";

import { useState } from "react";
import EarningsPanel from "@/components/EarningsPanel";
import ForecastCard from "@/components/ForecastCard";
import HistoryTable from "@/components/HistoryTable";
import StatCard from "@/components/StatCard";
import type { EarningsResponse, StockResponse } from "@/lib/types";

const SYMBOLS = [
  "AAPL",
  "MSFT",
  // "NVDA",
  // "AMZN",
  // "GOOGL",
  // "META",
  // "TSLA",
  // "AMD",
  // "INTC",
  // "ADBE",
  // "NFLX",
  // "QCOM",
  // "CSCO",
  // "AVGO",
  // "PYPL",
];

const money = (v: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(v);

/**
 * Fetch JSON, turning non-JSON error pages (e.g. the Python backend is not
 * running and the proxy answers with a plain-text error) into actionable
 * messages instead of "Unexpected token …" crashes.
 */
async function fetchApi<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    if (res.status >= 500) {
      throw new Error(
        "The Python backend is not reachable. Start it in a second terminal: cd backend, activate the venv, then run: python main.py (see README).",
      );
    }
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

export default function Home() {
  const [symbol, setSymbol] = useState("AAPL");
  const [stock, setStock] = useState<StockResponse | null>(null);
  const [earnings, setEarnings] = useState<EarningsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!symbol || loading) return;
    setLoading(true);
    setError(null);
    try {
      const [stockJson, earningsJson] = await Promise.all([
        fetchApi<StockResponse>(`/api/stock?symbol=${encodeURIComponent(symbol)}`),
        fetchApi<EarningsResponse>(`/api/earnings?symbol=${encodeURIComponent(symbol)}`),
      ]);
      setStock(stockJson);
      setEarnings(earningsJson);
    } catch (err) {
      setStock(null);
      setEarnings(null);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const meta = stock?.meta;
  const lastClose = stock && stock.history.length > 0
    ? stock.history[stock.history.length - 1].close
    : 0;
  const dayChange = meta ? meta.price - meta.previousClose : 0;
  const dayChangePct =
    meta && meta.previousClose !== 0 ? (dayChange / meta.previousClose) * 100 : 0;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Stock Dashboard</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Current rate, history, trend projection and earnings calls — powered by Yahoo Finance.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-wrap items-center gap-3">
        <label htmlFor="symbol" className="sr-only">
          Stock symbol
        </label>
        <select
          id="symbol"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="h-11 w-56 rounded-lg px-3 text-sm font-medium"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink)" }}
        >
          {SYMBOLS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={loading}
          className="h-11 rounded-lg px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          {loading ? "Loading…" : "Show data"}
        </button>
      </form>

      {error && (
        <div
          className="mt-6 rounded-lg p-4 text-sm"
          style={{ background: "var(--wash)", border: "1px solid var(--down)", color: "var(--down)" }}
        >
          {error}
        </div>
      )}

      {!stock && !loading && !error && (
        <div
          className="mt-6 rounded-xl p-10 text-center text-sm"
          style={{ border: "1px dashed var(--axis)", color: "var(--muted)" }}
        >
          Select a ticker above and press{" "}
          <span style={{ color: "var(--ink)" }}>Show data</span> to see the current rate, charts,
          historical data and earnings calls.
        </div>
      )}

      {loading && (
        <div
          className="mt-6 flex items-center gap-3 rounded-xl p-6 text-sm"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }}
        >
          <span
            aria-hidden
            className="inline-block h-4 w-4 animate-spin rounded-full border-2"
            style={{ borderColor: "var(--muted)", borderTopColor: "transparent" }}
          />
          Fetching {symbol} — price, history, projection and earnings calls…
        </div>
      )}

      {stock && meta && (
        <div className="mt-8 space-y-6">
          {/* KPI row */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={`${meta.symbol} · current rate`}
              value={money(meta.price, meta.currency)}
              delta={dayChangePct}
              deltaText={`${dayChange >= 0 ? "+" : "−"}${money(Math.abs(dayChange), meta.currency)} (${Math.abs(dayChangePct).toFixed(2)}%)`}
              sub={`Prev close ${money(meta.previousClose, meta.currency)}`}
            />
            <StatCard
              label="Day range"
              value={`${money(meta.dayLow, meta.currency)} – ${money(meta.dayHigh, meta.currency)}`}
              sub={`Volume ${meta.volume.toLocaleString("en-US")}`}
            />
            <StatCard
              label="52-week range"
              value={`${money(meta.fiftyTwoWeekLow, meta.currency)} – ${money(meta.fiftyTwoWeekHigh, meta.currency)}`}
              sub={meta.exchangeName}
            />
            <StatCard
              label="Next earnings"
              value={stock.earnings.nextDate ?? "N/A"}
              sub={
                stock.earnings.epsEstimate != null
                  ? `EPS est. $${stock.earnings.epsEstimate.toFixed(2)}${stock.earnings.isEstimate ? " · date estimated" : ""}`
                  : undefined
              }
            />
          </section>

          {/* Historical data + next-month projection */}
          <section className="grid gap-4 lg:grid-cols-3">
            <div
              className="rounded-xl p-5 lg:col-span-2"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold">Historical data (most recent)</h2>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {stock.history.length} trading days loaded · showing latest 12
                </span>
              </div>
              <div className="mt-3">
                <HistoryTable history={stock.history} />
              </div>
            </div>
            <ForecastCard forecast={stock.forecast} lastClose={lastClose} />
          </section>

          {/* Earnings calls + media */}
          <EarningsPanel
            data={
              earnings ?? {
                videos: [],
                news: [],
                youtubeQuery: `${meta.companyName} ${meta.symbol} earnings call`,
                transcript: null,
                transcriptAvailable: false,
              }
            }
          />
        </div>
      )}
    </main>
  );
}
