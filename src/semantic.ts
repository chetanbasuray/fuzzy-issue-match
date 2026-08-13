import type { SemanticSimilarityProvider } from "./types.js";
import { normalizeText } from "./normalizer.js";

function tokens(text: string): Set<string> {
  const normalized = normalizeText(text);
  return normalized === "" ? new Set() : new Set(normalized.split(" "));
}

/** Return the Jaccard similarity of the normalized token sets. */
export function tokenJaccardScore(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);

  if (left.size === 0 && right.size === 0) return 1;

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }

  const union = new Set([...left, ...right]).size;
  return union === 0 ? 1 : intersection / union;
}

/**
 * A dependency-free semantic baseline.
 *
 * Token overlap is intentionally small and deterministic, but it catches
 * reordered and paraphrased issue text better than character edit distance.
 * Applications can replace it with an embedding-backed provider through
 * `MatcherConfig.semanticProvider` without changing the matcher API.
 */
export function createTokenJaccardProvider(): SemanticSimilarityProvider {
  return {
    score(a: string, b: string): number {
      return tokenJaccardScore(a, b);
    },
  };
}
