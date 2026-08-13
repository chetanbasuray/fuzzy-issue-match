export type {
  Normalizer,
  FuzzyScorer,
  Ranker,
  MatcherConfig,
  DuplicateCandidate,
  MatchInput,
  Matcher,
  SemanticSimilarityProvider,
} from "./types.js";

export {
  createNormalizer,
  normalizeText,
} from "./normalizer.js";

export {
  levenshteinDistance,
  normalizedLevenshtein,
  weightedFuzzyScore,
  createLevenshteinScorer,
} from "./levenshtein.js";

export {
  createTokenJaccardProvider,
  tokenJaccardScore,
} from "./semantic.js";

import type {
  Ranker,
  MatcherConfig,
  DuplicateCandidate,
  MatchInput,
  Matcher,
  SemanticSimilarityProvider,
} from "./types.js";
import { weightedFuzzyScore } from "./levenshtein.js";
import { createTokenJaccardProvider } from "./semantic.js";

const DEFAULTS = {
  threshold: 0.3,
  topK: 5,
  titleWeight: 0.6,
  bodyWeight: 0.4,
  semanticProvider: createTokenJaccardProvider(),
  semanticWeight: 0.2,
  fuzzyWeight: 0.8,
} satisfies Required<MatcherConfig>;

type ResolvedConfig = Omit<Required<MatcherConfig>, "semanticProvider"> & {
  semanticProvider: SemanticSimilarityProvider;
};

function issueText(issue: { title: string; body: string }): string {
  return `${issue.title}\n${issue.body}`;
}

function resolveConfig(config?: MatcherConfig): ResolvedConfig {
  const merged: ResolvedConfig = { ...DEFAULTS, ...config };
  const totalWeight = merged.fuzzyWeight + merged.semanticWeight;

  if (
    !Number.isFinite(merged.fuzzyWeight) ||
    !Number.isFinite(merged.semanticWeight) ||
    merged.fuzzyWeight < 0 ||
    merged.semanticWeight < 0 ||
    totalWeight <= 0
  ) {
    throw new Error("fuzzyWeight and semanticWeight must be finite, non-negative, and not both zero");
  }

  return merged;
}

function createRanker(config: ResolvedConfig): Ranker {
  return {
    rank(candidates: DuplicateCandidate[]): DuplicateCandidate[] {
      const filtered = candidates.filter((c) => c.score >= config.threshold);
      filtered.sort((a, b) => b.score - a.score);
      return filtered.slice(0, config.topK);
    },
  };
}

export function createDuplicateIssueMatcher(
  config?: MatcherConfig,
): Matcher {
  const merged = resolveConfig(config);
  const ranker: Ranker = createRanker(merged);

  return {
    async findPossibleDuplicates(
      input: MatchInput,
    ): Promise<DuplicateCandidate[]> {
      const candidates: DuplicateCandidate[] = [];
      const weightTotal = merged.fuzzyWeight + merged.semanticWeight;

      for (const existing of input.existingIssues) {
        const fuzzyScore = weightedFuzzyScore(
          input.newIssue.title,
          existing.title,
          input.newIssue.body,
          existing.body,
          { title: merged.titleWeight, body: merged.bodyWeight },
        );
        const semanticScore = await merged.semanticProvider.score(
          issueText(input.newIssue),
          issueText(existing),
        );
        const score =
          (fuzzyScore * merged.fuzzyWeight + semanticScore * merged.semanticWeight) /
          weightTotal;

        candidates.push({
          issueNumber: existing.number,
          title: existing.title,
          score,
        });
      }

      return ranker.rank(candidates);
    },
  };
}
