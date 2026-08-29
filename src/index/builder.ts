import { analyzeSkill } from "../analysis/risk";
import type { ScannedSkill, SkillEntry, SourceReputation } from "../types";
import { validateSkill } from "../validate";
import { normalizedSkillHash } from "./normalize";
import { scanSkillTree, type InvalidSkill } from "./scanner";
import { loadUpstreamCatalog, type UpstreamMeta } from "./upstream";

export function qualityScoreFor(skill: ScannedSkill): number {
  const report = validateSkill(skill);
  return Math.max(0, Math.min(100, 100 - report.errors.length * 15 - report.warnings.length * 5));
}

export interface CommitLookup {
  (relativePath: string): { hash: string; date: string };
}

export interface BuildContext {
  source: string;
  repository: string;
  reputation: SourceReputation;
  commitLookup: CommitLookup;
}

export function buildEntry(skill: ScannedSkill, context: BuildContext, upstream?: UpstreamMeta): SkillEntry {
  const flags = analyzeSkill({ frontmatter: skill.frontmatter, body: skill.body, files: skill.files });
  const commit = context.commitLookup(skill.relativePath);
  const category = skill.category === "general" && upstream?.category ? upstream.category : skill.category;
  return {
    name: skill.name,
    description: skill.description,
    category,
    source: context.source,
    repository: context.repository,
    path: skill.relativePath,
    lastCommitHash: commit.hash,
    lastCommitDate: commit.date,
    contentHash: skill.contentHash,
    riskLevel: flags.riskLevel,
    hasScripts: flags.hasScripts,
    networkCalls: flags.networkCalls,
    destructiveOps: flags.destructiveOps,
    confirmsBeforeDestructive: flags.confirmsBeforeDestructive,
    claudeCodeOnly: flags.claudeCodeOnly,
    promptInjectionSuspected: flags.promptInjectionSuspected,
    secretReferences: flags.secretReferences,
    sourceReputation: { ...context.reputation },
    lines: skill.lines,
    tokenEstimate: skill.tokenEstimate,
    qualityScore: qualityScoreFor(skill),
    normalizedHash: normalizedSkillHash(skill),
    ...(upstream?.tags ? { tags: upstream.tags } : {}),
    ...(upstream?.tools ? { tools: upstream.tools } : {}),
    ...(upstream?.category ? { upstreamCategory: upstream.category } : {}),
    ...(upstream?.risk ? { upstreamRisk: upstream.risk } : {}),
    ...(upstream?.setup ? { setup: upstream.setup } : {}),
    ...(author(skill, upstream) ? { author: author(skill, upstream) } : {}),
  };
}

function author(skill: ScannedSkill, upstream?: UpstreamMeta): string | undefined {
  const fromFrontmatter = skill.frontmatter.author;
  if (typeof fromFrontmatter === "string" && fromFrontmatter.trim() !== "") return fromFrontmatter.trim().slice(0, 60);
  return upstream?.author;
}

export interface SourceBuildResult {
  entries: SkillEntry[];
  invalid: InvalidSkill[];
}

export function buildSourceIndex(rootDir: string, context: BuildContext): SourceBuildResult {
  const scan = scanSkillTree(rootDir);
  const upstream = loadUpstreamCatalog(rootDir);
  const entries = scan.skills.map((skill) => buildEntry(skill, context, upstream.get(skill.relativePath)));
  return { entries: sortEntries(entries), invalid: scan.invalid };
}

export function sortEntries(entries: SkillEntry[]): SkillEntry[] {
  return [...entries].sort(
    (a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source) || a.path.localeCompare(b.path),
  );
}

export function mergeIndex(previous: SkillEntry[], refreshedSources: string[], fresh: SkillEntry[]): SkillEntry[] {
  const refreshed = new Set(refreshedSources);
  const retained = previous.filter((entry) => !refreshed.has(entry.source));
  return sortEntries([...retained, ...fresh]);
}

export function skillKey(entry: Pick<SkillEntry, "name" | "source">): string {
  return `${entry.source}/${entry.name}`;
}

export interface DedupeResult {
  kept: SkillEntry[];
  removed: SkillEntry[];
  groups: SkillEntry[][];
}

export function dedupeIndex(index: SkillEntry[], sourceOrder: (string | { name: string; trust?: number })[]): DedupeResult {
  const rank = new Map<string, number>();
  const trust = new Map<string, number>();
  sourceOrder.forEach((item, position) => {
    const name = typeof item === "string" ? item : item.name;
    rank.set(name, position);
    trust.set(name, typeof item === "string" ? 50 : (item.trust ?? 50));
  });
  const byHash = new Map<string, SkillEntry[]>();
  for (const entry of index) {
    const key = entry.normalizedHash ?? entry.contentHash;
    const group = byHash.get(key) ?? [];
    group.push(entry);
    byHash.set(key, group);
  }
  const kept: SkillEntry[] = [];
  const removed: SkillEntry[] = [];
  const groups: SkillEntry[][] = [];
  for (const group of byHash.values()) {
    if (group.length === 1) {
      kept.push(group[0]);
      continue;
    }
    const ordered = [...group].sort(
      (a, b) =>
        (trust.get(b.source) ?? 50) - (trust.get(a.source) ?? 50) ||
        (rank.get(a.source) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.source) ?? Number.MAX_SAFE_INTEGER) ||
        a.path.length - b.path.length ||
        a.path.localeCompare(b.path),
    );
    groups.push(ordered);
    kept.push(ordered[0]);
    removed.push(...ordered.slice(1));
  }
  return { kept: sortEntries(kept), removed: sortEntries(removed), groups };
}
