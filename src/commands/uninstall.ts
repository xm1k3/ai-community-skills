import type { Command } from "commander";
import { removeInstalled } from "../install/installer";
import { parseTarget } from "../install/targets";
import { confirm, log } from "../output";
import { loadInstalled } from "../store";
import type { InstallTarget } from "../types";
import { AbortedError, findInstalled, run } from "./common";

export function registerUninstall(program: Command): void {
  program
    .command("uninstall <skill>")
    .description("Remove an installed skill and its entry from installed.json")
    .option("--target <target>", "install target to remove from: claude-code, codex, grok, web")
    .option("--source <name>", "source to disambiguate a skill name")
    .option("--yes", "skip the confirmation prompt", false)
    .option("--dry-run", "print what would be removed without removing anything", false)
    .action(
      run(async (name: string, options: { target?: string; source?: string; yes: boolean; dryRun: boolean }) => {
        const target: InstallTarget | undefined = options.target ? parseTarget(options.target) : undefined;
        const state = loadInstalled();
        let records = findInstalled(state, name, target);
        if (options.source) records = records.filter((record) => record.source === options.source);
        if (records.length === 0) throw new Error(`Skill "${name}" is not installed${target ? ` for target ${target}` : ""}.`);
        if (records.length > 1 && !target) {
          const targets = records.map((record) => `${record.target}${record.scope ? ` ${record.scope}` : ""} at ${record.installPath}`).join("; ");
          throw new Error(`Skill "${name}" is installed in multiple locations: ${targets}. Pass --target to choose one.`);
        }
        for (const record of records) log(`Will remove ${record.installPath}${record.link ? " (symlink)" : ""} installed from ${record.source}.`);
        if (options.dryRun) {
          log("Dry run, nothing was removed.");
          return;
        }
        if (!options.yes) {
          const accepted = await confirm(`Remove ${records.length} installation(s) of "${name}"?`);
          if (!accepted) throw new AbortedError("Uninstall aborted.");
        }
        for (const record of records) {
          removeInstalled(record, loadInstalled());
          log(`Removed ${record.installPath}.`);
        }
      }),
    );
}
