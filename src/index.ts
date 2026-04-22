export interface DuplicateCandidate {
  issueNumber: number;
  score: number;
  title: string;
}

export interface MatchInput {
  newIssue: {
    title: string;
    body: string;
  };
}

export interface Matcher {
  findPossibleDuplicates(input: MatchInput): Promise<DuplicateCandidate[]>;
}

/**
 * Placeholder API for v0.1.0.
 * Full duplicate detection ships in follow-up milestones.
 */
export function createDuplicateIssueMatcher(): Matcher {
  return {
    async findPossibleDuplicates(): Promise<DuplicateCandidate[]> {
      return [];
    }
  };
}
