import type { Command } from "commander";
import { parseTarget } from "../install/targets";
import { formatTable, log, terminalWidth, truncate } from "../output";
import { requireIndex } from "../store";
import type { RiskLevel, SkillEntry } from "../types";
import { FLAG_LEGEND, flagCodes, run } from "./common";

export interface ListFilters {
  category?: string;
  risk?: string;
  tool?: string;
  source?: string;
  hasScripts?: boolean;
  network?: boolean;
  destructive?: boolean;
}

export function applyFilters(index: SkillEntry[], filters: ListFilters): SkillEntry[] {
  let entries = index;
  if (filters.category) {
    const wanted = filters.category.toLowerCase();
    entries = entries.filter((entry) => entry.category.toLowerCase() === wanted);
  }
  if (filters.risk) {
    const levels = filters.risk.split(",").map((level) => level.trim().toLowerCase()) as RiskLevel[];
    for (const level of levels) {
      if (!["low", "medium", "high"].includes(level)) throw new Error(`Unknown risk level "${level}". Expected low, medium, or high.`);
    }
    entries = entries.filter((entry) => levels.includes(entry.riskLevel));
  }
  if (filters.tool) {
    const target = parseTarget(filters.tool);
    if (target !== "claude-code") entries = entries.filter((entry) => !entry.claudeCodeOnly);
  }
  if (filters.source) entries = entries.filter((entry) => entry.source === filters.source);
  if (filters.hasScripts) entries = entries.filter((entry) => entry.hasScripts);
  if (filters.network) entries = entries.filter((entry) => entry.networkCalls);
  if (filters.destructive) entries = entries.filter((entry) => entry.destructiveOps);
  return entries;
}

export function renderSkillTable(entries: SkillEntry[]): string {
  const width = terminalWidth();
  const fixed = entries.reduce(
    (sum, entry) => Math.max(sum, entry.name.length + entry.category.length + entry.source.length),
    20,
  );
  const descriptionWidth = Math.max(24, width - fixed - 30);
  const rows = entries.map((entry) => [
    entry.name,
    entry.category,
    entry.source,
    entry.riskLevel,
    flagCodes(entry),
    truncate(entry.description, descriptionWidth),
  ]);
  return formatTable(["NAME", "CATEGORY", "SOURCE", "RISK", "FLAGS", "DESCRIPTION"], rows);
}

export function registerList(program: Command): void {
  program
    .command("list")
    .description("List indexed skills")
    .option("--category <category>", "filter by category")
    .option("--risk <level>", "filter by risk level: low, medium, high (comma separated)")
    .option("--tool <tool>", "hide skills that do not apply to the tool: claude-code, codex, web")
    .option("--source <name>", "filter by source name")
    .option("--has-scripts", "only skills that ship scripts or executable code blocks", false)
    .option("--network", "only skills that reference network calls", false)
    .option("--destructive", "only skills that reference destructive operations", false)
    .option("--json", "print JSON instead of a table", false)
    .action(
      run(async (options: ListFilters & { json: boolean }) => {
        const entries = applyFilters(requireIndex(), options);
        if (options.json) {
          log(JSON.stringify(entries, null, 2));
          return;
        }
        if (entries.length === 0) {
          log("No skills match the given filters.");
          return;
        }
        log(renderSkillTable(entries));
        log("");
        log(`${entries.length} skill(s). ${FLAG_LEGEND}`);
      }),
    );
}
