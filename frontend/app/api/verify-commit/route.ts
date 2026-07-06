import { NextRequest, NextResponse } from 'next/server';
import { isExcludedPath } from '@/lib/github-exclusions';

const REPO_URL_PATTERN = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/;
const SAFE_OWNER_REPO_PATTERN = /^[A-Za-z0-9_.-]+$/;
const COMMIT_HASH_PATTERN = /^[0-9a-f]{7,40}$/i;

const GITHUB_API_BASE = 'https://api.github.com';

function githubHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export async function POST(req: NextRequest) {
  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json({ verified: false, error: "Couldn't reach GitHub, try again" }, { status: 500 });
  }

  let body: { repoUrl?: string; commitHash?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ verified: false, error: 'Enter a valid GitHub repository URL' }, { status: 400 });
  }

  const { repoUrl, commitHash } = body;

  if (!repoUrl || !commitHash) {
    return NextResponse.json({ verified: false, error: 'Enter a valid GitHub repository URL' }, { status: 400 });
  }

  const match = repoUrl.match(REPO_URL_PATTERN);
  if (!match) {
    return NextResponse.json({ verified: false, error: 'Enter a valid GitHub repository URL' }, { status: 400 });
  }

  const [, owner, repo] = match;

  if (!SAFE_OWNER_REPO_PATTERN.test(owner) || !SAFE_OWNER_REPO_PATTERN.test(repo)) {
    return NextResponse.json({ verified: false, error: 'Enter a valid GitHub repository URL' }, { status: 400 });
  }

  if (!COMMIT_HASH_PATTERN.test(commitHash)) {
    return NextResponse.json({ verified: false, error: 'Commit not found in this repository' }, { status: 400 });
  }

  let commitRes: Response;
  let treeRes: Response;
  try {
    commitRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${commitHash}`, {
      headers: githubHeaders(),
    });
  } catch {
    return NextResponse.json({ verified: false, error: "Couldn't reach GitHub, try again" }, { status: 502 });
  }

  if (commitRes.status === 404) {
    // Could be an unknown repo or an unknown commit within a known repo — disambiguate.
    let repoRes: Response;
    try {
      repoRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, { headers: githubHeaders() });
    } catch {
      return NextResponse.json({ verified: false, error: "Couldn't reach GitHub, try again" }, { status: 502 });
    }
    if (repoRes.status === 404) {
      return NextResponse.json({ verified: false, error: 'Repository not found' }, { status: 404 });
    }
    return NextResponse.json({ verified: false, error: 'Commit not found in this repository' }, { status: 404 });
  }

  if (commitRes.status === 403 || commitRes.status === 429) {
    return NextResponse.json({ verified: false, error: 'GitHub rate limit reached, try again shortly' }, { status: 429 });
  }

  if (!commitRes.ok) {
    return NextResponse.json({ verified: false, error: "Couldn't reach GitHub, try again" }, { status: 502 });
  }

  const commitData = await commitRes.json();
  const lastCommitDate: string | undefined = commitData?.commit?.author?.date ?? commitData?.commit?.committer?.date;

  try {
    treeRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${commitHash}?recursive=1`, {
      headers: githubHeaders(),
    });
  } catch {
    return NextResponse.json({ verified: false, error: "Couldn't reach GitHub, try again" }, { status: 502 });
  }

  if (treeRes.status === 403 || treeRes.status === 429) {
    return NextResponse.json({ verified: false, error: 'GitHub rate limit reached, try again shortly' }, { status: 429 });
  }

  if (!treeRes.ok) {
    return NextResponse.json({ verified: false, error: "Couldn't reach GitHub, try again" }, { status: 502 });
  }

  const treeData = await treeRes.json();
  // TODO: treeData.truncated === true means GitHub capped the tree response for very large
  // repos, so fileCount below would undercount. Acceptable for hackathon-scope repo sizes;
  // flag to the user in the UI if this becomes a real concern.
  const allFiles: string[] = (treeData?.tree ?? [])
    .filter((entry: { type: string; path: string }) => entry.type === 'blob')
    .map((entry: { path: string }) => entry.path)
    .filter((path: string) => !isExcludedPath(path));

  return NextResponse.json({
    verified: true,
    fileCount: allFiles.length,
    lastCommitDate,
    files: allFiles.slice(0, 12),
  });
}
