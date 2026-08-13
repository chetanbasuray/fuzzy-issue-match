import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { weightedFuzzyScore } from "./levenshtein.js";

export type BenchmarkLabel = "duplicate" | "distinct";

export interface BenchmarkIssue {
  title: string;
  body: string;
}

export interface BenchmarkPair {
  id: string;
  label: BenchmarkLabel;
  newIssue: BenchmarkIssue;
  existingIssue: BenchmarkIssue;
}

export interface BenchmarkDataset {
  version: number;
  pairs: BenchmarkPair[];
}

export interface BenchmarkMetrics {
  threshold: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface BenchmarkReport {
  datasetVersion: number;
  pairCount: number;
  metrics: BenchmarkMetrics[];
}

function validateDataset(value: unknown): BenchmarkDataset {
  if (!value || typeof value !== "object") {
    throw new Error("benchmark dataset must be an object");
  }

  const dataset = value as Partial<BenchmarkDataset>;
  if (!Number.isInteger(dataset.version) || !Array.isArray(dataset.pairs)) {
    throw new Error("benchmark dataset requires an integer version and pairs array");
  }

  for (const pair of dataset.pairs) {
    if (
      !pair ||
      typeof pair.id !== "string" ||
      !["duplicate", "distinct"].includes(pair.label) ||
      !pair.newIssue ||
      !pair.existingIssue ||
      typeof pair.newIssue.title !== "string" ||
      typeof pair.newIssue.body !== "string" ||
      typeof pair.existingIssue.title !== "string" ||
      typeof pair.existingIssue.body !== "string"
    ) {
      throw new Error("each benchmark pair needs an id, label, and two complete issues");
    }
  }

  return dataset as BenchmarkDataset;
}

function normalizedThresholds(thresholds: number[]): number[] {
  const unique = [...new Set(thresholds)].sort((a, b) => a - b);
  if (unique.length === 0) {
    throw new Error("at least one benchmark threshold is required");
  }
  if (unique.some((threshold) => !Number.isFinite(threshold) || threshold < 0 || threshold > 1)) {
    throw new Error("benchmark thresholds must be numbers between 0 and 1");
  }
  return unique;
}

function scorePair(pair: BenchmarkPair): number {
  return weightedFuzzyScore(
    pair.newIssue.title,
    pair.existingIssue.title,
    pair.newIssue.body,
    pair.existingIssue.body,
    { title: 0.6, body: 0.4 },
  );
}

function metricValue(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/** Run precision/recall/F1 measurements at each supplied threshold. */
export function runBenchmark(
  dataset: BenchmarkDataset,
  thresholds: number[],
): BenchmarkReport {
  const normalized = normalizedThresholds(thresholds);
  const scored = dataset.pairs.map((pair) => ({
    duplicate: pair.label === "duplicate",
    score: scorePair(pair),
  }));

  return {
    datasetVersion: dataset.version,
    pairCount: dataset.pairs.length,
    metrics: normalized.map((threshold) => {
      let truePositives = 0;
      let falsePositives = 0;
      let trueNegatives = 0;
      let falseNegatives = 0;

      for (const item of scored) {
        const predicted = item.score >= threshold;
        if (predicted && item.duplicate) truePositives += 1;
        else if (predicted) falsePositives += 1;
        else if (item.duplicate) falseNegatives += 1;
        else trueNegatives += 1;
      }

      const precision = metricValue(truePositives, truePositives + falsePositives);
      const recall = metricValue(truePositives, truePositives + falseNegatives);

      return {
        threshold,
        truePositives,
        falsePositives,
        trueNegatives,
        falseNegatives,
        precision,
        recall,
        f1: metricValue(2 * precision * recall, precision + recall),
      };
    }),
  };
}

/** Render a compact table suitable for CI logs and local benchmark runs. */
export function formatBenchmarkReport(report: BenchmarkReport): string {
  const header = "threshold | precision | recall | f1 | TP | FP | TN | FN";
  const divider = "--- | --- | --- | --- | --- | --- | --- | ---";
  const rows = report.metrics.map((metric) =>
    [
      metric.threshold.toFixed(2),
      metric.precision.toFixed(3),
      metric.recall.toFixed(3),
      metric.f1.toFixed(3),
      metric.truePositives,
      metric.falsePositives,
      metric.trueNegatives,
      metric.falseNegatives,
    ].join(" | "),
  );
  return [`pairs: ${report.pairCount}`, header, divider, ...rows].join("\n");
}

interface CliOptions {
  datasetPath: string;
  thresholds: number[];
  outputPath?: string;
  baselinePath?: string;
  minimumF1?: number;
}

function parseArgs(argv: string[]): CliOptions {
  let datasetPath = "benchmark/dataset.json";
  let thresholds = [0.3, 0.5, 0.7];
  let outputPath: string | undefined;
  let baselinePath: string | undefined;
  let minimumF1: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--dataset" && value) {
      datasetPath = value;
      index += 1;
    } else if (argument === "--thresholds" && value) {
      thresholds = value.split(",").map(Number);
      index += 1;
    } else if (argument === "--output" && value) {
      outputPath = value;
      index += 1;
    } else if (argument === "--check-baseline" && value) {
      baselinePath = value;
      index += 1;
    } else if (argument === "--min-f1" && value) {
      minimumF1 = Number(value);
      index += 1;
    } else if (argument === "--help") {
      console.log(
        "Usage: npm run benchmark -- [--dataset path] [--thresholds 0.3,0.5] [--output path] [--check-baseline path] [--min-f1 0.5]",
      );
      process.exit(0);
    } else {
      throw new Error(`unknown or incomplete benchmark option: ${argument}`);
    }
  }

  if (minimumF1 !== undefined && (!Number.isFinite(minimumF1) || minimumF1 < 0 || minimumF1 > 1)) {
    throw new Error("min-f1 must be a number between 0 and 1");
  }

  return { datasetPath, thresholds, outputPath, baselinePath, minimumF1 };
}

function loadDataset(path: string): BenchmarkDataset {
  return validateDataset(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const report = runBenchmark(loadDataset(options.datasetPath), options.thresholds);

  if (
    options.minimumF1 !== undefined &&
    report.metrics.some((metric) => metric.f1 < options.minimumF1!)
  ) {
    throw new Error(`benchmark F1 is below the configured minimum of ${options.minimumF1}`);
  }

  if (options.baselinePath) {
    const expected = JSON.parse(readFileSync(options.baselinePath, "utf8")) as unknown;
    if (JSON.stringify(expected) !== JSON.stringify(report)) {
      throw new Error(`benchmark results differ from baseline: ${options.baselinePath}`);
    }
  }

  if (options.outputPath) {
    writeFileSync(options.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Duplicate benchmark\n\n${formatBenchmarkReport(report)}\n`);
  }

  console.log(formatBenchmarkReport(report));
  console.log(JSON.stringify(report, null, 2));
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && fileURLToPath(import.meta.url) === resolve(entry);
}

if (isMainModule()) {
  try {
    main();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
