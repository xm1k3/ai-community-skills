import { fail } from "../output";
import type { InstalledRecord, InstalledState, InstallTarget, SkillEntry } from "../types";

export class AbortedError extends Error {
  constructor(message = "Aborted.") {
    super(message);
    this.name = "AbortedError";
  }
}

export function run<T extends unknown[]>(action: (...args: T) => Promise<void> | void): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await action(...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fail(message);
      process.exitCode = 1;
    }
  };
}

export function resolveSkill(index: SkillEntry[], name: string, source?: string): SkillEntry {
  const candidates = index.filter((entry) => entry.name === name && (!source || entry.source === source));
  if (candidates.length === 0) {
    const similar = index.filter((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (similar.length > 0 && !source) return resolveSkill(index, similar[0].name, source);
    throw new Error(source ? `Skill "${name}" was not found in source "${source}".` : `Skill "${name}" was not found in the index. Try "acs search ${name}".`);
  }
  if (candidates.length > 1) {
    const sources = candidates.map((entry) => `${entry.source} (${entry.path || "."})`).join(", ");
    throw new Error(`Skill "${name}" exists in multiple sources: ${sources}. Pass --source <name> to choose one.`);
  }
  return candidates[0];
}

export function findInstalled(state: InstalledState, name: string, target?: InstallTarget): InstalledRecord[] {
  return state.installed.filter((record) => record.name === name && (!target || record.target === target));
}

export function flagCodes(entry: SkillEntry): string {
  const codes: string[] = [];
  if (entry.hasScripts) codes.push("S");
  if (entry.networkCalls) codes.push("N");
  if (entry.destructiveOps) codes.push(entry.confirmsBeforeDestructive ? "D+" : "D");
  if (entry.promptInjectionSuspected) codes.push("P");
  if (entry.secretReferences) codes.push("K");
  if (entry.claudeCodeOnly) codes.push("C");
  return codes.join(",") || "-";
}

export const FLAG_LEGEND = "Flags: S scripts, N network, D destructive (D+ with confirmation), P prompt injection, K secrets, C claude-code only";

export function parseBooleanFlag(value: string | boolean | undefined): boolean {
  return value === true || value === "true" || value === "1";
}
