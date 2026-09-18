import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // All data comes from the built-in API routes:
  //   /api/predict  – precomputed SRNN/GRU/LSTM artifacts (data/results/)
  //   /api/dataset-index – cross-stock dataset summary
  //   /api/quote    – live Yahoo Finance rate
  //   /api/earnings – earnings-call media + transcript
  // No external backend is required in development or production.
};

export default nextConfig;
