import type { Command } from "commander";
import { formatTable, log } from "../output";
import { loadInstalled, requireIndex } from "../store";
import type { SkillEntry } from "../types";
import { run } from "./common";

function countBy(entries: SkillEntry[], pick: (entry: SkillEntry) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(pick(entry), (counts.get(pick(entry)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function computeStats(index: SkillEntry[]) {
  return {
    total: index.length,
    byCategory: Object.fromEntries(countBy(index, (entry) => entry.category)),
    bySource: Object.fromEntries(countBy(index, (entry) => entry.source)),
    byRisk: Object.fromEntries(countBy(index, (entry) => entry.riskLevel)),
    flags: {
      hasScripts: index.filter((entry) => entry.hasScripts).length,
      networkCalls: index.filter((entry) => entry.networkCalls).length,
      destructiveOps: index.filter((entry) => entry.destructiveOps).length,
      confirmsBeforeDestructive: index.filter((entry) => entry.confirmsBeforeDestructive).length,
      claudeCodeOnly: index.filter((entry) => entry.claudeCodeOnly).length,
      promptInjectionSuspected: index.filter((entry) => entry.promptInjectionSuspected).length,
      secretReferences: index.filter((entry) => entry.secretReferences).length,
    },
  };
}

export function registerStats(program: Command): void {
  program
    .command("stats")
    .description("Print counts by category, source, and risk level")
    .option("--json", "print JSON instead of text", false)
    .action(
      run(async (options: { json: boolean }) => {
        const index = requireIndex();
        const stats = computeStats(index);
        const installed = loadInstalled().installed.length;
        if (options.json) {
          log(JSON.stringify({ ...stats, installed }, null, 2));
          return;
        }
        log(`${stats.total} skills indexed, ${installed} installed.`);
        const section = (title: string, rows: [string, number][]) => {
          log("");
          log(title);
          log(formatTable(["NAME", "COUNT"], rows.map(([name, count]) => [name, String(count)])));
        };
        section("By risk level", ["low", "medium", "high"].map((level) => [level, stats.byRisk[level] ?? 0] as [string, number]));
        section("By source", Object.entries(stats.bySource));
        section("By category", Object.entries(stats.byCategory));
        section("Flags", Object.entries(stats.flags));
      }),
    );
}
