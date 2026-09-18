/**
 * Tiny keyword-based sentiment classifier for financial headlines.
 * Deliberately simple and fully local — used for the "Audio Sentiment"
 * summary row; not an NLP model.
 */

const POSITIVE = [
  "beat", "beats", "surge", "surges", "surged", "gain", "gains", "growth",
  "strong", "record", "rally", "rallies", "boost", "boosts", "profit",
  "profits", "top", "tops", "outperform", "upgrade", "upgrades", "bullish",
  "optimistic", "success", "higher", "jumps", "jump", "soars", "rise", "rises",
  "positive", "wins", "win", "robust", "exceed", "exceeds",
];

const NEGATIVE = [
  "miss", "misses", "fall", "falls", "fell", "drop", "drops", "dropped",
  "decline", "declines", "weak", "loss", "losses", "down", "plunge", "plunges",
  "cut", "cuts", "downgrade", "downgrades", "bearish", "fear", "fears",
  "risk", "risks", "warns", "warning", "lower", "slump", "slumps", "tumble",
  "tumbles", "crash", "negative", "concern", "concerns", "slowdown",
];

export interface SentimentSplit {
  positive: number; // percent 0-100
  neutral: number;
  negative: number;
}

export function classifySentiment(titles: string[]): SentimentSplit {
  let pos = 0;
  let neg = 0;
  for (const raw of titles) {
    const title = raw.toLowerCase();
    let score = 0;
    for (const w of POSITIVE) if (title.includes(w)) score += 1;
    for (const w of NEGATIVE) if (title.includes(w)) score -= 1;
    if (score > 0) pos += 1;
    else if (score < 0) neg += 1;
  }
  const total = titles.length;
  if (total === 0) return { positive: 0, neutral: 0, negative: 0 };
  const pct = (n: number) => Math.round((n / total) * 100);
  const positive = pct(pos);
  const negative = pct(neg);
  return { positive, negative, neutral: 100 - positive - negative };
}
