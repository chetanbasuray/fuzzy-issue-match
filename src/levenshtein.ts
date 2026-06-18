import type { FuzzyScorer } from "./types.js";
import { normalizeText } from "./normalizer.js";

export function levenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;

  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[] = new Array(bn + 1);

  for (let j = 0; j <= bn; j++) {
    matrix[j] = j;
  }

  for (let i = 1; i <= an; i++) {
    let prev = matrix[0];
    matrix[0] = i;

    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const tmp = matrix[j];

      matrix[j] = Math.min(
        matrix[j] + 1,
        matrix[j - 1] + 1,
        prev + cost,
      );

      prev = tmp;
    }
  }

  return matrix[bn];
}

export function normalizedLevenshtein(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

export function weightedFuzzyScore(
  titleA: string,
  titleB: string,
  bodyA: string,
  bodyB: string,
  weights: { title: number; body: number },
): number {
  const titleScore = normalizedLevenshtein(
    normalizeText(titleA),
    normalizeText(titleB),
  );
  const bodyScore = normalizedLevenshtein(
    normalizeText(bodyA),
    normalizeText(bodyB),
  );

  return titleScore * weights.title + bodyScore * weights.body;
}

export function createLevenshteinScorer(): FuzzyScorer {
  return {
    score(a: string, b: string): number {
      return normalizedLevenshtein(normalizeText(a), normalizeText(b));
    },
  };
}
