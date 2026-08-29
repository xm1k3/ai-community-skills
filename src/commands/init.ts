import type { Command } from "commander";
import bundledConfig from "../../config.json";
import { log, warn } from "../output";
import { configPath } from "../paths";
import { configExists, parseConfigData, saveConfig } from "../store";
import type { Config } from "../types";
import { run } from "./common";

export const CURATED_CONFIG_URL = "https://raw.githubusercontent.com/xm1k3/ai-community-skills/main/config.json";
const FETCH_TIMEOUT_MS = 6000;

export function bundledDefaultConfig(): Config {
  return parseConfigData(bundledConfig);
}

export async function fetchCuratedConfig(url = CURATED_CONFIG_URL, timeoutMs = FETCH_TIMEOUT_MS): Promise<Config> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const config = parseConfigData(await response.json());
    if (config.sources.length === 0) throw new Error("the curated config lists no sources");
    return config;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveInitialConfig(offline: boolean): Promise<{ config: Config; origin: "remote" | "bundled"; reason?: string }> {
  if (offline) return { config: bundledDefaultConfig(), origin: "bundled" };
  try {
    return { config: await fetchCuratedConfig(), origin: "remote" };
  } catch (error) {
    return { config: bundledDefaultConfig(), origin: "bundled", reason: error instanceof Error ? error.message : String(error) };
  }
}

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Write config.json with the curated list of community sources")
    .option("--force", "overwrite an existing config.json", false)
    .option("--dry-run", "print the config that would be written without writing it", false)
    .option("--offline", "skip the download and use the sources bundled with this version", false)
    .action(
      run(async (options: { force: boolean; dryRun: boolean; offline: boolean }) => {
        if (configExists() && !options.force && !options.dryRun) {
          throw new Error(`${configPath()} already exists. Pass --force to overwrite it.`);
        }
        const { config, origin, reason } = await resolveInitialConfig(options.offline);
        if (origin === "remote") log(`Downloaded the curated source list from ${CURATED_CONFIG_URL}`);
        else if (reason) warn(`Could not download the curated source list (${reason}), using the sources bundled with this version.`);
        else log("Using the sources bundled with this version.");
        if (options.dryRun) {
          log(`Would write ${configPath()}:`);
          log(JSON.stringify(config, null, 2));
          return;
        }
        saveConfig(config);
        log(`Wrote ${configPath()} with ${config.sources.length} sources.`);
        log('Run "acs sync" to build the skill index.');
      }),
    );
}
