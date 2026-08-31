import type { SkillEntry } from "../types";

export const ROOT_FOLDER = ".";

function segments(skillPath: string): string[] {
  return skillPath.split("/").filter((segment) => segment !== "" && segment !== ".");
}

export function depthOf(skillPath: string): number {
  return segments(skillPath).length;
}

export function folderOf(skillPath: string): string {
  const parts = segments(skillPath);
  return parts.length <= 1 ? ROOT_FOLDER : parts.slice(0, -1).join("/");
}

export function inFolder(skillPath: string, folder: string): boolean {
  if (folder === ROOT_FOLDER) return depthOf(skillPath) <= 1;
  return skillPath === folder || skillPath.startsWith(`${folder}/`);
}

export function minDepthBySource(entries: Pick<SkillEntry, "source" | "path">[]): Map<string, number> {
  const depths = new Map<string, number>();
  for (const entry of entries) {
    const depth = depthOf(entry.path);
    const current = depths.get(entry.source);
    if (current === undefined || depth < current) depths.set(entry.source, depth);
  }
  return depths;
}

export function folderRank(entry: Pick<SkillEntry, "source" | "path">, minDepths: Map<string, number>): number {
  return Math.max(0, depthOf(entry.path) - (minDepths.get(entry.source) ?? 0));
}

export function folderFacets(entries: Pick<SkillEntry, "path">[], limit = 12): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const folder = folderOf(entry.path);
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => depthOf(a.name) - depthOf(b.name) || b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}
