export interface GithubRepoRef {
  owner: string;
  name: string;
}

export function parseGithubRepo(repo: string): GithubRepoRef | null {
  const trimmed = repo.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const https = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)$/i.exec(trimmed);
  if (https) return { owner: https[1], name: https[2] };
  const ssh = /^git@github\.com:([^/]+)\/([^/]+)$/i.exec(trimmed);
  if (ssh) return { owner: ssh[1], name: ssh[2] };
  const shorthand = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(trimmed);
  if (shorthand) return { owner: shorthand[1], name: shorthand[2] };
  return null;
}

export function normalizeRepoUrl(repo: string): string {
  const ref = parseGithubRepo(repo);
  if (ref) return `https://github.com/${ref.owner}/${ref.name}`;
  return repo.replace(/\.git$/, "");
}

export function cloneUrl(repo: string): string {
  const trimmed = repo.trim();
  if (/^(https?:\/\/|git@|ssh:\/\/|file:\/\/|\/)/.test(trimmed)) return trimmed;
  const ref = parseGithubRepo(trimmed);
  if (ref) return `https://github.com/${ref.owner}/${ref.name}.git`;
  return trimmed;
}

export interface GithubRepoInfo {
  stars: number;
  pushedAt: string | null;
}

export async function fetchGithubRepoInfo(repo: string, timeoutMs = 8000): Promise<GithubRepoInfo | null> {
  const ref = parseGithubRepo(repo);
  if (!ref) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "ai-community-skills",
    };
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`https://api.github.com/repos/${ref.owner}/${ref.name}`, {
      headers,
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { stargazers_count?: number; pushed_at?: string };
    return {
      stars: typeof data.stargazers_count === "number" ? data.stargazers_count : 0,
      pushedAt: typeof data.pushed_at === "string" ? data.pushed_at : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
