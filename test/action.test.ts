import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  inputs: {} as Record<string, string>,
  context: {
    eventName: "issues",
    payload: {} as {
      action?: string;
      issue?: { number: number; title: string; body?: string };
    },
    repo: { owner: "acme", repo: "widgets" },
  },
  existingIssues: [] as Array<{
    number: number;
    title: string;
    body: string | null;
    pull_request?: unknown;
  }>,
  createComment: vi.fn(),
  setFailed: vi.fn(),
  setOutput: vi.fn(),
}));

vi.mock("@actions/core", () => ({
  getInput: (name: string) => state.inputs[name] ?? "",
  setFailed: (message: string) => state.setFailed(message),
  setOutput: (name: string, value: unknown) => state.setOutput(name, value),
  info: () => {},
}));

vi.mock("@actions/github", () => ({
  context: state.context,
  getOctokit: () => ({
    paginate: async () => state.existingIssues,
    rest: {
      issues: {
        listForRepo: {},
        createComment: (params: unknown) => state.createComment(params),
      },
    },
  }),
}));

async function runAction(): Promise<void> {
  vi.resetModules();
  await import("../src/action.js");
  await new Promise((resolve) => setImmediate(resolve));
}

describe("github action", () => {
  afterEach(() => {
    vi.clearAllMocks();
    state.inputs = {};
    state.existingIssues = [];
  });

  it("comments with likely duplicates on a newly opened issue", async () => {
    state.context.payload = {
      action: "opened",
      issue: { number: 10, title: "Bug: app crashes on login", body: "Steps to reproduce" },
    };
    state.existingIssues = [
      { number: 3, title: "Bug: app crashes on login", body: "Steps to reproduce" },
      { number: 4, title: "Add dark mode", body: "Unrelated feature request" },
    ];
    state.inputs = { threshold: "0.5" };

    await runAction();

    expect(state.createComment).toHaveBeenCalledTimes(1);
    const call = state.createComment.mock.calls[0][0] as { issue_number: number; body: string };
    expect(call.issue_number).toBe(10);
    expect(call.body).toContain("#3");
    expect(call.body).not.toContain("#4");
  });

  it("does not comment when no candidates clear the threshold", async () => {
    state.context.payload = {
      action: "opened",
      issue: { number: 11, title: "Totally unique issue", body: "Nothing like this exists" },
    };
    state.existingIssues = [
      { number: 4, title: "Add dark mode", body: "Unrelated feature request" },
    ];
    state.inputs = { threshold: "0.9" };

    await runAction();

    expect(state.createComment).not.toHaveBeenCalled();
  });

  it("skips events that are not a newly opened issue", async () => {
    state.context.payload = {
      action: "closed",
      issue: { number: 12, title: "x", body: "y" },
    };

    await runAction();

    expect(state.createComment).not.toHaveBeenCalled();
  });

  it("excludes pull requests from candidate issues", async () => {
    state.context.payload = {
      action: "opened",
      issue: { number: 13, title: "Bug: app crashes on login", body: "Steps to reproduce" },
    };
    state.existingIssues = [
      {
        number: 3,
        title: "Bug: app crashes on login",
        body: "Steps to reproduce",
        pull_request: {},
      },
    ];
    state.inputs = { threshold: "0.5" };

    await runAction();

    expect(state.createComment).not.toHaveBeenCalled();
  });
});
