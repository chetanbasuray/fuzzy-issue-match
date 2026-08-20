# fuzzy-issue-match

[![CI](https://github.com/chetanbasuray/fuzzy-issue-match/actions/workflows/ci.yml/badge.svg)](https://github.com/chetanbasuray/fuzzy-issue-match/actions/workflows/ci.yml)
[![CodeQL](https://github.com/chetanbasuray/fuzzy-issue-match/actions/workflows/codeql.yml/badge.svg)](https://github.com/chetanbasuray/fuzzy-issue-match/actions/workflows/codeql.yml)
[![Dependency Review](https://github.com/chetanbasuray/fuzzy-issue-match/actions/workflows/dependency-review.yml/badge.svg)](https://github.com/chetanbasuray/fuzzy-issue-match/actions/workflows/dependency-review.yml)
[![npm version](https://img.shields.io/npm/v/fuzzy-issue-match.svg)](https://www.npmjs.com/package/fuzzy-issue-match)
[![npm downloads](https://img.shields.io/npm/dm/fuzzy-issue-match.svg)](https://www.npmjs.com/package/fuzzy-issue-match)
[![license](https://img.shields.io/npm/l/fuzzy-issue-match.svg)](https://github.com/chetanbasuray/fuzzy-issue-match/blob/main/LICENSE)
[![Open Issues](https://img.shields.io/github/issues/chetanbasuray/fuzzy-issue-match.svg)](https://github.com/chetanbasuray/fuzzy-issue-match/issues)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/chetanbasuray/fuzzy-issue-match/blob/main/CONTRIBUTING.md)

Detect potential duplicate GitHub issues before maintainers spend hours triaging repeated reports.

## Status

`v1.0.0` ships the core duplicate-detection engine using Levenshtein distance scoring with configurable thresholds, weighted title/body blending, and a ranked pipeline.

## Quick Start

    import { createDuplicateIssueMatcher } from "fuzzy-issue-match";

    const matcher = createDuplicateIssueMatcher({ threshold: 0.4, topK: 5 });

    const matches = await matcher.findPossibleDuplicates({
      newIssue: {
        title: "Crash on login",
        body: "App crashes after credentials are entered",
      },
      existingIssues: [
        { number: 42, title: "Crash on login", body: "App crashes when entering credentials" },
        { number: 7, title: "Feature: dark mode", body: "Please add dark mode" },
      ],
    });

    console.log(matches);
    // [
    //   { issueNumber: 42, title: "Crash on login", score: 0.94 },
    // ]

## GitHub Action

Run duplicate detection on every newly opened issue and get a comment with likely matches.

    name: Duplicate issue check
    on:
      issues:
        types: [opened]
    jobs:
      check:
        runs-on: ubuntu-latest
        permissions:
          issues: write
        steps:
          - uses: chetanbasuray/fuzzy-issue-match@main
            with:
              threshold: "0.6"
              max-candidates: "5"

| Input            | Default             | Description                                              |
|-------------------|---------------------|------------------------------------------------------------|
| `threshold`       | `0.6`               | Minimum score, 0 to 1, for a candidate to be flagged      |
| `max-candidates`  | `5`                 | Maximum number of candidates included in the comment     |
| `github-token`    | `${{ github.token }}` | Token used to list issues and post the comment          |

Output: `duplicate-count`, the number of likely duplicate candidates found.

## API

### `createDuplicateIssueMatcher` (config?)

`createDuplicateIssueMatcher(config?: MatcherConfig): Matcher`

Creates a matcher instance. Accepts optional configuration:

`interface MatcherConfig { threshold?: number;; topK?: number;; titleWeight?: number;; bodyWeight?: number; }`

| Option        | Default | Description                                   |
|---------------|---------|-----------------------------------------------|
| `threshold`   | `0.3`   | Minimum score, 0 to 1, to consider a match    |
| `topK`        | `5`     | Maximum number of candidates returned         |
| `titleWeight` | `0.6`   | Weight of title similarity in final score     |
| `bodyWeight`  | `0.4`   | Weight of body similarity in final score      |

### `matcher.findPossibleDuplicates` (input)

`interface Matcher { findPossibleDuplicates(input: MatchInput): Promise<DuplicateCandidate[]>; }`

`interface MatchInput { newIssue: { title: string; body: string; };; existingIssues: Array<{ number: number; title: string; body: string; }>; }`

`interface DuplicateCandidate { issueNumber: number;; title: string;; score: number; }`

Takes `{ newIssue: { title, body }, existingIssues: [{ number, title, body }] }`.
Returns `Array<{ issueNumber, title, score }>` ranked by score descending.

### Score Semantics

- **`score`** is a number between `0` and `1`.
- `1` means the normalized title and body text are identical.
- `0` means completely different with no shared characters in the same order.
- The final score is a weighted blend: `titleScore * titleWeight + bodyScore * bodyWeight`.
- Scores below `threshold` are excluded. Remaining candidates are sorted descending and capped at `topK`.

### Low-Level Utilities

The package also exports:

`normalizeText(text: string): string`

`levenshteinDistance(a: string, b: string): number`

`normalizedLevenshtein(a: string, b: string): number`

`weightedFuzzyScore(titleA: string, titleB: string, bodyA: string, bodyB: string, weights: { title: number; body: number }): number`

### Internal / Advanced API

These types and factories are exported for advanced composition but not needed for typical usage.

`interface Normalizer { normalize(text: string): string; }`

`interface FuzzyScorer { score(a: string, b: string): number; }`

`interface Ranker { rank(candidates: DuplicateCandidate[]): DuplicateCandidate[]; }`

`createNormalizer(): Normalizer`

`createLevenshteinScorer(): FuzzyScorer`

## Roadmap

Roadmap issues are tracked with labels like `roadmap`, `good first issue`, `help wanted`, `agent-friendly`, and `community`.

See open issues: <https://github.com/chetanbasuray/fuzzy-issue-match/issues>

## Contributing

Humans and coding agents are both welcome.
See [CONTRIBUTING.md](./CONTRIBUTING.md) and [AGENTS.md](./AGENTS.md).
