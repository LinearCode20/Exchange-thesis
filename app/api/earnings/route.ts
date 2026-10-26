import { NextRequest, NextResponse } from "next/server";
import { fetchSearch } from "@/lib/yahoo";
import type { YahooSearchResult } from "@/lib/yahoo";
import type { EarningsResponse, MediaItem } from "@/lib/types";

export const dynamic = "force-dynamic";

const CACHE_TTL = 10 * 60 * 1000;

const cache = new Map<string, { data: EarningsResponse; expires: number }>();

export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: "A stock symbol is required." }, { status: 400 });
  }

  const cached = cache.get(symbol);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json(cached.data);
  }

  // News/video lookups are a nice-to-have: on a flaky network this fetch may
  // fail entirely, and the panel should still render (YouTube search link).
  let search: YahooSearchResult = { quotes: [], news: [] };
  try {
    search = await fetchSearch(symbol);
  } catch {
    // keep the empty fallback
  }

  // Search can come back empty (network); avoid a "AAPL AAPL" YouTube query.
  const rawName = search.quotes[0]?.longname ?? search.quotes[0]?.shortname ?? "";
  const companyName = rawName && rawName !== symbol ? `${rawName} ` : "";

  const videos: MediaItem[] = [];
  const news: MediaItem[] = [];
  for (const item of search.news) {
    if (!item.link) continue;
    const isVideo = item.link.includes("/video/") || item.publisher.includes("Video");
    (isVideo ? videos : news).push(item);
  }

  const body: EarningsResponse = {
    videos: videos.slice(0, 4),
    news: news.slice(0, 5),
    youtubeQuery: `${companyName}${symbol} earnings call`,
  };

  cache.set(symbol, { data: body, expires: Date.now() + CACHE_TTL });
  return NextResponse.json(body);
}
