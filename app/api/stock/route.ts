import { NextRequest, NextResponse } from "next/server";
import { fetchChart, fetchQuoteSummary, isoDateFromTimestamp } from "@/lib/yahoo";
import { linearForecast } from "@/lib/forecast";
import type { HistoryPoint, StockResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

interface CalendarEarnings {
  earnings?: {
    earningsDate?: { fmt?: string }[];
    earningsCallDate?: { fmt?: string }[];
    isEarningsDateEstimate?: boolean;
    earningsAverage?: { raw?: number };
    revenueAverage?: { raw?: number };
  };
}

export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: "A stock symbol is required." }, { status: 400 });
  }

  try {
    const chart = await fetchChart(symbol);
    const { meta, timestamp, quote } = chart;

    const history: HistoryPoint[] = [];
    for (let i = 0; i < timestamp.length; i++) {
      const close = quote.close[i];
      if (close == null) continue;
      history.push({
        date: isoDateFromTimestamp(timestamp[i]),
        open: quote.open[i] ?? close,
        high: quote.high[i] ?? close,
        low: quote.low[i] ?? close,
        close,
        volume: quote.volume[i] ?? 0,
      });
    }
    if (history.length === 0) {
      throw new Error("No historical data returned for this symbol.");
    }

    // Yesterday's close = the candle before the latest one.
    const previousClose =
      history.length > 1 ? history[history.length - 2].close : meta.chartPreviousClose;

    // Earnings calendar (optional - the page still works without it).
    let nextDate: string | null = null;
    let isEstimate = false;
    let lastCallDate: string | null = null;
    let epsEstimate: number | null = null;
    let revenueEstimate: number | null = null;
    try {
      const summary = await fetchQuoteSummary(symbol, "calendarEvents");
      const earnings = summary?.calendarEvents as CalendarEarnings | undefined;
      if (earnings?.earnings) {
        nextDate = earnings.earnings.earningsDate?.[0]?.fmt ?? null;
        lastCallDate = earnings.earnings.earningsCallDate?.[0]?.fmt ?? null;
        isEstimate = Boolean(earnings.earnings.isEarningsDateEstimate);
        epsEstimate = earnings.earnings.earningsAverage?.raw ?? null;
        revenueEstimate = earnings.earnings.revenueAverage?.raw ?? null;
      }
    } catch {
      // calendar is a nice-to-have; ignore failures
    }

    const body: StockResponse = {
      meta: {
        symbol: meta.symbol,
        companyName: meta.longName ?? meta.shortName ?? symbol,
        currency: meta.currency ?? "USD",
        exchangeName: meta.fullExchangeName ?? meta.exchangeName ?? "",
        price: meta.regularMarketPrice ?? history[history.length - 1].close,
        previousClose,
        dayHigh: meta.regularMarketDayHigh ?? history[history.length - 1].high,
        dayLow: meta.regularMarketDayLow ?? history[history.length - 1].low,
        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? 0,
        fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? 0,
        volume: meta.regularMarketVolume ?? history[history.length - 1].volume,
        marketTime: new Date((meta.regularMarketTime ?? 0) * 1000).toISOString(),
      },
      history,
      forecast: linearForecast(history),
      earnings: { nextDate, isEstimate, lastCallDate, epsEstimate, revenueEstimate },
    };

    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load stock data.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
