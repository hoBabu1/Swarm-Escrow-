import { Octokit } from "octokit";
import { isExcludedPath } from "./exclusions.js";
import { mapWithConcurrency } from "../lib/concurrency.js";
import { logger } from "../lib/logger.js";

// Unauthenticated by default: CLAUDE.md scopes deliverables to public repos
// only (private-repo/GitHub App support is explicitly out of scope for this
// hackathon), and GITHUB_TOKEN isn't in the required env var list. An
// optional token can still be set to raise the unauthenticated 60 req/hr
// rate limit to 5000 req/hr if that becomes a problem during the demo — it
// changes nothing about which repos can be fetched, only how many requests
// are allowed before GitHub starts throttling.
const octokit = new Octokit(process.env.GITHUB_TOKEN ? { auth: process.env.GITHUB_TOKEN } : {});

const DEFAULT_MAX_TOTAL_BYTES = 1_000_000;
const maxTotalBytes = parseMaxTotalBytes(process.env.ORACLE_MAX_REPO_BYTES);

// A malformed ORACLE_MAX_REPO_BYTES (empty string, non-numeric, negative)
// must never silently disable the cap: Number("") is 0 (fine) but
// Number("abc") is NaN, and `x > NaN` is always false, which would make the
// cap-check in fetchRepoAtCommit never trigger and let an unbounded amount
// of repo content flow into the AI prompt context (contradicts CLAUDE.md's
// "reasonable total size cap" and risks blowing the ~$5 AI budget).
function parseMaxTotalBytes(raw: string | undefined): number {
  if (!raw) return DEFAULT_MAX_TOTAL_BYTES;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    logger.warn("invalid_max_repo_bytes_env_var", { raw, fallbackBytes: DEFAULT_MAX_TOTAL_BYTES });
    return DEFAULT_MAX_TOTAL_BYTES;
  }
  return parsed;
}

const FETCH_CONCURRENCY = 8;

const COMMIT_HASH_RE = /^[0-9a-fA-F]{7,40}$/;

export interface RepoFile {
  path: string;
  content: string;
}

export interface FetchRepoResult {
  files: RepoFile[];
  // True if GitHub itself truncated the tree listing (huge repo, >100k
  // entries) or the size cap below cut off remaining files.
  truncated: boolean;
  skippedForSize: string[];
}

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

function stripDotGit(repo: string): string {
  return repo.endsWith(".git") ? repo.slice(0, -4) : repo;
}

export function parseGitHubRepoUrl(repoUrl: string): { owner: string; repo: string } {
  const trimmed = repoUrl.trim();

  // git@github.com:owner/repo.git (scp-like syntax, not a valid URL to `new URL()`)
  const scpMatch = /^git@([^:/\s]+):([^/\s]+)\/([^/\s]+)$/.exec(trimmed);
  if (scpMatch) {
    const [, host, owner, repo] = scpMatch;
    if (!GITHUB_HOSTS.has(host!.toLowerCase())) {
      throw new Error(`Not a github.com repo URL (got host "${host}"): ${repoUrl}`);
    }
    return { owner: owner!, repo: stripDotGit(repo!) };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`Not a recognizable public GitHub repo URL: ${repoUrl}`);
  }

  // Exact hostname match only — reject lookalikes like "not-github.com" or
  // "github.com.evil.example" that a naive substring/regex check would accept.
  if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(`Not a github.com repo URL (got host "${url.hostname}"): ${repoUrl}`);
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const owner = segments[0];
  const repo = segments[1];
  if (!owner || !repo) {
    throw new Error(`Could not extract owner/repo from URL: ${repoUrl}`);
  }
  return { owner, repo: stripDotGit(repo) };
}

// Content at a pinned commit SHA is immutable by definition, so caching by
// (owner, repo, commitHash) indefinitely is always safe. This matters because
// chunk 5's Reviewer, Fraud/Sanity, Arbiter, and (if challenged) Senior
// Arbiter agent roles all need the same repo content for the same
// submission — without this cache, each role would independently re-trigger
// a full tree listing + one getBlob call per file, multiplying GitHub API
// usage by up to 4x against the unauthenticated 60 req/hr limit.
const repoCache = new Map<string, Promise<FetchRepoResult>>();

export async function fetchRepoAtCommit(repoUrl: string, commitHash: string): Promise<FetchRepoResult> {
  if (!COMMIT_HASH_RE.test(commitHash)) {
    throw new Error(`Not a valid git commit SHA: ${commitHash}`);
  }
  const { owner, repo } = parseGitHubRepoUrl(repoUrl);
  const cacheKey = `${owner}/${repo}@${commitHash}`;
  const cached = repoCache.get(cacheKey);
  if (cached) return cached;

  const resultPromise = fetchRepoAtCommitUncached(owner, repo, commitHash);
  // Don't cache a rejected fetch (transient failure) — let the next caller retry.
  resultPromise.catch(() => repoCache.delete(cacheKey));
  repoCache.set(cacheKey, resultPromise);
  return resultPromise;
}

async function fetchRepoAtCommitUncached(
  owner: string,
  repo: string,
  commitHash: string,
): Promise<FetchRepoResult> {
  const tree = await octokit.rest.git
    .getTree({ owner, repo, tree_sha: commitHash, recursive: "true" })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to fetch GitHub tree for ${owner}/${repo}@${commitHash}: ${message}`);
    });

  const blobEntries = (tree.data.tree ?? []).filter(
    (entry): entry is typeof entry & { path: string; sha: string } =>
      entry.type === "blob" && typeof entry.path === "string" && typeof entry.sha === "string",
  );

  const candidates = blobEntries.filter((entry) => !isExcludedPath(entry.path));

  // Decide inclusion by ascending size rather than raw tree order (which is
  // roughly alphabetical-by-directory and has no relation to importance).
  // Greedily taking smallest-first maximizes the *number* of distinct files
  // that fit under the cap, so one big generated/data file early in tree
  // order can't crowd out many small, more informative source files.
  // `included` below is derived by filtering `candidates` (not
  // `bySizeAscending`), so the final file list stays in original tree/path
  // order for readability in the AI prompt.
  const bySizeAscending = [...candidates].sort((a, b) => (a.size ?? 0) - (b.size ?? 0));
  const includedPaths = new Set<string>();
  const skippedForSize: string[] = [];
  let runningSize = 0;

  for (const entry of bySizeAscending) {
    const size = entry.size ?? 0;
    if (runningSize + size > maxTotalBytes) {
      skippedForSize.push(entry.path);
      continue;
    }
    runningSize += size;
    includedPaths.add(entry.path);
  }

  const included = candidates.filter((entry) => includedPaths.has(entry.path));

  const files = await mapWithConcurrency(included, FETCH_CONCURRENCY, async (entry) => {
    try {
      const { data: blob } = await octokit.rest.git.getBlob({ owner, repo, file_sha: entry.sha });
      const content =
        blob.encoding === "base64" ? Buffer.from(blob.content, "base64").toString("utf-8") : blob.content;
      return { path: entry.path, content };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to fetch blob for ${owner}/${repo}@${entry.path} (${entry.sha}): ${message}`);
    }
  });

  return {
    files,
    truncated: Boolean(tree.data.truncated) || skippedForSize.length > 0,
    skippedForSize,
  };
}
