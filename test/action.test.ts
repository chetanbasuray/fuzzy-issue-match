import { describe, expect, it } from "vitest";
import {
  createGitHubClient,
  formatDuplicateComment,
  runAction,
  type GitHubClient,
  type GitHubIssue,
} from "../src/action.js";

const event = {
  issue: { number: 20, title: "Crash on login", body: "Credentials crash the app" },
  repository: { full_name: "example/project" },
};

const openIssue: GitHubIssue = {
  number: 4,
  title: "Crash on login",
  body: "Credentials crash the app",
  state: "open",
  html_url: "https://github.com/example/project/issues/4",
};

describe("formatDuplicateComment", () => {
  it("includes issue links and calibrated confidence", () => {
    const comment = formatDuplicateComment("example/project", [
      { issueNumber: 4, title: "Crash [on] login", score: 0.876 },
    ]);

    expect(comment).toContain("<!-- fuzzy-issue-match -->");
    expect(comment).toContain("[#4: Crash \\[on\\] login]");
    expect(comment).toContain("88% confidence");
  });
});

describe("runAction", () => {
  it("scans configured states and comments only the capped matches", async () => {
    const calls: string[] = [];
    let comment = "";
    const client: GitHubClient = {
      async listIssues(_owner, _repository, state, page) {
        calls.push(`${state}:${page}`);
        if (page > 1) return [];
        return state === "open"
          ? [openIssue, { ...openIssue, number: 21, title: "Unrelated", body: "Other" }]
          : [{ ...openIssue, number: 8, state: "closed" }];
      },
      async createComment(_owner, _repository, _issueNumber, body) {
        comment = body;
      },
    };

    const result = await runAction({
      event,
      client,
      env: {
        INPUT_THRESHOLD: "0.3",
        "INPUT_MAX-CANDIDATES": "1",
        "INPUT_INCLUDE-CLOSED": "true",
      },
    });

    expect(calls).toEqual(["open:1", "closed:1"]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].issueNumber).toBe(4);
    expect(comment).toContain("/issues/4");
    expect(comment).toContain("100% confidence");
  });

  it("does not comment when no candidate reaches the threshold", async () => {
    let comments = 0;
    const client: GitHubClient = {
      async listIssues() {
        return [{ ...openIssue, title: "Dark mode", body: "A visual theme" }];
      },
      async createComment() {
        comments += 1;
      },
    };

    const result = await runAction({
      event,
      client,
      env: { INPUT_THRESHOLD: "0.99", "INPUT_INCLUDE-CLOSED": "false" },
    });

    expect(result.candidates).toEqual([]);
    expect(result.scannedStates).toEqual(["open"]);
    expect(comments).toBe(0);
  });
});

describe("createGitHubClient", () => {
  it("uses the GitHub API for issue pages and comments", async () => {
    const requests: Array<{ url: string; method: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), method: init?.method ?? "GET" });
      if (String(input).includes("/comments")) {
        return new Response("{}", { status: 201 });
      }
      return new Response(JSON.stringify([openIssue]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const client = createGitHubClient("test-token", fetchImpl);

    await client.listIssues("example", "project", "closed", 2);
    await client.createComment("example", "project", 20, "hello");

    expect(requests[0].url).toContain("state=closed");
    expect(requests[0].url).toContain("page=2");
    expect(requests[0].method).toBe("GET");
    expect(requests[1].method).toBe("POST");
  });
});
