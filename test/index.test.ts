import { describe, expect, it } from "vitest";
import { createDuplicateIssueMatcher } from "../src/index.js";

describe("createDuplicateIssueMatcher", () => {
  it("returns no matches in v0.1.0 placeholder implementation", async () => {
    const matcher = createDuplicateIssueMatcher();
    const result = await matcher.findPossibleDuplicates({
      newIssue: {
        title: "Crash on login",
        body: "App crashes when entering valid credentials"
      }
    });

    expect(result).toEqual([]);
  });
});
