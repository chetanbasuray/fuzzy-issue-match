export interface Normalizer {
  normalize(text: string): string;
}

export interface FuzzyScorer {
  score(a: string, b: string): number;
}

/** A synchronous or asynchronous provider for semantic similarity. */
export interface SemanticSimilarityProvider {
  score(a: string, b: string): number | Promise<number>;
}

export interface Ranker {
  rank(candidates: DuplicateCandidate[]): DuplicateCandidate[];
}

export interface MatcherConfig {
  threshold?: number;
  topK?: number;
  titleWeight?: number;
  bodyWeight?: number;
  /** Provider used to catch paraphrases that edit distance misses. */
  semanticProvider?: SemanticSimilarityProvider;
  /** Relative contribution of the semantic provider to the final score. */
  semanticWeight?: number;
  /** Relative contribution of the fuzzy scorer to the final score. */
  fuzzyWeight?: number;
}

export interface DuplicateCandidate {
  issueNumber: number;
  title: string;
  score: number;
}

export interface MatchInput {
  newIssue: {
    title: string;
    body: string;
  };
  existingIssues: Array<{
    number: number;
    title: string;
    body: string;
  }>;
}

export interface Matcher {
  findPossibleDuplicates(input: MatchInput): Promise<DuplicateCandidate[]>;
}
