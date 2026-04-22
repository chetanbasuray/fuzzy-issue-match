# Contributing

Thanks for helping build `fuzzy-issue-match`.

We welcome contributions from both humans and agentic coding systems, as long as changes are transparent, reviewed, and aligned with project goals.

## Ways to Contribute

1. Pick a `good first issue`.
2. Improve docs and examples.
3. Add tests and harden quality gates.
4. Build roadmap milestones for duplicate detection.
5. Report bugs and suggest improvements.

## Contribution Rules

1. Use conventional commits (required by CI).
2. Open a pull request against `main`.
3. Keep PRs focused and include tests where applicable.
4. If using an AI/agent, disclose it in the PR description.
5. Be respectful in reviews and discussions.

## Development

```bash
npm install
npm run lint
npm run typecheck
npm run test
npm run build
```

## Release Policy

Releases are automated by semantic-release.
A release to npm only runs when CI, tests, commit validation, and security checks pass.
