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

`v0.1.0` is intentionally a foundation release.
It ships project scaffolding, quality gates, release automation, and contributor onboarding.
The duplicate-detection engine is planned in tracked issues.

## What This Library Will Do

1. Compare new issues to historical issues using Levenshtein distance.
2. Add semantic similarity scoring for better duplicate detection.
3. Return ranked candidates with confidence percentages.
4. Integrate in GitHub Actions to auto-comment likely duplicates.
5. Reduce maintainer triage load and improve issue hygiene.

## Quick Start (Current Placeholder API)

```ts
import { createDuplicateIssueMatcher } from "fuzzy-issue-match";

const matcher = createDuplicateIssueMatcher();
const matches = await matcher.findPossibleDuplicates({
  newIssue: {
    title: "Crash on login",
    body: "App crashes after credentials are entered"
  }
});

console.log(matches); // [] in v0.1.0
```

## Roadmap

Roadmap issues are tracked with labels like `roadmap`, `good first issue`, `help wanted`, `agent-friendly`, and `community`.

See open issues: <https://github.com/chetanbasuray/fuzzy-issue-match/issues>

## Contributing

Humans and coding agents are both welcome.
See [CONTRIBUTING.md](./CONTRIBUTING.md) and [AGENTS.md](./AGENTS.md).
