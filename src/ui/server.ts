import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { explainRisk, riskReasons } from "../analysis/risk";
import {
  addToCollection,
  createCollection,
  deleteCollection,
  exportCollection,
  normalizeRef,
  parseCollectionImport,
  refKey,
  removeFromCollection,
  toRef,
  toggleLike,
  updateCollection,
} from "../collections";
import { createEmbeddingProvider, EMBEDDING_CONFIG_HINT, rankBySimilarity, type EmbeddingProvider } from "../embeddings";
import { dedupeIndex } from "../index/builder";
import { loadSkillDirectory } from "../index/scanner";
import { describePlan, executeInstall, planInstall, removeInstalled, riskSummaryLines } from "../install/installer";
import { parseTarget } from "../install/targets";
import { acsHome, indexPath, sourceDir } from "../paths";
import { explainSearch, searchSkills } from "../search";
import { addSource, deleteSource, setDedupeAfterSync, suggestSourceName, updateSource } from "../sources";
import { loadCollections, loadConfig, loadEmbeddings, loadIndex, loadInstalled, saveIndex } from "../store";
import { cachedUpdateInfo, RELEASES_URL, UpdateChecker, UPGRADE_COMMAND } from "../update";
import type { CollectionsState, InstallScope, InstalledRecord, RiskLevel, SkillEntry, SkillRef } from "../types";
import { validateSkill } from "../validate";

interface JsonResponse {
  status: number;
  body: unknown;
}

interface SearchRequest {
  query?: string;
  limit?: number;
}

interface InstallBody {
  name?: string;
  source?: string;
  path?: string;
  target?: string;
  scope?: string;
  link?: boolean;
  force?: boolean;
}

interface UninstallBody {
  name?: string;
  source?: string;
  target?: string;
  installPath?: string;
}

interface BrowseParams {
  query: string;
  risk: string[];
  category: string;
  source: string;
  path: string;
  tag: string;
  author: string;
  installed: string;
  flags: string[];
  sort: string;
  order: string;
  page: number;
  size: number;
}

interface SyncJob {
  id: string;
  status: "running" | "done" | "failed";
  sources: string[];
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  lines: string[];
  partial: string;
}

type Body = Record<string, unknown>;

const MAX_BODY = 256 * 1024;
const MAX_JOB_LINES = 2000;
const RISK_ORDER: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".map": "application/json",
};

function readBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk: Buffer) => {
      data += chunk.toString("utf8");
      if (data.length > MAX_BODY) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(data));
    request.on("error", reject);
  });
}

function publicEntry(entry: SkillEntry) {
  return {
    name: entry.name,
    description: entry.description,
    category: entry.category,
    source: entry.source,
    repository: entry.repository,
    path: entry.path,
    riskLevel: entry.riskLevel,
    hasScripts: entry.hasScripts,
    networkCalls: entry.networkCalls,
    destructiveOps: entry.destructiveOps,
    confirmsBeforeDestructive: entry.confirmsBeforeDestructive,
    claudeCodeOnly: entry.claudeCodeOnly,
    promptInjectionSuspected: entry.promptInjectionSuspected,
    secretReferences: entry.secretReferences,
    sourceReputation: entry.sourceReputation,
    contentHash: entry.contentHash,
    lastCommitDate: entry.lastCommitDate,
    lines: entry.lines,
    tokenEstimate: entry.tokenEstimate,
    riskSummary: riskSummaryLines(entry),
    tags: entry.tags ?? [],
    tools: entry.tools ?? [],
    upstreamCategory: entry.upstreamCategory ?? null,
    upstreamRisk: entry.upstreamRisk ?? null,
    setup: entry.setup ?? null,
    author: entry.author ?? null,
    qualityScore: entry.qualityScore ?? null,
  };
}

function topAuthors(entries: SkillEntry[], limit = 10): { name: string; count: number; avgQuality: number | null }[] {
  const byAuthor = new Map<string, { count: number; qualitySum: number; qualityCount: number }>();
  for (const entry of entries) {
    if (!entry.author) continue;
    const row = byAuthor.get(entry.author) ?? { count: 0, qualitySum: 0, qualityCount: 0 };
    row.count++;
    if (typeof entry.qualityScore === "number") {
      row.qualitySum += entry.qualityScore;
      row.qualityCount++;
    }
    byAuthor.set(entry.author, row);
  }
  return [...byAuthor.entries()]
    .map(([name, row]) => ({ name, count: row.count, avgQuality: row.qualityCount > 0 ? Math.round(row.qualitySum / row.qualityCount) : null }))
    .sort((a, b) => b.count - a.count || (b.avgQuality ?? 0) - (a.avgQuality ?? 0) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function topTags(entries: SkillEntry[], limit = 30): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function countBy(entries: SkillEntry[], pick: (entry: SkillEntry) => string): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(pick(entry), (counts.get(pick(entry)) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function riskCounts(entries: SkillEntry[]): Record<RiskLevel, number> {
  const counts: Record<RiskLevel, number> = { high: 0, medium: 0, low: 0 };
  for (const entry of entries) counts[entry.riskLevel]++;
  return counts;
}

function flagCounts(entries: SkillEntry[]) {
  return {
    hasScripts: entries.filter((entry) => entry.hasScripts).length,
    networkCalls: entries.filter((entry) => entry.networkCalls).length,
    destructiveOps: entries.filter((entry) => entry.destructiveOps).length,
    confirmsBeforeDestructive: entries.filter((entry) => entry.confirmsBeforeDestructive).length,
    claudeCodeOnly: entries.filter((entry) => entry.claudeCodeOnly).length,
    promptInjectionSuspected: entries.filter((entry) => entry.promptInjectionSuspected).length,
    secretReferences: entries.filter((entry) => entry.secretReferences).length,
  };
}

function matchesFlag(entry: SkillEntry, flag: string): boolean {
  switch (flag) {
    case "scripts":
      return entry.hasScripts;
    case "network":
      return entry.networkCalls;
    case "destructive":
      return entry.destructiveOps;
    case "promptInjection":
      return entry.promptInjectionSuspected;
    case "secrets":
      return entry.secretReferences;
    case "claudeCodeOnly":
      return entry.claudeCodeOnly;
    case "portable":
      return !entry.claudeCodeOnly;
    case "clean":
      return !entry.hasScripts && !entry.networkCalls && !entry.destructiveOps && !entry.promptInjectionSuspected && !entry.secretReferences;
    default:
      throw new Error(`Unknown flag filter "${flag}"`);
  }
}

function parseBrowseParams(params: URLSearchParams): BrowseParams {
  const list = (key: string) =>
    (params.get(key) ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value !== "");
  const risk = list("risk");
  for (const level of risk) {
    if (!["low", "medium", "high"].includes(level)) throw new Error(`Unknown risk level "${level}". Expected low, medium, or high.`);
  }
  return {
    query: (params.get("query") ?? "").trim(),
    risk,
    category: (params.get("category") ?? "").trim(),
    source: (params.get("source") ?? "").trim(),
    path: (params.get("path") ?? "").trim().replace(/^\/+|\/+$/g, ""),
    tag: (params.get("tag") ?? "").trim().toLowerCase(),
    author: (params.get("author") ?? "").trim(),
    installed: params.get("installed") === "yes" ? "yes" : params.get("installed") === "no" ? "no" : "",
    flags: list("flags"),
    sort: params.get("sort") ?? "relevance",
    order: params.get("order") ?? "",
    page: Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1),
    size: Math.min(100, Math.max(1, Number.parseInt(params.get("size") ?? "25", 10) || 25)),
  };
}

function lastSyncDate(): string | null {
  try {
    return fs.statSync(indexPath()).mtime.toISOString();
  } catch {
    return null;
  }
}

function collapseDuplicates<T extends { entry: SkillEntry }>(items: T[]): (T & { copies: number })[] {
  const seen = new Map<string, T & { copies: number }>();
  const result: (T & { copies: number })[] = [];
  for (const item of items) {
    const key = item.entry.normalizedHash ?? item.entry.contentHash;
    const existing = seen.get(key);
    if (existing) {
      existing.copies++;
      continue;
    }
    const collapsed = { ...item, copies: 1 };
    seen.set(key, collapsed);
    result.push(collapsed);
  }
  return result;
}

function driftFor(record: InstalledRecord, index: SkillEntry[]): { drift: boolean; indexed: boolean } {
  const matches = index.filter(
    (item) => item.name === record.name && item.source === record.source && (record.path === undefined || item.path === record.path),
  );
  if (matches.length === 0) return { drift: false, indexed: false };
  return { drift: !matches.some((item) => item.contentHash === record.contentHash), indexed: true };
}

function findByRef(index: SkillEntry[], ref: SkillRef): SkillEntry | undefined {
  return index.find((entry) => entry.source === ref.source && entry.path === ref.path && entry.name === ref.name);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is required`);
  return value;
}

export class UiService {
  private index: SkillEntry[];
  private readonly cwd: string;
  private job: SyncJob | null = null;
  private child: ChildProcess | null = null;
  private readonly updates = new UpdateChecker();

  constructor(private readonly provider: EmbeddingProvider | null, cwd: string) {
    this.index = loadIndex();
    this.cwd = cwd;
  }

  get mode(): "semantic" | "lexical" {
    return this.provider ? "semantic" : "lexical";
  }

  private findEntry(body: InstallBody): SkillEntry {
    this.index = loadIndex();
    const candidates = this.index.filter(
      (entry) =>
        (!body.name || entry.name === body.name) &&
        (!body.source || entry.source === body.source) &&
        (body.path === undefined || entry.path === body.path),
    );
    if (candidates.length === 0) throw new Error(`Skill "${body.name ?? body.path ?? ""}" was not found in the index`);
    if (candidates.length > 1) throw new Error(`Skill "${body.name}" matches multiple index entries, source and path are required`);
    return candidates[0];
  }

  private installedFor(entry: SkillEntry, installed: InstalledRecord[]) {
    return installed
      .filter((record) => record.name === entry.name && record.source === entry.source && (record.path === undefined || record.path === entry.path))
      .map((record) => ({ target: record.target, scope: record.scope, installPath: record.installPath, drift: record.contentHash !== entry.contentHash }));
  }

  private libraryFor(entry: SkillEntry, library: CollectionsState) {
    const key = refKey(toRef(entry));
    return {
      liked: library.likes.some((ref) => refKey(ref) === key),
      groups: library.collections.filter((collection) => collection.skills.some((ref) => refKey(ref) === key)).map((collection) => collection.id),
    };
  }

  private listed(entry: SkillEntry, installed: InstalledRecord[], library: CollectionsState, extra: Record<string, unknown> = {}) {
    return { ...publicEntry(entry), installed: this.installedFor(entry, installed), ...this.libraryFor(entry, library), score: null, copies: 1, ...extra };
  }

  private async rank(query: string): Promise<{ entry: SkillEntry; score: number }[]> {
    if (!this.provider) return searchSkills(this.index, query, this.index.length).map((hit) => ({ entry: hit.entry, score: hit.score }));
    const embeddings = loadEmbeddings();
    const [vector] = await this.provider.embed([query]);
    return rankBySimilarity(this.index, embeddings, vector, this.index.length).map((hit) => ({ entry: hit.entry, score: hit.similarity }));
  }

  skill(params: { source?: string; path?: string; name?: string; query?: string }) {
    const entry = this.findEntry({ name: params.name, source: params.source, path: params.path });
    const dir = path.join(sourceDir(entry.source), entry.path);
    const loaded = loadSkillDirectory(dir, entry.path);
    if ("reason" in loaded) throw new Error(`Skill files could not be loaded from ${dir}: ${loaded.reason}. Run "acs sync".`);
    const skillMd = loaded.files.find((file) => file.relativePath === "SKILL.md")?.content ?? "";
    const lines = skillMd.replace(/\r\n/g, "\n").split("\n");
    let bodyLineOffset = 0;
    if (lines[0]?.trim() === "---") {
      const closing = lines.findIndex((line, index) => index > 0 && (line.trim() === "---" || line.trim() === "..."));
      bodyLineOffset = closing === -1 ? 0 : closing + 1;
    }
    const findings = explainRisk({ frontmatter: loaded.frontmatter, body: loaded.body, files: loaded.files, bodyLineOffset });
    const validation = validateSkill(loaded);
    const installed = loadInstalled().installed.filter((record) => record.name === entry.name && record.source === entry.source);
    const library = loadCollections();
    const query = (params.query ?? "").trim();
    return {
      entry: { ...publicEntry(entry), ...this.libraryFor(entry, library) },
      repositoryUrl: /^https?:\/\//.test(entry.repository) ? `${entry.repository.replace(/\/+$/, "")}${entry.path ? `/tree/HEAD/${entry.path}` : ""}` : null,
      frontmatter: loaded.frontmatter,
      files: loaded.files.map((file) => ({
        path: file.relativePath,
        content: file.content.length > 200000 ? `${file.content.slice(0, 200000)}\n[truncated]` : file.content,
        lines: file.content.split("\n").length,
      })),
      findings,
      reasons: riskReasons(entry),
      validation,
      installed: installed.map((record) => ({
        target: record.target,
        scope: record.scope,
        installPath: record.installPath,
        contentHash: record.contentHash,
        drift: record.contentHash !== entry.contentHash,
      })),
      scoreExplanation: query !== "" ? explainSearch(entry, query) : null,
      mode: this.mode,
      collections: library.collections.map((collection) => ({ id: collection.id, name: collection.name, skills: collection.skills.length })),
    };
  }

  status() {
    const embeddings = loadEmbeddings();
    const config = loadConfig();
    const library = loadCollections();
    return {
      mode: this.mode,
      provider: this.provider ? this.provider.name : null,
      model: this.provider ? this.provider.model : null,
      hint: this.provider ? null : EMBEDDING_CONFIG_HINT,
      skills: loadIndex().length,
      embeddings: Object.keys(embeddings).length,
      sources: config.sources.filter((source) => source.enabled).map((source) => source.name),
      installed: loadInstalled().installed.length,
      likes: library.likes.length,
      groups: library.collections.length,
      cwd: this.cwd,
      home: acsHome(),
      lastSync: lastSyncDate(),
      syncRunning: this.job?.status === "running",
      update: this.updateInfo(),
    };
  }

  private updateInfo() {
    if (this.updates.enabled) void this.updates.start();
    return { ...cachedUpdateInfo(), upgradeCommand: UPGRADE_COMMAND, releasesUrl: RELEASES_URL };
  }

  sources() {
    this.index = loadIndex();
    const config = loadConfig();
    return {
      dedupeAfterSync: config.dedupeAfterSync === true,
      sources: config.sources.map((source) => {
        const entries = this.index.filter((entry) => entry.source === source.name);
        const reputation = entries[0]?.sourceReputation ?? null;
        return {
          name: source.name,
          repo: source.repo,
          enabled: source.enabled,
          trust: source.trust ?? 50,
          cloned: fs.existsSync(path.join(sourceDir(source.name), ".git")),
          skills: entries.length,
          stars: reputation?.stars ?? 0,
          lastActivityDate: reputation?.lastActivityDate ?? "",
          singleMaintainer: reputation?.singleMaintainer ?? false,
          hasCi: reputation?.hasCi ?? false,
          byRisk: riskCounts(entries),
          categories: countBy(entries, (entry) => entry.category).length,
        };
      }),
    };
  }

  stats() {
    this.index = loadIndex();
    const installed = loadInstalled().installed;
    const library = loadCollections();
    const recent = collapseDuplicates(
      [...this.index]
        .filter((entry) => entry.lastCommitDate)
        .sort((a, b) => b.lastCommitDate.localeCompare(a.lastCommitDate) || a.name.localeCompare(b.name))
        .map((entry) => ({ entry })),
    )
      .slice(0, 10)
      .map(({ entry, copies }) => this.listed(entry, installed, library, { copies }));
    const attention = collapseDuplicates(
      this.index
        .filter((entry) => entry.promptInjectionSuspected)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => ({ entry })),
    )
      .slice(0, 10)
      .map(({ entry, copies }) => this.listed(entry, installed, library, { copies }));
    const duplicates = dedupeIndex(this.index, loadConfig().sources).removed.length;
    return {
      total: this.index.length,
      byRisk: riskCounts(this.index),
      byCategory: countBy(this.index, (entry) => entry.category),
      bySource: countBy(this.index, (entry) => entry.source),
      flags: flagCounts(this.index),
      installed: installed.length,
      drifted: installed.filter((record) => driftFor(record, this.index).drift).length,
      driftedSkills: installed
        .filter((record) => driftFor(record, this.index).drift)
        .slice(0, 10)
        .map((record) => ({ name: record.name, source: record.source, target: record.target, installPath: record.installPath })),
      tags: topTags(this.index, 24),
      authors: topAuthors(this.index),
      duplicates,
      likes: library.likes.length,
      groups: library.collections.length,
      lastSync: lastSyncDate(),
      mode: this.mode,
      sources: this.sources().sources,
      recent,
      attention,
    };
  }

  async browse(params: BrowseParams) {
    this.index = loadIndex();
    const installed = loadInstalled().installed;
    const library = loadCollections();
    let ranked: { entry: SkillEntry; score: number | null }[];
    if (params.query !== "") {
      ranked = await this.rank(params.query);
    } else {
      ranked = this.index.map((entry) => ({ entry, score: null }));
    }
    const filtered = ranked.filter(({ entry }) => {
      if (params.risk.length > 0 && !params.risk.includes(entry.riskLevel)) return false;
      if (params.category && entry.category !== params.category) return false;
      if (params.source && entry.source !== params.source) return false;
      if (params.path && entry.path !== params.path && !entry.path.startsWith(`${params.path}/`)) return false;
      if (params.tag && !(entry.tags ?? []).includes(params.tag)) return false;
      if (params.author && entry.author !== params.author) return false;
      if (params.installed) {
        const has = this.installedFor(entry, installed).length > 0;
        if (params.installed === "yes" ? !has : has) return false;
      }
      for (const flag of params.flags) if (!matchesFlag(entry, flag)) return false;
      return true;
    });
    const sort = params.sort === "relevance" && params.query === "" ? "name" : params.sort;
    const installedRank = (entry: SkillEntry) => (this.installedFor(entry, installed).length > 0 ? 1 : 0);
    const riskRank: Record<string, number> = { low: 0, medium: 1, high: 2 };
    const ascending = (a: { entry: SkillEntry; score: number | null }, b: { entry: SkillEntry; score: number | null }) => {
      switch (sort) {
        case "name":
          return a.entry.name.localeCompare(b.entry.name);
        case "installed":
          return installedRank(a.entry) - installedRank(b.entry);
        case "risk":
          return riskRank[a.entry.riskLevel] - riskRank[b.entry.riskLevel];
        case "updated":
          return a.entry.lastCommitDate.localeCompare(b.entry.lastCommitDate);
        case "stars":
          return a.entry.sourceReputation.stars - b.entry.sourceReputation.stars;
        case "size":
          return a.entry.lines - b.entry.lines;
        default:
          return (a.score ?? 0) - (b.score ?? 0);
      }
    };
    const order = params.order === "asc" || params.order === "desc" ? params.order : sort === "name" ? "asc" : "desc";
    const direction = order === "asc" ? 1 : -1;
    filtered.sort((a, b) => direction * ascending(a, b) || a.entry.name.localeCompare(b.entry.name));
    const collapsed = collapseDuplicates(filtered);
    const scoped = ranked.filter(({ entry }) => (!params.source || entry.source === params.source) && (!params.category || entry.category === params.category));
    const start = (params.page - 1) * params.size;
    return {
      query: params.query,
      mode: params.query === "" ? null : this.mode,
      total: collapsed.length,
      page: params.page,
      size: params.size,
      sort,
      order,
      results: collapsed
        .slice(start, start + params.size)
        .map(({ entry, score, copies }) => this.listed(entry, installed, library, { score: score === null ? null : Number(score.toFixed(4)), copies })),
      facets: {
        categories: countBy(
          scoped.map((item) => item.entry).filter((entry) => !params.category || entry.category === params.category),
          (entry) => entry.category,
        ),
        sources: countBy(
          ranked.map((item) => item.entry).filter((entry) => !params.category || entry.category === params.category),
          (entry) => entry.source,
        ),
        risk: riskCounts(ranked.map((item) => item.entry)),
        tags: topTags(scoped.map((item) => item.entry)),
      },
    };
  }

  async search(body: SearchRequest) {
    const query = (body.query ?? "").trim();
    if (query === "") throw new Error("Query is required");
    const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 50);
    this.index = loadIndex();
    const installed = loadInstalled().installed;
    const library = loadCollections();
    const ranked = (await this.rank(query)).slice(0, limit);
    return {
      query,
      mode: this.mode,
      results: ranked.map((hit) => this.listed(hit.entry, installed, library, { score: Number(hit.score.toFixed(4)) })),
      missingEmbeddings: this.provider ? this.index.length - Object.keys(loadEmbeddings()).length : 0,
    };
  }

  installed() {
    this.index = loadIndex();
    const records = loadInstalled().installed;
    return {
      installed: records.map((record) => ({ ...record, ...driftFor(record, this.index) })),
    };
  }

  private resolveInstall(body: InstallBody) {
    const entry = this.findEntry(body);
    const target = parseTarget(body.target ?? "claude-code");
    const scope: InstallScope | null = target === "web" ? null : body.scope === "project" ? "project" : "personal";
    return planInstall({ entry, target, scope, link: Boolean(body.link), force: Boolean(body.force), cwd: this.cwd });
  }

  plan(body: InstallBody) {
    const plan = this.resolveInstall(body);
    return {
      plan: describePlan(plan),
      riskSummary: riskSummaryLines(plan.entry),
      warnings: plan.warnings,
      blockers: plan.blockers,
      destination: plan.destination,
      canInstall: plan.blockers.length === 0,
    };
  }

  install(body: InstallBody) {
    const plan = this.resolveInstall(body);
    if (plan.blockers.length > 0) throw new Error(plan.blockers.join("\n"));
    const record = executeInstall(plan);
    return { installed: record };
  }

  uninstall(body: UninstallBody) {
    if (!body.name || !body.target || !body.installPath) throw new Error("name, target, and installPath are required");
    const state = loadInstalled();
    const record = state.installed.find(
      (item) =>
        item.name === body.name &&
        item.target === body.target &&
        path.resolve(item.installPath) === path.resolve(body.installPath as string) &&
        (!body.source || item.source === body.source),
    );
    if (!record) throw new Error(`Skill "${body.name}" is not installed at ${body.installPath}`);
    removeInstalled(record, state);
    return { removed: record };
  }

  dedupePreview() {
    this.index = loadIndex();
    const result = dedupeIndex(this.index, loadConfig().sources);
    const bySource = new Map<string, number>();
    for (const entry of result.removed) bySource.set(entry.source, (bySource.get(entry.source) ?? 0) + 1);
    return {
      before: this.index.length,
      after: result.kept.length,
      removed: result.removed.length,
      groupCount: result.groups.length,
      bySource: [...bySource.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      groups: result.groups.slice(0, 200).map((group) => ({
        contentHash: group[0].contentHash,
        keep: toRef(group[0]),
        remove: group.slice(1).map((entry) => toRef(entry)),
      })),
      truncated: result.groups.length > 200,
    };
  }

  dedupeApply() {
    this.index = loadIndex();
    const result = dedupeIndex(this.index, loadConfig().sources);
    saveIndex(result.kept);
    this.index = result.kept;
    return { removed: result.removed.length, groups: result.groups.length, total: result.kept.length };
  }

  syncStatus() {
    if (!this.job) return { job: null };
    return { job: { ...this.job, lines: this.job.lines.slice(-MAX_JOB_LINES) } };
  }

  startSync(body: Body) {
    if (this.job?.status === "running") throw new Error("A sync is already running");
    const config = loadConfig();
    const requested = Array.isArray(body.sources) ? body.sources.filter((item): item is string => typeof item === "string") : [];
    for (const name of requested) {
      if (!config.sources.some((source) => source.name === name)) throw new Error(`Unknown source "${name}"`);
    }
    const selected = config.sources.filter((source) => source.enabled && (requested.length === 0 || requested.includes(source.name)));
    if (selected.length === 0) throw new Error("No enabled sources to sync");
    const cli = process.argv[1];
    if (!cli) throw new Error("Cannot locate the acs executable to run the sync");
    const args = [cli, "sync"];
    if (requested.length > 0) args.push("--source", ...requested);
    if (body.dedupe === true) args.push("--dedupe");
    const job: SyncJob = {
      id: Date.now().toString(36),
      status: "running",
      sources: selected.map((source) => source.name),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      exitCode: null,
      lines: [],
      partial: "",
    };
    this.job = job;
    const child = spawn(process.execPath, args, { cwd: this.cwd, env: { ...process.env, FORCE_COLOR: "0" }, stdio: ["ignore", "pipe", "pipe"] });
    this.child = child;
    const push = (chunk: Buffer) => {
      job.partial += chunk.toString("utf8");
      const parts = job.partial.split(/\r?\n/);
      job.partial = parts.pop() ?? "";
      for (const line of parts) {
        job.lines.push(line);
        if (job.lines.length > MAX_JOB_LINES) job.lines.shift();
      }
    };
    child.stdout?.on("data", push);
    child.stderr?.on("data", push);
    child.on("error", (error) => {
      job.lines.push(`Error: ${error.message}`);
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      this.child = null;
    });
    child.on("close", (code) => {
      if (job.partial !== "") {
        job.lines.push(job.partial);
        job.partial = "";
      }
      job.exitCode = code;
      job.status = code === 0 ? "done" : "failed";
      job.finishedAt = new Date().toISOString();
      this.child = null;
      this.index = loadIndex();
    });
    return { job };
  }

  cancelSync() {
    if (!this.child || this.job?.status !== "running") throw new Error("No sync is running");
    this.child.kill("SIGTERM");
    return { cancelled: true };
  }

  addSource(body: Body) {
    const repo = requireString(body.repo, "Repository URL");
    const name = typeof body.name === "string" && body.name.trim() !== "" ? body.name : suggestSourceName(repo);
    return { source: addSource({ name, repo, enabled: body.enabled !== false, trust: typeof body.trust === "number" ? body.trust : undefined }) };
  }

  updateSource(body: Body) {
    const name = requireString(body.name, "Source name");
    return {
      source: updateSource(name, {
        repo: typeof body.repo === "string" ? body.repo : undefined,
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        trust: typeof body.trust === "number" ? body.trust : undefined,
      }),
    };
  }

  deleteSource(body: Body) {
    const name = requireString(body.name, "Source name");
    return deleteSource(name, { removeFiles: body.removeFiles !== false });
  }

  suggestName(repo: string) {
    return { name: suggestSourceName(repo) };
  }

  setDedupeAfterSync(body: Body) {
    return { dedupeAfterSync: setDedupeAfterSync(body.enabled === true).dedupeAfterSync === true };
  }

  private resolveRefs(refs: SkillRef[], installed: InstalledRecord[], library: CollectionsState) {
    return refs.map((ref) => {
      const entry = findByRef(this.index, ref);
      return entry ? { ...this.listed(entry, installed, library), missing: false } : { ...ref, missing: true };
    });
  }

  library() {
    this.index = loadIndex();
    const installed = loadInstalled().installed;
    const library = loadCollections();
    return {
      likes: this.resolveRefs(library.likes, installed, library),
      collections: library.collections.map((collection) => ({
        ...collection,
        skills: this.resolveRefs(collection.skills, installed, library),
      })),
    };
  }

  toggleLike(body: Body) {
    return { liked: toggleLike(normalizeRef(body)).liked };
  }

  createCollection(body: Body) {
    const skills = Array.isArray(body.skills) ? body.skills.map(normalizeRef) : [];
    return {
      collection: createCollection({ name: requireString(body.name, "Group name"), description: typeof body.description === "string" ? body.description : "", skills }),
    };
  }

  updateCollection(body: Body) {
    return {
      collection: updateCollection(requireString(body.id, "Group id"), {
        name: typeof body.name === "string" ? body.name : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
      }),
    };
  }

  deleteCollection(body: Body) {
    deleteCollection(requireString(body.id, "Group id"));
    return { deleted: true };
  }

  addToCollection(body: Body) {
    return { collection: addToCollection(requireString(body.id, "Group id"), normalizeRef(body.skill)) };
  }

  removeFromCollection(body: Body) {
    return { collection: removeFromCollection(requireString(body.id, "Group id"), normalizeRef(body.skill)) };
  }

  exportCollection(id: string) {
    this.index = loadIndex();
    const collection = loadCollections().collections.find((item) => item.id === id);
    if (!collection) throw new Error(`Group "${id}" was not found`);
    return exportCollection(collection, this.index);
  }

  importCollection(body: Body) {
    const parsed = parseCollectionImport(body.data);
    this.index = loadIndex();
    const missing = parsed.skills.filter((ref) => !findByRef(this.index, ref));
    const collection = createCollection(parsed);
    return { collection, missing };
  }

  private plansForRefs(refs: SkillRef[], body: Body) {
    this.index = loadIndex();
    const target = parseTarget(typeof body.target === "string" ? body.target : "claude-code");
    const scope: InstallScope | null = target === "web" ? null : body.scope === "project" ? "project" : "personal";
    return refs.map((ref) => {
      const entry = findByRef(this.index, ref);
      if (!entry) return { ref, entry: null, plan: null };
      return { ref, entry, plan: planInstall({ entry, target, scope, link: body.link === true, force: body.force === true, cwd: this.cwd }) };
    });
  }

  private planItems(plans: ReturnType<UiService["plansForRefs"]>) {
    return plans.map(({ ref, entry, plan }) => ({
      skill: ref,
      riskLevel: entry?.riskLevel ?? null,
      destination: plan?.destination ?? null,
      warnings: plan?.warnings ?? [],
      blockers: entry ? (plan?.blockers ?? []) : ["skill is not in the index, run acs sync"],
    }));
  }

  private installFromPlans(plans: ReturnType<UiService["plansForRefs"]>, body: Body) {
    const skip = new Set(Array.isArray(body.skip) ? body.skip.map((item) => refKey(normalizeRef(item))) : []);
    return plans.map(({ ref, entry, plan }) => {
      if (skip.has(refKey(ref))) return { skill: ref, status: "skipped", detail: "skipped" };
      if (!entry || !plan) return { skill: ref, status: "failed", detail: "skill is not in the index" };
      if (plan.blockers.length > 0) return { skill: ref, status: "failed", detail: plan.blockers.join("; ") };
      try {
        const record = executeInstall(plan);
        return { skill: ref, status: "installed", detail: record.installPath };
      } catch (error) {
        return { skill: ref, status: "failed", detail: error instanceof Error ? error.message : String(error) };
      }
    });
  }

  private collectionPlans(body: Body) {
    const id = requireString(body.id, "Group id");
    const collection = loadCollections().collections.find((item) => item.id === id);
    if (!collection) throw new Error(`Group "${id}" was not found`);
    return { collection, plans: this.plansForRefs(collection.skills, body) };
  }

  private bulkRefs(body: Body): SkillRef[] {
    if (!Array.isArray(body.skills) || body.skills.length === 0) throw new Error("skills must be a non-empty array");
    if (body.skills.length > 200) throw new Error("At most 200 skills per bulk install");
    return body.skills.map((item) => normalizeRef(item));
  }

  planCollectionInstall(body: Body) {
    const { collection, plans } = this.collectionPlans(body);
    return { collection: { id: collection.id, name: collection.name }, items: this.planItems(plans) };
  }

  installCollection(body: Body) {
    return { results: this.installFromPlans(this.collectionPlans(body).plans, body) };
  }

  planBulkInstall(body: Body) {
    return { items: this.planItems(this.plansForRefs(this.bulkRefs(body), body)) };
  }

  bulkInstall(body: Body) {
    return { results: this.installFromPlans(this.plansForRefs(this.bulkRefs(body), body), body) };
  }
}

async function route(service: UiService, request: http.IncomingMessage): Promise<JsonResponse> {
  const url = new URL(request.url ?? "/", "http://localhost");
  const method = request.method ?? "GET";
  if (method === "GET") {
    switch (url.pathname) {
      case "/api/status":
        return { status: 200, body: service.status() };
      case "/api/stats":
        return { status: 200, body: service.stats() };
      case "/api/sources":
        return { status: 200, body: service.sources() };
      case "/api/sources/suggest":
        return { status: 200, body: service.suggestName(url.searchParams.get("repo") ?? "") };
      case "/api/installed":
        return { status: 200, body: service.installed() };
      case "/api/skills":
        return { status: 200, body: await service.browse(parseBrowseParams(url.searchParams)) };
      case "/api/sync/status":
        return { status: 200, body: service.syncStatus() };
      case "/api/dedupe/preview":
        return { status: 200, body: service.dedupePreview() };
      case "/api/library":
        return { status: 200, body: service.library() };
      case "/api/collections/export":
        return { status: 200, body: service.exportCollection(url.searchParams.get("id") ?? "") };
      case "/api/skill":
        return {
          status: 200,
          body: service.skill({
            source: url.searchParams.get("source") ?? undefined,
            path: url.searchParams.get("path") ?? undefined,
            name: url.searchParams.get("name") ?? undefined,
            query: url.searchParams.get("query") ?? undefined,
          }),
        };
      default:
        return { status: 404, body: { error: "Not found" } };
    }
  }
  if (method === "POST") {
    const raw = await readBody(request);
    let body: Body = {};
    if (raw.trim() !== "") {
      try {
        body = JSON.parse(raw) as Body;
      } catch {
        return { status: 400, body: { error: "Invalid JSON body" } };
      }
    }
    switch (url.pathname) {
      case "/api/search":
        return { status: 200, body: await service.search(body as SearchRequest) };
      case "/api/install/plan":
        return { status: 200, body: service.plan(body as InstallBody) };
      case "/api/install/execute":
        return { status: 200, body: service.install(body as InstallBody) };
      case "/api/uninstall":
        return { status: 200, body: service.uninstall(body as UninstallBody) };
      case "/api/sync":
        return { status: 200, body: service.startSync(body) };
      case "/api/sync/cancel":
        return { status: 200, body: service.cancelSync() };
      case "/api/dedupe":
        return { status: 200, body: service.dedupeApply() };
      case "/api/config/dedupe-after-sync":
        return { status: 200, body: service.setDedupeAfterSync(body) };
      case "/api/sources":
        return { status: 200, body: service.addSource(body) };
      case "/api/sources/update":
        return { status: 200, body: service.updateSource(body) };
      case "/api/sources/delete":
        return { status: 200, body: service.deleteSource(body) };
      case "/api/likes/toggle":
        return { status: 200, body: service.toggleLike(body) };
      case "/api/collections":
        return { status: 200, body: service.createCollection(body) };
      case "/api/collections/update":
        return { status: 200, body: service.updateCollection(body) };
      case "/api/collections/delete":
        return { status: 200, body: service.deleteCollection(body) };
      case "/api/collections/add":
        return { status: 200, body: service.addToCollection(body) };
      case "/api/collections/remove":
        return { status: 200, body: service.removeFromCollection(body) };
      case "/api/collections/import":
        return { status: 200, body: service.importCollection(body) };
      case "/api/collections/install/plan":
        return { status: 200, body: service.planCollectionInstall(body) };
      case "/api/collections/install":
        return { status: 200, body: service.installCollection(body) };
      case "/api/install/bulk/plan":
        return { status: 200, body: service.planBulkInstall(body) };
      case "/api/install/bulk":
        return { status: 200, body: service.bulkInstall(body) };
      default:
        return { status: 404, body: { error: "Not found" } };
    }
  }
  return { status: 404, body: { error: "Not found" } };
}

export function resolveUiDir(): string | null {
  const override = process.env.ACS_UI_DIR;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [override, path.join(here, "ui"), path.join(here, "..", "dist", "ui"), path.join(here, "..", "..", "dist", "ui")].filter(
    (candidate): candidate is string => Boolean(candidate),
  );
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "index.html"))) return candidate;
  }
  return null;
}

function serveStatic(uiDir: string | null, pathname: string, response: http.ServerResponse): void {
  if (!uiDir) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end('The web UI assets were not found. Run "npm run build" or reinstall the package.');
    return;
  }
  const decoded = decodeURIComponent(pathname);
  const relative = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const candidate = path.join(uiDir, relative);
  const isAsset = path.extname(relative) !== "";
  const file = isAsset && candidate.startsWith(uiDir) && fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : path.join(uiDir, "index.html");
  if (isAsset && file !== candidate) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  const type = CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream";
  const cache = file.endsWith("index.html") ? "no-store" : "public, max-age=31536000, immutable";
  response.writeHead(200, { "Content-Type": type, "Cache-Control": cache });
  fs.createReadStream(file).pipe(response);
}

export interface UiServerOptions {
  host: string;
  port: number;
  cwd: string;
}

export function createUiService(cwd: string): UiService {
  const config = loadConfig();
  const provider = createEmbeddingProvider(config.embedding);
  if (provider && loadIndex().length > 0 && Object.keys(loadEmbeddings()).length === 0) {
    throw new Error('An embedding provider is configured but no embeddings have been computed yet. Run "acs sync" first.');
  }
  return new UiService(provider, cwd);
}

export function createUiServer(service: UiService, host: string): http.Server {
  const uiDir = resolveUiDir();
  return http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/")) {
      if ((request.method ?? "GET") !== "GET") {
        response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Method not allowed");
        return;
      }
      serveStatic(uiDir, url.pathname, response);
      return;
    }
    const origin = request.headers.origin;
    if (origin && !origin.startsWith(`http://${host}:`) && !origin.startsWith("http://localhost:") && !origin.startsWith("http://127.0.0.1:")) {
      response.writeHead(403, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Cross-origin requests are not allowed" }));
      return;
    }
    try {
      const result = await route(service, request);
      response.writeHead(result.status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify(result.body));
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });
}

function listen(server: http.Server, host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

export async function startUiServer(options: UiServerOptions): Promise<{ server: http.Server; url: string; mode: "semantic" | "lexical"; fallbackPort: boolean }> {
  const service = createUiService(options.cwd);
  const server = createUiServer(service, options.host);
  let fallbackPort = false;
  let port: number;
  try {
    port = await listen(server, options.host, options.port);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EADDRINUSE" || options.port === 0) throw error;
    fallbackPort = true;
    port = await listen(server, options.host, 0);
  }
  return { server, url: `http://${options.host}:${port}/`, mode: service.mode, fallbackPort };
}
