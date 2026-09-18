import { NextRequest, NextResponse } from "next/server";
import { fetchChart } from "@/lib/yahoo";
import type { QuoteResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Live current-day rate from Yahoo Finance (used on the Data Info tab). */
export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: "A stock symbol is required." }, { status: 400 });
  }
  try {
    const { meta } = await fetchChart(symbol, "5d", "1d");
    const price = meta.regularMarketPrice ?? meta.chartPreviousClose;
    const previousClose = meta.chartPreviousClose;
    const body: QuoteResponse = {
      symbol: meta.symbol,
      companyName: meta.longName ?? meta.shortName ?? symbol,
      currency: meta.currency ?? "USD",
      price,
      previousClose,
      changePct: previousClose ? ((price - previousClose) / previousClose) * 100 : 0,
      marketTime: new Date((meta.regularMarketTime ?? 0) * 1000).toISOString(),
    };
    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load the live quote.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
