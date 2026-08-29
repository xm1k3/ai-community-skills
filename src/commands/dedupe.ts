import type { Command } from "commander";
import { shortHash } from "../hash";
import { dedupeIndex } from "../index/builder";
import { confirm, log } from "../output";
import { loadConfig, requireIndex, saveIndex } from "../store";
import { AbortedError, run } from "./common";

export function registerDedupe(program: Command): void {
  program
    .command("dedupe")
    .description("Remove duplicate skills from the index by content hash, keeping the first source in config order")
    .option("--yes", "skip the confirmation prompt", false)
    .option("--dry-run", "list duplicates without modifying the index", false)
    .action(
      run(async (options: { yes: boolean; dryRun: boolean }) => {
        const index = requireIndex();
        const result = dedupeIndex(index, loadConfig().sources);
        if (result.removed.length === 0) {
          log("No duplicate skills found.");
          return;
        }
        for (const group of result.groups) {
          log(`${shortHash(group[0].contentHash)}: keeping ${group[0].name} from ${group[0].source} (${group[0].path || "."})`);
          for (const entry of group.slice(1)) log(`  removing ${entry.name} from ${entry.source} (${entry.path || "."})`);
        }
        log("");
        log(`${result.removed.length} duplicate(s) in ${result.groups.length} group(s). Index would shrink from ${index.length} to ${result.kept.length} skills.`);
        if (options.dryRun) {
          log("Dry run, the index was not modified.");
          return;
        }
        if (!options.yes) {
          const accepted = await confirm("Remove these duplicates from the index?");
          if (!accepted) throw new AbortedError("Dedupe aborted.");
        }
        saveIndex(result.kept);
        log(`Index now contains ${result.kept.length} skills. Duplicates return on the next "acs sync" unless the source is disabled.`);
      }),
    );
}
