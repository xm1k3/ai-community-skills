import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { loadSkillDirectory } from "../index/scanner";
import { log } from "../output";
import { sourceDir } from "../paths";
import { requireIndex } from "../store";
import type { ScannedSkill } from "../types";
import { validateSkill } from "../validate";
import { resolveSkill, run } from "./common";

interface ValidateTarget {
  label: string;
  skill: ScannedSkill | null;
  loadError: string | null;
}

function loadFromDirectory(dir: string, relativePath: string, label: string): ValidateTarget {
  const loaded = loadSkillDirectory(dir, relativePath);
  if ("reason" in loaded) return { label, skill: null, loadError: loaded.reason };
  return { label, skill: loaded, loadError: null };
}

export function registerValidate(program: Command): void {
  program
    .command("validate [skill]")
    .description("Validate frontmatter, referenced paths, and description length without modifying files")
    .option("--source <name>", "source to disambiguate a skill name")
    .option("--json", "print JSON instead of text", false)
    .action(
      run(async (skillArg: string | undefined, options: { source?: string; json: boolean }) => {
        const targets: ValidateTarget[] = [];
        if (skillArg && fs.existsSync(path.join(skillArg, "SKILL.md"))) {
          const dir = path.resolve(skillArg);
          targets.push(loadFromDirectory(dir, path.basename(dir), dir));
        } else if (skillArg) {
          const entry = resolveSkill(requireIndex(), skillArg, options.source);
          targets.push(loadFromDirectory(path.join(sourceDir(entry.source), entry.path), entry.path, `${entry.name} (${entry.source})`));
        } else {
          for (const entry of requireIndex()) {
            targets.push(loadFromDirectory(path.join(sourceDir(entry.source), entry.path), entry.path, `${entry.name} (${entry.source})`));
          }
        }

        let errorCount = 0;
        let warningCount = 0;
        const reports: { skill: string; errors: string[]; warnings: string[] }[] = [];
        for (const target of targets) {
          const report = target.skill ? validateSkill(target.skill) : { errors: [target.loadError ?? "could not load skill"], warnings: [] };
          errorCount += report.errors.length;
          warningCount += report.warnings.length;
          reports.push({ skill: target.label, ...report });
          if (options.json) continue;
          if (report.errors.length === 0 && report.warnings.length === 0) {
            if (targets.length === 1) log(`${target.label}: ok`);
            continue;
          }
          log(target.label);
          for (const error of report.errors) log(`  error: ${error}`);
          for (const warning of report.warnings) log(`  warning: ${warning}`);
        }
        if (options.json) {
          log(JSON.stringify({ skills: reports, errors: errorCount, warnings: warningCount }, null, 2));
        } else {
          log("");
          log(`${targets.length} skill(s) validated, ${errorCount} error(s), ${warningCount} warning(s).`);
        }
        if (errorCount > 0) process.exitCode = 1;
      }),
    );
}
