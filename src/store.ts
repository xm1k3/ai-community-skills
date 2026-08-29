import fs from "node:fs";
import path from "node:path";
import { collectionsPath, configPath, embeddingsPath, indexPath, installedPath } from "./paths";
import type { CollectionsState, Config, EmbeddingsFile, InstalledState, SkillEntry, SourceConfig } from "./types";

export function readJsonFile<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  const raw = fs.readFileSync(file, "utf8");
  if (raw.trim() === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`Invalid JSON in ${file}: ${(error as Error).message}`);
  }
}

export function writeJsonFile(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

export function configExists(): boolean {
  return fs.existsSync(configPath());
}

function normalizeSource(raw: unknown, index: number): SourceConfig {
  if (!raw || typeof raw !== "object") throw new Error(`Invalid source entry at position ${index} in config.json`);
  const source = raw as Record<string, unknown>;
  if (typeof source.name !== "string" || source.name.trim() === "") {
    throw new Error(`Source at position ${index} is missing a name`);
  }
  if (typeof source.repo !== "string" || source.repo.trim() === "") {
    throw new Error(`Source "${source.name}" is missing a repo URL`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(source.name)) {
    throw new Error(`Source name "${source.name}" contains unsupported characters`);
  }
  const trust = typeof source.trust === "number" && Number.isFinite(source.trust) ? Math.max(0, Math.min(100, Math.round(source.trust))) : undefined;
  return { name: source.name, repo: source.repo, enabled: source.enabled !== false, ...(trust !== undefined ? { trust } : {}) };
}

export function parseConfigData(data: unknown): Config {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Config must be a JSON object");
  const raw = data as Partial<Config>;
  if (!Array.isArray(raw.sources)) throw new Error('Config is missing the "sources" array');
  const sources = raw.sources.map(normalizeSource);
  const embedding = raw.embedding && typeof raw.embedding === "object" && typeof raw.embedding.provider === "string"
    ? raw.embedding
    : null;
  return { sources, embedding, dedupeAfterSync: raw.dedupeAfterSync === true };
}

export function loadConfig(): Config {
  if (!configExists()) {
    throw new Error(`No config found at ${configPath()}. Run "acs init" first.`);
  }
  const raw = readJsonFile<Partial<Config>>(configPath(), {});
  return parseConfigData({ sources: [], ...raw });
}

export function saveConfig(config: Config): void {
  writeJsonFile(configPath(), config);
}

export function loadIndex(): SkillEntry[] {
  const index = readJsonFile<SkillEntry[]>(indexPath(), []);
  return Array.isArray(index) ? index : [];
}

export function requireIndex(): SkillEntry[] {
  const index = loadIndex();
  if (index.length === 0) {
    throw new Error(`The skill index is empty. Run "acs sync" to build it.`);
  }
  return index;
}

export function saveIndex(index: SkillEntry[]): void {
  writeJsonFile(indexPath(), index);
}

export function loadInstalled(): InstalledState {
  const state = readJsonFile<InstalledState>(installedPath(), { installed: [] });
  return { installed: Array.isArray(state.installed) ? state.installed : [] };
}

export function saveInstalled(state: InstalledState): void {
  writeJsonFile(installedPath(), state);
}

export function loadEmbeddings(): EmbeddingsFile {
  const data = readJsonFile<EmbeddingsFile>(embeddingsPath(), {});
  return data && typeof data === "object" ? data : {};
}

export function saveEmbeddings(data: EmbeddingsFile): void {
  writeJsonFile(embeddingsPath(), data);
}

export function loadCollections(): CollectionsState {
  const state = readJsonFile<Partial<CollectionsState>>(collectionsPath(), {});
  return {
    likes: Array.isArray(state.likes) ? state.likes : [],
    collections: Array.isArray(state.collections) ? state.collections : [],
  };
}

export function saveCollections(state: CollectionsState): void {
  writeJsonFile(collectionsPath(), state);
}
