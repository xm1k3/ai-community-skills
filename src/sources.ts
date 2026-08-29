import fs from "node:fs";
import path from "node:path";
import { parseGithubRepo } from "./github";
import { sourceDir, sourcesDir } from "./paths";
import { loadConfig, loadEmbeddings, loadIndex, saveConfig, saveEmbeddings, saveIndex } from "./store";
import type { Config, SourceConfig } from "./types";

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function validateSourceName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") throw new Error("Source name is required");
  if (!NAME_PATTERN.test(trimmed)) throw new Error("Source name may only contain letters, digits, dots, underscores, and hyphens");
  if (trimmed.length > 100) throw new Error("Source name is too long");
  return trimmed;
}

export function validateRepoUrl(repo: string): string {
  const trimmed = repo.trim();
  if (trimmed === "") throw new Error("Repository URL is required");
  if (parseGithubRepo(trimmed)) return trimmed;
  if (/^(https?:\/\/|git@|ssh:\/\/)\S+$/.test(trimmed)) return trimmed;
  throw new Error("Repository must be a GitHub URL, owner/repo, or a git URL");
}

export function suggestSourceName(repo: string): string {
  const parsed = parseGithubRepo(repo);
  if (parsed) return `${parsed.owner}-${parsed.name}`.toLowerCase().replace(/[^A-Za-z0-9._-]+/g, "-");
  return repo
    .replace(/\.git$/, "")
    .split(/[/:]/)
    .filter((part) => part !== "")
    .slice(-2)
    .join("-")
    .toLowerCase()
    .replace(/[^A-Za-z0-9._-]+/g, "-");
}

export function validateTrust(value: unknown): number {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) throw new Error("Trust must be a number between 0 and 100");
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

export function addSource(input: { name: string; repo: string; enabled?: boolean; trust?: unknown }): SourceConfig {
  const config = loadConfig();
  const name = validateSourceName(input.name);
  const repo = validateRepoUrl(input.repo);
  if (config.sources.some((source) => source.name.toLowerCase() === name.toLowerCase())) throw new Error(`A source named "${name}" already exists`);
  const sameRepo = config.sources.find((source) => source.repo === repo);
  if (sameRepo) throw new Error(`Repository ${repo} is already configured as "${sameRepo.name}"`);
  const source: SourceConfig = { name, repo, enabled: input.enabled !== false, ...(input.trust !== undefined ? { trust: validateTrust(input.trust) } : {}) };
  saveConfig({ ...config, sources: [...config.sources, source] });
  return source;
}

export function updateSource(name: string, patch: { repo?: string; enabled?: boolean; trust?: unknown }): SourceConfig {
  const config = loadConfig();
  const existing = config.sources.find((source) => source.name === name);
  if (!existing) throw new Error(`Unknown source "${name}"`);
  const updated: SourceConfig = {
    name: existing.name,
    repo: patch.repo !== undefined ? validateRepoUrl(patch.repo) : existing.repo,
    enabled: patch.enabled !== undefined ? Boolean(patch.enabled) : existing.enabled,
    ...(patch.trust !== undefined ? { trust: validateTrust(patch.trust) } : existing.trust !== undefined ? { trust: existing.trust } : {}),
  };
  if (config.sources.some((source) => source.name !== name && source.repo === updated.repo)) {
    throw new Error(`Repository ${updated.repo} is already configured for another source`);
  }
  saveConfig({ ...config, sources: config.sources.map((source) => (source.name === name ? updated : source)) });
  return updated;
}

export function deleteSource(name: string, options: { removeFiles: boolean }): { removedSkills: number; removedFiles: boolean } {
  const config = loadConfig();
  if (!config.sources.some((source) => source.name === name)) throw new Error(`Unknown source "${name}"`);
  const index = loadIndex();
  const kept = index.filter((entry) => entry.source !== name);
  const embeddings = loadEmbeddings();
  const prefix = `${name}/`;
  for (const key of Object.keys(embeddings)) if (key.startsWith(prefix)) delete embeddings[key];
  saveConfig({ ...config, sources: config.sources.filter((source) => source.name !== name) });
  saveIndex(kept);
  saveEmbeddings(embeddings);
  let removedFiles = false;
  if (options.removeFiles) {
    const dir = path.resolve(sourceDir(name));
    const root = path.resolve(sourcesDir());
    if (dir.startsWith(`${root}${path.sep}`) && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      removedFiles = true;
    }
  }
  return { removedSkills: index.length - kept.length, removedFiles };
}

export function setDedupeAfterSync(enabled: boolean): Config {
  const config = { ...loadConfig(), dedupeAfterSync: enabled };
  saveConfig(config);
  return config;
}
