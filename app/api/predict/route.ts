import { NextRequest, NextResponse } from "next/server";
import aapl from "@/data/results/AAPL.json";
import msft from "@/data/results/MSFT.json";
import nvda from "@/data/results/NVDA.json";
import tsla from "@/data/results/TSLA.json";
import type { StockArtifact } from "@/lib/types";

/**
 * Serves the precomputed experiment artifacts produced by
 * scripts/train-models.mjs. Static imports keep the JSON in the serverless
 * bundle, so this works on Vercel with no filesystem access.
 */
const RESULTS: Record<string, StockArtifact> = {
  AAPL: aapl as unknown as StockArtifact,
  MSFT: msft as unknown as StockArtifact,
  NVDA: nvda as unknown as StockArtifact,
  TSLA: tsla as unknown as StockArtifact,
};

export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "").trim().toUpperCase();
  const artifact = RESULTS[symbol];
  if (!artifact) {
    return NextResponse.json(
      { error: `No trained model results for "${symbol || "?"}". Available: ${Object.keys(RESULTS).join(", ")}.` },
      { status: 404 },
    );
  }
  return NextResponse.json(artifact);
}
