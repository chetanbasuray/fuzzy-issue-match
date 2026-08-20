import * as core from "@actions/core";
import * as github from "@actions/github";
import { createDuplicateIssueMatcher } from "./index.js";
import type { DuplicateCandidate } from "./types.js";

function formatComment(candidates: DuplicateCandidate[]): string {
  const lines = candidates.map(
    (c) => `- #${c.issueNumber} - ${c.title} (confidence: ${Math.round(c.score * 100)}%)`,
  );
  return [
    "This issue looks similar to existing issues that may already cover it:",
    "",
    ...lines,
  ].join("\n");
}

async function run(): Promise<void> {
  const context = github.context;

  if (context.eventName !== "issues" || context.payload.action !== "opened") {
    core.info("Not a newly opened issue event, skipping duplicate check.");
    return;
  }

  const issue = context.payload.issue;
  if (!issue) {
    core.setFailed("No issue payload found in the event.");
    return;
  }

  const threshold = Number(core.getInput("threshold") || "0.6");
  const maxCandidates = Number(core.getInput("max-candidates") || "5");
  const token = core.getInput("github-token") || process.env.GITHUB_TOKEN || "";

  const octokit = github.getOctokit(token);
  const { owner, repo } = context.repo;

  const existingIssues = await octokit.paginate(
    octokit.rest.issues.listForRepo,
    { owner, repo, state: "all", per_page: 100 },
  );

  const candidates = existingIssues
    .filter((existing) => existing.number !== issue.number && !("pull_request" in existing))
    .map((existing) => ({
      number: existing.number,
      title: existing.title,
      body: existing.body ?? "",
    }));

  const matcher = createDuplicateIssueMatcher({ threshold, topK: maxCandidates });
  const result = await matcher.findPossibleDuplicates({
    newIssue: { title: issue.title, body: issue.body ?? "" },
    existingIssues: candidates,
  });

  core.setOutput("duplicate-count", result.length);

  if (result.length === 0) {
    core.info("No likely duplicates found.");
    return;
  }

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issue.number,
    body: formatComment(result),
  });
}

run().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
