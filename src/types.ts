export interface Normalizer {
  normalize(text: string): string;
}

export interface FuzzyScorer {
  score(a: string, b: string): number;
}

export interface Ranker {
  rank(candidates: DuplicateCandidate[]): DuplicateCandidate[];
}

export interface MatcherConfig {
  threshold?: number;
  topK?: number;
  titleWeight?: number;
  bodyWeight?: number;
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
