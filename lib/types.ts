export type ModelKey = "srnn" | "gru" | "lstm";

export interface ModelMetrics {
  rmse: number;
  mae: number;
  mape: number;
  r2: number;
}

export interface TrainConfig {
  window: number; // input window (trading days)
  horizon: number; // future days projected
  hidden: number; // recurrent hidden units
  epochs: number;
  batch: number;
  lr: number;
  splitPct: number;
  clipNorm: number;
  seed: number;
}

export interface StockStats {
  annualVolPct: number;
  totalChangePct: number;
  minClose: number;
  maxClose: number;
}

export interface SplitInfo {
  trainRecords: number;
  testRecords: number;
  trainStart: string;
  trainEnd: string;
  testStart: string;
  testEnd: string;
}

/**
 * Precomputed experiment artifact produced by scripts/train-models.mjs and
 * served by /api/predict. One JSON file per stock in data/results/.
 */
export interface StockArtifact {
  symbol: string;
  companyName: string;
  currency: string;
  generatedAt: string;
  config: TrainConfig;
  dataPeriod: { start: string; end: string; years: number };
  records: number;
  split: SplitInfo;
  history: {
    dates: string[];
    close: number[];
    volume: number[];
  };
  metrics: Record<ModelKey, ModelMetrics>;
  testSeries: {
    dates: string[];
    actual: number[];
    srnn: number[];
    gru: number[];
    lstm: number[];
  };
  future: {
    dates: string[];
    srnn: number[];
    gru: number[];
    lstm: number[];
  };
  stats: StockStats;
}

export interface DatasetIndexStock {
  symbol: string;
  name: string;
  records: number;
  period: { start: string; end: string };
  split: SplitInfo;
  metrics: Record<ModelKey, ModelMetrics>;
  stats: StockStats;
  generatedAt: string;
}

export interface DatasetIndex {
  config: TrainConfig | null;
  generatedAt: string;
  stocks: DatasetIndexStock[];
}

export interface QuoteResponse {
  symbol: string;
  companyName: string;
  currency: string;
  price: number;
  previousClose: number;
  changePct: number;
  marketTime: string;
}

/* ---- earnings media (audio card) — served by /api/earnings ---- */

export interface MediaItem {
  title: string;
  publisher: string;
  link: string;
}

export interface TranscriptData {
  symbol: string;
  quarter: number;
  year: number;
  date: string;
  content: string;
}

export interface EarningsResponse {
  videos: MediaItem[];
  news: MediaItem[];
  youtubeQuery: string;
  transcript: TranscriptData | null;
  transcriptAvailable: boolean;
}
