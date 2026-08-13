import { describe, expect, it } from "vitest";
import { formatBenchmarkReport, runBenchmark } from "../src/benchmark.js";

const dataset = {
  version: 1,
  pairs: [
    {
      id: "same",
      label: "duplicate" as const,
      newIssue: { title: "Login crash", body: "The app crashes" },
      existingIssue: { title: "Login crash", body: "The app crashes" },
    },
    {
      id: "different",
      label: "distinct" as const,
      newIssue: { title: "Dark mode", body: "Use a dark theme" },
      existingIssue: { title: "Login crash", body: "The app crashes" },
    },
  ],
};

describe("runBenchmark", () => {
  it("reports confusion-matrix metrics at each threshold", () => {
    const report = runBenchmark(dataset, [0.8, 0.4, 0.8]);

    expect(report.metrics.map((metric) => metric.threshold)).toEqual([0.4, 0.8]);
    expect(report.metrics[0]).toMatchObject({
      truePositives: 1,
      falsePositives: 0,
      trueNegatives: 1,
      falseNegatives: 0,
      precision: 1,
      recall: 1,
      f1: 1,
    });
  });

  it("rejects thresholds outside the score range", () => {
    expect(() => runBenchmark(dataset, [-0.1])).toThrow("between 0 and 1");
  });
});

it("formats a report for CI logs", () => {
  const report = runBenchmark(dataset, [0.5]);
  const output = formatBenchmarkReport(report);

  expect(output).toContain("threshold | precision | recall | f1");
  expect(output).toContain("0.50 | 1.000 | 1.000 | 1.000");
});
