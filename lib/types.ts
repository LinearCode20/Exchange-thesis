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
/** Feature set the primary results were trained on. */
export type FeatureSet = "price" | "price+transcript";

/** One earnings call, as used by the model (tone −1..+1). */
export interface TranscriptCall {
  year: number;
  quarter: number;
  callDate: string;
  dateSource: string;
  tone: number;
  uncertainty: number;
}

export interface StockArtifact {
  symbol: string;
  companyName: string;
  currency: string;
  generatedAt: string;
  config: TrainConfig;
  features: FeatureSet;
  transcriptCalls: TranscriptCall[];
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
  /** Ablation: same models trained on price only (null if not trained). */
  metricsPriceOnly: Record<ModelKey, ModelMetrics> | null;
  futurePriceOnly: { srnn: number[]; gru: number[]; lstm: number[] } | null;
  testSeriesPriceOnly: { srnn: number[]; gru: number[]; lstm: number[] } | null;
  stats: StockStats;
}

export interface DatasetIndexStock {
  symbol: string;
  name: string;
  records: number;
  period: { start: string; end: string };
  split: SplitInfo;
  features: FeatureSet;
  metrics: Record<ModelKey, ModelMetrics>;
  metricsPriceOnly: Record<ModelKey, ModelMetrics> | null;
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

export interface EarningsResponse {
  videos: MediaItem[];
  news: MediaItem[];
  youtubeQuery: string;
}
