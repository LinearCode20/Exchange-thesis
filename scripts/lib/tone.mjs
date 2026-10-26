/**
 * Keyword-based tone scorer for earnings-call transcripts.
 *
 * A compact, finance-oriented word list in the spirit of Loughran & McDonald
 * (positive / negative / uncertainty). It is a SUBSET written for this
 * thesis, not the full published dictionary — document that in the thesis.
 *
 *   tone        = (pos − neg) / (pos + neg)     ∈ [−1, +1], 0 when no hits
 *   uncertainty = uncertain words / total words  ∈ [0, 1]
 *
 * Pure and deterministic: same text → same numbers.
 */

const POSITIVE = new Set([
  "achieve", "achieved", "advantage", "beat", "beats", "record", "strong",
  "stronger", "strength", "growth", "grew", "growing", "improve", "improved",
  "improvement", "increase", "increased", "gain", "gains", "exceed", "exceeded",
  "outperform", "favorable", "successful", "success", "robust",
  "upside", "accelerate", "accelerated", "momentum", "confident", "excellent",
  "opportunity", "opportunities", "strengthen", "expand", "expanded", "healthy",
]);

const NEGATIVE = new Set([
  "adverse", "against", "challenge", "challenges", "challenging", "decline",
  "declined", "declines", "decrease", "decreased", "deteriorate", "deteriorated",
  "difficult", "difficulties", "fail", "failed", "failure", "headwind",
  "headwinds", "impair", "impairment", "loss", "losses", "miss", "missed",
  "negative", "pressure", "pressures", "shortfall", "slow", "slowdown",
  "slowed", "weak", "weaker", "weakness", "worse", "worsened", "risk", "risks",
  "lower", "drop", "dropped", "restructuring", "layoff", "layoffs",
]);

const UNCERTAIN = new Set([
  "approximately", "assume", "assumes", "assuming", "believe", "could",
  "depend", "depends", "doubt", "estimate", "estimated", "expect", "expects",
  "hope", "may", "might", "possibly", "potential", "potentially", "predict",
  "probable", "risk", "uncertain", "uncertainty", "unclear", "unknown", "would",
]);

/** Lowercase word tokens (letters only, so "beats," counts as "beats"). */
function tokenize(text) {
  return text.toLowerCase().match(/[a-z]+/g) ?? [];
}

/**
 * @param {string} text  full transcript text
 * @returns {{ tone: number, uncertainty: number, pos: number, neg: number, words: number }}
 */
export function scoreTranscript(text) {
  const tokens = tokenize(text ?? "");
  let pos = 0;
  let neg = 0;
  let unc = 0;
  for (const w of tokens) {
    if (POSITIVE.has(w)) pos += 1;
    if (NEGATIVE.has(w)) neg += 1;
    if (UNCERTAIN.has(w)) unc += 1;
  }
  const tone = pos + neg === 0 ? 0 : (pos - neg) / (pos + neg);
  const uncertainty = tokens.length === 0 ? 0 : unc / tokens.length;
  return {
    tone: Math.round(tone * 1000) / 1000,
    uncertainty: Math.round(uncertainty * 100000) / 100000,
    pos,
    neg,
    words: tokens.length,
  };
}
