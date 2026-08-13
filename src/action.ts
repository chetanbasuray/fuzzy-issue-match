import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DuplicateCandidate, MatchInput } from "./types.js";
import { createDuplicateIssueMatcher } from "./index.js";

export type IssueState = "open" | "closed";

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: IssueState;
  html_url: string;
  pull_request?: unknown;
}

export interface GitHubClient {
  listIssues(
    owner: string,
    repository: string,
    state: IssueState,
    page: number,
  ): Promise<GitHubIssue[]>;
  createComment(
    owner: string,
    repository: string,
    issueNumber: number,
    body: string,
  ): Promise<void>;
}

export interface IssueEventPayload {
  issue?: {
    number: number;
    title: string;
    body: string | null;
  };
  repository?: {
    full_name?: string;
  };
}

export interface ActionOptions {
  env?: Readonly<Record<string, string | undefined>>;
  event?: IssueEventPayload;
  client?: GitHubClient;
  fetchImpl?: typeof fetch;
}

export interface ActionResult {
  candidates: DuplicateCandidate[];
  comment?: string;
  scannedStates: IssueState[];
}

const PAGE_SIZE = 100;

function apiUrl(owner: string, repository: string, path: string): URL {
  return new URL(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}${path}`,
  );
}

async function request<T>(
  fetchImpl: typeof fetch,
  token: string,
  url: URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let payload: unknown;

  try {
    payload = text ? (JSON.parse(text) as unknown) : undefined;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${String(payload)}`);
  }

  return payload as T;
}

/** Create the small GitHub REST client used by the action. */
export function createGitHubClient(
  token: string,
  fetchImpl: typeof fetch = fetch,
): GitHubClient {
  return {
    async listIssues(owner, repository, state, page) {
      const url = apiUrl(owner, repository, "/issues");
      url.searchParams.set("state", state);
      url.searchParams.set("per_page", String(PAGE_SIZE));
      url.searchParams.set("page", String(page));

      const payload = await request<unknown>(fetchImpl, token, url);
      if (!Array.isArray(payload)) {
        throw new Error("GitHub returned an invalid issue list");
      }

      return payload as GitHubIssue[];
    },

    async createComment(owner, repository, issueNumber, body) {
      await request(fetchImpl, token, apiUrl(owner, repository, `/issues/${issueNumber}/comments`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
    },
  };
}

function parseThreshold(value: string | undefined): number {
  const threshold = Number(value ?? "0.3");
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error("threshold must be a number between 0 and 1");
  }
  return threshold;
}

function parseMaxCandidates(value: string | undefined): number {
  const maxCandidates = Number(value ?? "5");
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 100) {
    throw new Error("max-candidates must be an integer between 1 and 100");
  }
  return maxCandidates;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (["true", "1", "yes"].includes(value.toLowerCase())) {
    return true;
  }
  if (["false", "0", "no"].includes(value.toLowerCase())) {
    return false;
  }
  throw new Error("include-closed must be true or false");
}

async function listAllIssues(
  client: GitHubClient,
  owner: string,
  repository: string,
  state: IssueState,
): Promise<GitHubIssue[]> {
  const issues: GitHubIssue[] = [];

  for (let page = 1; ; page += 1) {
    const currentPage = await client.listIssues(owner, repository, state, page);
    issues.push(...currentPage.filter((issue) => issue.pull_request === undefined));
    if (currentPage.length < PAGE_SIZE) {
      return issues;
    }
  }
}

function confidencePercentage(score: number): number {
  return Math.round(Math.min(1, Math.max(0, score)) * 100);
}

function escapeLabel(label: string): string {
  return label.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

/** Format the stable marker and candidate links used in issue comments. */
export function formatDuplicateComment(
  repositoryFullName: string,
  candidates: readonly DuplicateCandidate[],
): string {
  const lines = [
    "<!-- fuzzy-issue-match -->",
    "## Possible duplicate issues",
    "",
    "This issue is similar to the following existing issues:",
    ...candidates.map(
      (candidate) =>
        `- [#${candidate.issueNumber}: ${escapeLabel(candidate.title)}](https://github.com/${repositoryFullName}/issues/${candidate.issueNumber}) — ${confidencePercentage(candidate.score)}% confidence`,
    ),
    "",
    "Please verify the matches before closing this issue.",
  ];
  return lines.join("\n");
}

function readEvent(path: string): IssueEventPayload {
  return JSON.parse(readFileSync(path, "utf8")) as IssueEventPayload;
}

function repositoryParts(fullName: string): [string, string] {
  const [owner, repository, ...extra] = fullName.split("/");
  if (!owner || !repository || extra.length > 0) {
    throw new Error("repository.full_name must have the form owner/repository");
  }
  return [owner, repository];
}

/** Run duplicate detection for a GitHub `issues` event. */
export function runAction(options: ActionOptions): Promise<ActionResult> {
  return runActionInternal(options);
}

async function runActionInternal(options: ActionOptions): Promise<ActionResult> {
  const actionOptions = options;
  const env = actionOptions.env ?? process.env;
  const event = actionOptions.event ?? readEvent(env.GITHUB_EVENT_PATH ?? "");
  const issue = event.issue;
  const fullName = event.repository?.full_name;

  if (!issue || !fullName) {
    throw new Error("This action requires an issues event with repository metadata");
  }

  const [owner, repository] = repositoryParts(fullName);
  const includeClosed = parseBoolean(
    env["INPUT_INCLUDE-CLOSED"] ?? env.INPUT_INCLUDE_CLOSED,
    true,
  );
  const threshold = parseThreshold(env.INPUT_THRESHOLD);
  const maxCandidates = parseMaxCandidates(
    env["INPUT_MAX-CANDIDATES"] ?? env.INPUT_MAX_CANDIDATES,
  );
  const scannedStates: IssueState[] = includeClosed ? ["open", "closed"] : ["open"];
  const client =
    actionOptions.client ??
    createGitHubClient(env.INPUT_TOKEN ?? env.GITHUB_TOKEN ?? "", actionOptions.fetchImpl);

  if (!actionOptions.client && !(env.INPUT_TOKEN ?? env.GITHUB_TOKEN)) {
    throw new Error("token input or GITHUB_TOKEN is required");
  }

  const existingIssues: MatchInput["existingIssues"] = [];
  for (const state of scannedStates) {
    const issues = await listAllIssues(client, owner, repository, state);
    existingIssues.push(
      ...issues
        .filter((existing) => existing.number !== issue.number)
        .map((existing) => ({
          number: existing.number,
          title: existing.title,
          body: existing.body ?? "",
        })),
    );
  }

  const matcher = createDuplicateIssueMatcher({ threshold, topK: maxCandidates });
  const candidates = await matcher.findPossibleDuplicates({
    newIssue: { title: issue.title, body: issue.body ?? "" },
    existingIssues,
  });

  if (candidates.length === 0) {
    return { candidates, scannedStates };
  }

  const comment = formatDuplicateComment(fullName, candidates);
  await client.createComment(owner, repository, issue.number, comment);

  if (env.GITHUB_OUTPUT) {
    appendFileSync(env.GITHUB_OUTPUT, `matches=${candidates.length}\n`);
  }

  return { candidates, comment, scannedStates };
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && fileURLToPath(import.meta.url) === resolve(entry);
}

if (isMainModule()) {
  void runAction({}).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
