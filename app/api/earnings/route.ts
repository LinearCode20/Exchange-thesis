import { NextRequest, NextResponse } from "next/server";
import { fetchQuoteSummary, fetchSearch } from "@/lib/yahoo";
import type { EarningsResponse, MediaItem, TranscriptData } from "@/lib/types";

export const dynamic = "force-dynamic";

const FMP_BASE = "https://financialmodelingprep.com/api/v3";
const CACHE_TTL = 10 * 60 * 1000; 

const cache = new Map<string, { data: EarningsResponse; expires: number }>();

/** Most recent 8 calendar quarters, newest first. */
function quarterCandidates(): { year: number; quarter: number }[] {
  const now = new Date();
  const list: { year: number; quarter: number }[] = [];
  let year = now.getUTCFullYear();
  let quarter = Math.floor(now.getUTCMonth() / 3) + 1;
  for (let i = 0; i < 8; i++) {
    list.push({ year, quarter });
    quarter -= 1;
    if (quarter === 0) {
      quarter = 4;
      year -= 1;
    }
  }
  return list;
}

interface FmpTranscript {
  symbol?: string;
  quarter?: number;
  year?: number;
  date?: string;
  content?: string;
}

/**
 * Earnings-call transcript text via Financial Modeling Prep.
 * Free API key required (https://site.financialmodelingprep.com) - returns
 * null when no key is configured or nothing was found.
 */
async function fetchTranscript(symbol: string): Promise<TranscriptData | null> {
  const key = process.env.FMP_API_KEY;
  if (!key) return null;

  for (const { year, quarter } of quarterCandidates()) {
    try {
      const res = await fetch(
        `${FMP_BASE}/earning_call_transcript/${encodeURIComponent(symbol)}?quarter=${quarter}&year=${year}&apikey=${key}`,
        { cache: "no-store" },
      );
      if (!res.ok) continue;
      const json: unknown = await res.json();
      const item = Array.isArray(json) ? (json[0] as FmpTranscript | undefined) : undefined;
      if (item?.content) {
        return {
          symbol,
          quarter: item.quarter ?? quarter,
          year: item.year ?? year,
          date: item.date ?? "",
          content: item.content,
        };
      }
    } catch {
      // try the next quarter back
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: "A stock symbol is required." }, { status: 400 });
  }

  const cached = cache.get(symbol);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json(cached.data);
  }

  const search = await fetchSearch(symbol);
  const companyName = search.quotes[0]?.longname ?? search.quotes[0]?.shortname ?? symbol;

  const videos: MediaItem[] = [];
  const news: MediaItem[] = [];
  for (const item of search.news) {
    if (!item.link) continue;
    const isVideo = item.link.includes("/video/") || item.publisher.includes("Video");
    (isVideo ? videos : news).push(item);
  }

  let lastCallDate: string | null = null;
  try {
    const summary = await fetchQuoteSummary(symbol, "calendarEvents");
    const earnings = summary?.calendarEvents as
      | { earnings?: { earningsCallDate?: { fmt?: string }[] } }
      | undefined;
    lastCallDate = earnings?.earnings?.earningsCallDate?.[0]?.fmt ?? null;
  } catch {
    // optional
  }

  const body: EarningsResponse = {
    videos: videos.slice(0, 4),
    news: news.slice(0, 5),
    youtubeQuery: `${companyName} ${symbol} earnings call`,
    transcript: await fetchTranscript(symbol),
    transcriptAvailable: Boolean(process.env.FMP_API_KEY),
  };

  cache.set(symbol, { data: body, expires: Date.now() + CACHE_TTL });
  return NextResponse.json(body);
}
