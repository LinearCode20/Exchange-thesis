export interface QuoteMeta {
  symbol: string;
  companyName: string;
  currency: string;
  exchangeName: string;
  price: number;
  previousClose: number;
  dayHigh: number;
  dayLow: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  volume: number;
  marketTime: string;
}

export interface HistoryPoint {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ForecastPoint {
  date: string;
  price: number;
  low: number;
  high: number;
}

export interface Forecast {
  points: ForecastPoint[];
  endPrice: number;
  endLow: number;
  endHigh: number;
  changePct: number; // projected change vs last close
  windowDays: number; // trading days the trend was fit on
  sigma: number; // residual std deviation of the fit
}

export interface EarningsInfo {
  nextDate: string | null;
  isEstimate: boolean;
  lastCallDate: string | null;
  epsEstimate: number | null;
  revenueEstimate: number | null;
}

export interface StockResponse {
  meta: QuoteMeta;
  history: HistoryPoint[];
  forecast: Forecast;
  earnings: EarningsInfo;
}

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
  transcriptAvailable: boolean; // FMP key configured
}
