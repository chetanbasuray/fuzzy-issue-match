const PUNCTUATION_RE = /[^\w\s]/g;
const WHITESPACE_RE = /\s+/g;
export function normalizeText(text) {
    return text
        .toLowerCase()
        .replace(PUNCTUATION_RE, "")
        .replace(WHITESPACE_RE, " ")
        .trim();
}
export function createNormalizer() {
    return {
        normalize(text) {
            return normalizeText(text);
        },
    };
}
