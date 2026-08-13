export { createNormalizer, normalizeText, } from "./normalizer.js";
export { levenshteinDistance, normalizedLevenshtein, weightedFuzzyScore, createLevenshteinScorer, } from "./levenshtein.js";
import { weightedFuzzyScore } from "./levenshtein.js";
const DEFAULTS = {
    threshold: 0.3,
    topK: 5,
    titleWeight: 0.6,
    bodyWeight: 0.4,
};
function createRanker(config) {
    return {
        rank(candidates) {
            const filtered = candidates.filter((c) => c.score >= config.threshold);
            filtered.sort((a, b) => b.score - a.score);
            return filtered.slice(0, config.topK);
        },
    };
}
export function createDuplicateIssueMatcher(config) {
    const merged = { ...DEFAULTS, ...config };
    const ranker = createRanker(merged);
    return {
        async findPossibleDuplicates(input) {
            const candidates = [];
            for (const existing of input.existingIssues) {
                const score = weightedFuzzyScore(input.newIssue.title, existing.title, input.newIssue.body, existing.body, { title: merged.titleWeight, body: merged.bodyWeight });
                candidates.push({
                    issueNumber: existing.number,
                    title: existing.title,
                    score,
                });
            }
            return ranker.rank(candidates);
        },
    };
}
