import type { Command } from "commander";
import { describePlan, executeInstall, planInstall, riskSummaryLines } from "../install/installer";
import { parseTarget } from "../install/targets";
import { confirm, log, warn } from "../output";
import { loadInstalled, requireIndex } from "../store";
import type { InstallScope } from "../types";
import { AbortedError, resolveSkill, run } from "./common";

interface InstallOptions {
  target: string;
  personal: boolean;
  project: boolean;
  link: boolean;
  force: boolean;
  yes: boolean;
  dryRun: boolean;
  source?: string;
}

export function registerInstall(program: Command): void {
  program
    .command("install <skill>")
    .description("Install a skill into Claude Code, Codex CLI, Grok Build, or export it as a zip for claude.ai")
    .option("--target <target>", "install target: claude-code, codex, grok, web", "claude-code")
    .option("--personal", "install into the user level skills directory (default)", false)
    .option("--project", "install into the current project skills directory", false)
    .option("--link", "symlink the skill directory instead of copying it", false)
    .option("--force", "replace a conflicting or untracked existing installation", false)
    .option("--yes", "skip the confirmation prompt, the risk summary is still printed", false)
    .option("--dry-run", "print the plan and risk summary without writing anything", false)
    .option("--source <name>", "source to disambiguate a skill name")
    .action(
      run(async (name: string, options: InstallOptions) => {
        if (options.personal && options.project) throw new Error("--personal and --project cannot be combined");
        const target = parseTarget(options.target);
        const scope: InstallScope | null = target === "web" ? null : options.project ? "project" : "personal";
        const entry = resolveSkill(requireIndex(), name, options.source);
        const state = loadInstalled();
        const plan = planInstall({ entry, target, scope, link: options.link, force: options.force, cwd: process.cwd() }, state);

        log("Install plan");
        for (const line of describePlan(plan)) log(`  ${line}`);
        log("");
        log("Risk and security summary");
        for (const line of riskSummaryLines(entry)) log(`  ${line}`);
        if (plan.warnings.length > 0) {
          log("");
          for (const warning of plan.warnings) warn(warning);
        }
        if (plan.blockers.length > 0) {
          log("");
          throw new Error(plan.blockers.join("\n"));
        }
        if (options.dryRun) {
          log("");
          log("Dry run, nothing was written.");
          return;
        }
        log("");
        if (!options.yes) {
          const accepted = await confirm(`Install "${entry.name}" to ${plan.destination}?`);
          if (!accepted) throw new AbortedError("Installation aborted.");
        }
        const record = executeInstall(plan, state);
        log(`Installed "${record.name}" to ${record.installPath}${record.link ? " (symlink)" : ""}.`);
      }),
    );
}
