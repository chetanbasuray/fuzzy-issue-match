import { describe, expect, it } from "vitest";
import {
  createDuplicateIssueMatcher,
  levenshteinDistance,
  normalizedLevenshtein,
  weightedFuzzyScore,
  normalizeText,
} from "../src/index.js";

describe("normalizeText", () => {
  it("lowercases and trims", () => {
    expect(normalizeText("  HELLO WORLD  ")).toBe("hello world");
  });

  it("strips punctuation", () => {
    expect(normalizeText("crash on login!")).toBe("crash on login");
  });

  it("collapses whitespace", () => {
    expect(normalizeText("crash   on    login")).toBe("crash on login");
  });

  it("handles empty string", () => {
    expect(normalizeText("")).toBe("");
  });
});

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
  });

  it("returns length for empty vs string", () => {
    expect(levenshteinDistance("", "hello")).toBe(5);
    expect(levenshteinDistance("hello", "")).toBe(5);
  });

  it("returns 0 for two empty strings", () => {
    expect(levenshteinDistance("", "")).toBe(0);
  });

  it("computes single substitution", () => {
    expect(levenshteinDistance("cat", "car")).toBe(1);
  });

  it("computes insertion", () => {
    expect(levenshteinDistance("cat", "cats")).toBe(1);
  });

  it("computes deletion", () => {
    expect(levenshteinDistance("cats", "cat")).toBe(1);
  });

  it("computes completely different strings", () => {
    expect(levenshteinDistance("abc", "xyz")).toBe(3);
  });
});

describe("normalizedLevenshtein", () => {
  it("returns 1 for identical strings", () => {
    expect(normalizedLevenshtein("hello", "hello")).toBe(1);
  });

  it("returns 1 for two empty strings", () => {
    expect(normalizedLevenshtein("", "")).toBe(1);
  });

  it("returns 0 for completely different strings", () => {
    expect(normalizedLevenshtein("abc", "xyz")).toBe(0);
  });

  it("returns value between 0 and 1 for partial match", () => {
    const score = normalizedLevenshtein("crash on login", "crash on load");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

describe("weightedFuzzyScore", () => {
  it("returns 1 for identical title and body", () => {
    const score = weightedFuzzyScore(
      "Crash on login",
      "Crash on login",
      "App crashes when entering credentials",
      "App crashes when entering credentials",
      { title: 0.6, body: 0.4 },
    );
    expect(score).toBe(1);
  });

  it("returns low score for completely different title and body", () => {
    const score = weightedFuzzyScore(
      "xyzxyzxyz",
      "abcabcabc",
      "xxxxxxxxxxyyyyyyyyyy",
      "aaaaaaaaaabbbbbbbbbb",
      { title: 0.6, body: 0.4 },
    );
    expect(score).toBeLessThan(0.5);
  });

  it("applies title weight more heavily", () => {
    const highTitle = weightedFuzzyScore(
      "Crash on login",
      "Crash on login",
      "App crashes",
      "Something completely unrelated",
      { title: 1, body: 0 },
    );
    expect(highTitle).toBe(1);

    const highBody = weightedFuzzyScore(
      "Unrelated title",
      "Another title",
      "App crashes when entering credentials",
      "App crashes when entering credentials",
      { title: 0, body: 1 },
    );
    expect(highBody).toBe(1);
  });
});

describe("createDuplicateIssueMatcher", () => {
  it("returns empty array when no existing issues provided", async () => {
    const matcher = createDuplicateIssueMatcher();
    const result = await matcher.findPossibleDuplicates({
      newIssue: { title: "test", body: "test body" },
      existingIssues: [],
    });
    expect(result).toEqual([]);
  });

  it("ranks matching issues above non-matching", async () => {
    const matcher = createDuplicateIssueMatcher();
    const result = await matcher.findPossibleDuplicates({
      newIssue: {
        title: "Crash on login",
        body: "App crashes when entering valid credentials",
      },
      existingIssues: [
        {
          number: 1,
          title: "Feature request: dark mode",
          body: "Please add dark mode support",
        },
        {
          number: 2,
          title: "Crash on login",
          body: "App crashes when entering credentials",
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0].issueNumber).toBe(2);
    expect(result[0].score).toBeGreaterThan(0.5);
  });

  it("respects threshold config", async () => {
    const matcher = createDuplicateIssueMatcher({ threshold: 0.9 });
    const result = await matcher.findPossibleDuplicates({
      newIssue: {
        title: "Crash on login page",
        body: "App crashes when entering valid credentials on the login form",
      },
      existingIssues: [
        {
          number: 1,
          title: "Feature request: dark mode",
          body: "Please add dark mode support for the UI",
        },
      ],
    });

    expect(result).toHaveLength(0);
  });

  it("respects topK config", async () => {
    const matcher = createDuplicateIssueMatcher({ topK: 2, threshold: 0 });
    const issues = Array.from({ length: 10 }, (_, i) => ({
      number: i + 1,
      title: `Issue ${i + 1}`,
      body: "some body",
    }));

    const result = await matcher.findPossibleDuplicates({
      newIssue: { title: "test", body: "some body" },
      existingIssues: issues,
    });

    expect(result).toHaveLength(2);
  });

  it("returns candidate with expected shape", async () => {
    const matcher = createDuplicateIssueMatcher();
    const result = await matcher.findPossibleDuplicates({
      newIssue: {
        title: "Bug: app crashes",
        body: "Detailed crash description",
      },
      existingIssues: [
        {
          number: 42,
          title: "Bug: app crashes",
          body: "Detailed crash description",
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      issueNumber: 42,
      title: "Bug: app crashes",
      score: 1,
    });
  });
});
