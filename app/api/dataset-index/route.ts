import { NextResponse } from "next/server";
import index from "@/data/results/_index.json";
import type { DatasetIndex } from "@/lib/types";

/** Cross-stock dataset + metrics summary (from scripts/train-models.mjs). */
export async function GET() {
  return NextResponse.json(index as unknown as DatasetIndex);
}
