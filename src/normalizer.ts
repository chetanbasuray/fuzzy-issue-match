import type { Normalizer } from "./types.js";

const PUNCTUATION_RE = /[^\w\s]/g;
const WHITESPACE_RE = /\s+/g;

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(PUNCTUATION_RE, "")
    .replace(WHITESPACE_RE, " ")
    .trim();
}

export function createNormalizer(): Normalizer {
  return {
    normalize(text: string): string {
      return normalizeText(text);
    },
  };
}

export { normalizeText };
