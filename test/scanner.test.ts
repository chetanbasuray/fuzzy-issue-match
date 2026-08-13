import { describe, expect, it } from "vitest";
import {
  createMemoryIssueCache,
  findDuplicatesFromPages,
  scanIssuePages,
  type IssueMetadata,
  type IssuePageSource,
} from "../src/scanner.js";
import { createDuplicateIssueMatcher } from "../src/index.js";

function issue(number: number): IssueMetadata {
  return { number, title: `Issue ${number}`, body: `Body ${number}` };
}

function pagedIssues(total: number, calls: number[]): IssuePageSource {
  return {
    async list(_state, page, pageSize) {
      calls.push(page);
      const start = (page - 1) * pageSize;
      const issues = Array.from(
        { length: Math.min(pageSize, Math.max(0, total - start)) },
        (_, index) => issue(start + index + 1),
      );
      return {
        issues,
        nextPage: start + issues.length < total ? page + 1 : undefined,
      };
    },
  };
}

describe("scanIssuePages", () => {
  it("fetches all pages and reports runtime metrics", async () => {
    const calls: number[] = [];
    const result = await scanIssuePages(pagedIssues(2_500, calls), {
      state: "closed",
      pageSize: 100,
      now: () => 10,
    });

    expect(calls).toHaveLength(25);
    expect(result.issues).toHaveLength(2_500);
    expect(result.metrics).toMatchObject({
      pagesFetched: 25,
      issuesFetched: 2_500,
      cacheHit: false,
      truncated: false,
      durationMs: 0,
    });
  });

  it("honors the page cap and marks an incomplete scan", async () => {
    const calls: number[] = [];
    const result = await scanIssuePages(pagedIssues(250, calls), {
      pageSize: 50,
      maxPages: 2,
    });

    expect(calls).toEqual([1, 2]);
    expect(result.issues).toHaveLength(100);
    expect(result.metrics.truncated).toBe(true);
  });

  it("uses a configurable TTL cache without exposing mutable entries", async () => {
    let timestamp = 100;
    const cache = createMemoryIssueCache({ ttlMs: 10, now: () => timestamp });
    const calls: number[] = [];
    const source = pagedIssues(1, calls);

    const first = await scanIssuePages(source, {
      cache,
      cacheKey: "repo:open",
      now: () => timestamp,
    });
    first.issues[0]!.title = "mutated locally";
    const second = await scanIssuePages(source, {
      cache,
      cacheKey: "repo:open",
      now: () => timestamp,
    });

    expect(calls).toEqual([1]);
    expect(second.metrics.cacheHit).toBe(true);
    expect(second.issues[0]!.title).toBe("Issue 1");

    timestamp = 111;
    await scanIssuePages(source, { cache, cacheKey: "repo:open", now: () => timestamp });
    expect(calls).toEqual([1, 1]);
  });

  it("evicts the least recently used entry at the configured bound", async () => {
    const cache = createMemoryIssueCache({ ttlMs: 100, maxEntries: 1 });
    const calls: number[] = [];
    const source = pagedIssues(1, calls);

    await scanIssuePages(source, { cache, cacheKey: "repo:a" });
    await scanIssuePages(source, { cache, cacheKey: "repo:b" });
    await scanIssuePages(source, { cache, cacheKey: "repo:a" });

    expect(calls).toEqual([1, 1, 1]);
  });

  it("rejects a source that does not advance pages", async () => {
    await expect(
      scanIssuePages(
        { list: async () => ({ issues: [issue(1)], nextPage: 1 }) },
        { pageSize: 1 },
      ),
    ).rejects.toThrow("non-forward page");
  });
});

it("feeds a large paginated scan into the duplicate matcher", async () => {
  const calls: number[] = [];
  const matcher = createDuplicateIssueMatcher({ threshold: 0.9 });
  const result = await findDuplicatesFromPages(
    matcher,
    { newIssue: { title: "Issue 2", body: "Body 2" } },
    pagedIssues(1_000, calls),
    { pageSize: 100 },
  );

  expect(calls).toHaveLength(10);
  expect(result.scan.metrics.issuesFetched).toBe(1_000);
  expect(result.matches[0]?.issueNumber).toBe(2);
});
