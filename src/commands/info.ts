import type { Command } from "commander";
import { riskReasons } from "../analysis/risk";
import { formatKeyValues, log, yesNo } from "../output";
import { loadInstalled, requireIndex } from "../store";
import { findInstalled, resolveSkill, run } from "./common";

export function registerInfo(program: Command): void {
  program
    .command("info <skill>")
    .description("Show full metadata, risk flags, source reputation, and last commit for a skill")
    .option("--source <name>", "source to disambiguate a skill name")
    .option("--json", "print JSON instead of text", false)
    .action(
      run(async (name: string, options: { source?: string; json: boolean }) => {
        const entry = resolveSkill(requireIndex(), name, options.source);
        const installed = findInstalled(loadInstalled(), entry.name).filter((record) => record.source === entry.source);
        if (options.json) {
          log(JSON.stringify({ ...entry, installed }, null, 2));
          return;
        }
        log(`${entry.name}`);
        log("");
        log(formatKeyValues([
          ["Description", entry.description],
          ["Category", entry.category],
          ["Source", entry.source],
          ["Repository", entry.repository],
          ["Path", entry.path || "."],
          ["Lines", String(entry.lines)],
          ["Token estimate", String(entry.tokenEstimate)],
          ["Content hash", entry.contentHash],
        ]));
        log("");
        log("Risk analysis");
        log(formatKeyValues([
          ["Risk level", entry.riskLevel],
          ["Has scripts", yesNo(entry.hasScripts)],
          ["Network calls", yesNo(entry.networkCalls)],
          ["Destructive operations", yesNo(entry.destructiveOps)],
          ["Confirms before destructive", entry.destructiveOps ? yesNo(entry.confirmsBeforeDestructive) : "n/a"],
          ["Claude Code only", yesNo(entry.claudeCodeOnly)],
          ["Prompt injection suspected", yesNo(entry.promptInjectionSuspected)],
          ["Secret references", yesNo(entry.secretReferences)],
          ["Reasons", riskReasons(entry).join("; ") || "none"],
        ]));
        log("");
        log("Source reputation");
        log(formatKeyValues([
          ["Stars", String(entry.sourceReputation.stars)],
          ["Last activity", entry.sourceReputation.lastActivityDate || "unknown"],
          ["Single maintainer", yesNo(entry.sourceReputation.singleMaintainer)],
          ["CI configured", yesNo(entry.sourceReputation.hasCi)],
        ]));
        log("");
        log("Last commit");
        log(formatKeyValues([
          ["Hash", entry.lastCommitHash || "unknown"],
          ["Date", entry.lastCommitDate || "unknown"],
        ]));
        if (installed.length > 0) {
          log("");
          log("Installed");
          for (const record of installed) {
            const drift = record.contentHash !== entry.contentHash ? " (upstream content changed since install)" : "";
            log(`  ${record.target}${record.scope ? ` ${record.scope}` : ""} at ${record.installPath}${record.link ? " (symlink)" : ""} on ${record.installedAt}${drift}`);
          }
        }
      }),
    );
}
