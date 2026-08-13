import type { MatchInput, Matcher, DuplicateCandidate } from "./types.js";

export type IssueState = "open" | "closed";

export interface IssueMetadata {
  number: number;
  title: string;
  body: string;
}

export interface IssuePage {
  issues: IssueMetadata[];
  nextPage?: number;
}

export interface IssuePageSource {
  list(
    state: IssueState,
    page: number,
    pageSize: number,
  ): Promise<IssuePage>;
}

export interface IssueMetadataCache {
  get(key: string): IssueMetadata[] | undefined;
  set(key: string, issues: IssueMetadata[]): void;
  clear?(): void;
}

export interface MemoryCacheOptions {
  /** Time-to-live for each entry in milliseconds. */
  ttlMs?: number;
  /** Maximum number of repository/state entries retained. */
  maxEntries?: number;
  /** Injectable clock for deterministic tests and consumers. */
  now?: () => number;
}

export interface IssueScanOptions {
  state?: IssueState;
  pageSize?: number;
  maxPages?: number;
  cache?: IssueMetadataCache;
  cacheKey?: string;
  now?: () => number;
}

export interface IssueScanMetrics {
  pagesFetched: number;
  issuesFetched: number;
  cacheHit: boolean;
  truncated: boolean;
  durationMs: number;
}

export interface IssueScanResult {
  issues: IssueMetadata[];
  metrics: IssueScanMetrics;
}

export interface ScanAndMatchResult {
  matches: DuplicateCandidate[];
  scan: IssueScanResult;
}

interface CacheEntry {
  issues: IssueMetadata[];
  expiresAt: number;
  lastUsedAt: number;
}

/** Create a bounded in-memory TTL cache for issue metadata. */
export function createMemoryIssueCache(options: MemoryCacheOptions = {}): IssueMetadataCache {
  const ttlMs = options.ttlMs ?? 60_000;
  const maxEntries = options.maxEntries ?? 32;
  const now = options.now ?? Date.now;

  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error("ttlMs must be a positive finite number");
  }
  if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
    throw new Error("maxEntries must be a positive integer");
  }

  const entries = new Map<string, CacheEntry>();

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;

      const timestamp = now();
      if (entry.expiresAt <= timestamp) {
        entries.delete(key);
        return undefined;
      }

      entry.lastUsedAt = timestamp;
      return entry.issues.map((issue) => ({ ...issue }));
    },
    set(key, issues) {
      const timestamp = now();
      entries.set(key, {
        issues: issues.map((issue) => ({ ...issue })),
        expiresAt: timestamp + ttlMs,
        lastUsedAt: timestamp,
      });

      while (entries.size > maxEntries) {
        const oldest = [...entries.entries()].reduce((candidate, current) =>
          current[1].lastUsedAt < candidate[1].lastUsedAt ? current : candidate,
        );
        entries.delete(oldest[0]);
      }
    },
    clear() {
      entries.clear();
    },
  };
}

function validatePageSize(pageSize: number): void {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("pageSize must be a positive integer");
  }
}

function validateMaxPages(maxPages: number): void {
  if (!Number.isInteger(maxPages) || maxPages <= 0) {
    throw new Error("maxPages must be a positive integer");
  }
}

/**
 * Scan issue pages with optional bounded caching and runtime metrics.
 *
 * A scan is O(P + N), where P is the number of fetched pages and N is the
 * number of returned issues. The scanner stores O(N) metadata for one result;
 * the memory cache stores at most `maxEntries` such results.
 */
export async function scanIssuePages(
  source: IssuePageSource,
  options: IssueScanOptions = {},
): Promise<IssueScanResult> {
  const state = options.state ?? "open";
  const pageSize = options.pageSize ?? 100;
  const maxPages = options.maxPages ?? Number.MAX_SAFE_INTEGER;
  const now = options.now ?? Date.now;
  validatePageSize(pageSize);
  validateMaxPages(maxPages);

  const startedAt = now();
  const cacheKey = options.cache && options.cacheKey ? options.cacheKey : undefined;
  if (cacheKey) {
    const cached = options.cache!.get(cacheKey);
    if (cached) {
      return {
        issues: cached,
        metrics: {
          pagesFetched: 0,
          issuesFetched: cached.length,
          cacheHit: true,
          truncated: false,
          durationMs: Math.max(0, now() - startedAt),
        },
      };
    }
  }

  const issues: IssueMetadata[] = [];
  const seenPages = new Set<number>();
  let page = 1;
  let pagesFetched = 0;
  let truncated = false;

  while (pagesFetched < maxPages) {
    if (seenPages.has(page)) {
      throw new Error(`issue source repeated page ${page}`);
    }
    seenPages.add(page);

    const result = await source.list(state, page, pageSize);
    pagesFetched += 1;
    issues.push(...result.issues.map((issue) => ({ ...issue })));

    if (result.nextPage === undefined) {
      break;
    }

    const nextPage = result.nextPage ?? page + 1;
    if (nextPage <= page) {
      throw new Error(`issue source returned non-forward page ${nextPage}`);
    }
    page = nextPage;
    if (pagesFetched === maxPages) {
      truncated = true;
    }
  }

  if (cacheKey) {
    options.cache!.set(cacheKey, issues);
  }

  return {
    issues,
    metrics: {
      pagesFetched,
      issuesFetched: issues.length,
      cacheHit: false,
      truncated,
      durationMs: Math.max(0, now() - startedAt),
    },
  };
}

/** Scan paginated metadata and pass the complete result to the matcher. */
export async function findDuplicatesFromPages(
  matcher: Matcher,
  input: Omit<MatchInput, "existingIssues">,
  source: IssuePageSource,
  options: IssueScanOptions = {},
): Promise<ScanAndMatchResult> {
  const scan = await scanIssuePages(source, options);
  const matches = await matcher.findPossibleDuplicates({
    ...input,
    existingIssues: scan.issues,
  });
  return { matches, scan };
}
