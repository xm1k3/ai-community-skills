import type { Command } from "commander";
import { configPath } from "../paths";
import { log } from "../output";
import { configExists, saveConfig } from "../store";
import type { Config } from "../types";
import { run } from "./common";

export const DEFAULT_SOURCES: Config["sources"] = [
  { name: "anthropic-skills", repo: "https://github.com/anthropics/skills", enabled: true },
  { name: "superpowers", repo: "https://github.com/obra/superpowers", enabled: true },
  { name: "composio-awesome-claude-skills", repo: "https://github.com/ComposioHQ/awesome-claude-skills", enabled: true },
  { name: "sickn33-agentic-awesome-skills", repo: "https://github.com/sickn33/agentic-awesome-skills", enabled: true },
  { name: "alirezarezvani-claude-skills", repo: "https://github.com/alirezarezvani/claude-skills", enabled: true },
  { name: "behisecc-awesome-claude-skills", repo: "https://github.com/BehiSecc/awesome-claude-skills", enabled: true },
  { name: "travisvn-awesome-claude-skills", repo: "https://github.com/travisvn/awesome-claude-skills", enabled: true },
];

export function defaultConfig(): Config {
  return { sources: DEFAULT_SOURCES.map((source) => ({ ...source })), embedding: null };
}

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Write the default config.json with a small set of community sources")
    .option("--force", "overwrite an existing config.json", false)
    .option("--dry-run", "print the config that would be written without writing it", false)
    .action(
      run(async (options: { force: boolean; dryRun: boolean }) => {
        const config = defaultConfig();
        if (options.dryRun) {
          log(`Would write ${configPath()}:`);
          log(JSON.stringify(config, null, 2));
          return;
        }
        if (configExists() && !options.force) {
          throw new Error(`${configPath()} already exists. Pass --force to overwrite it.`);
        }
        saveConfig(config);
        log(`Wrote ${configPath()} with ${config.sources.length} default sources.`);
        log('Run "acs sync" to build the skill index.');
      }),
    );
}
