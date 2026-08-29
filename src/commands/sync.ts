import type { Command } from "commander";
import { createEmbeddingProvider, syncEmbeddings } from "../embeddings";
import { cloneOrPull, contributorCount, ensureGitAvailable, hasCiWorkflow, lastCommitForPath, repositoryLastActivity } from "../git";
import { cloneUrl, fetchGithubRepoInfo, normalizeRepoUrl } from "../github";
import { shortHash } from "../hash";
import { buildSourceIndex, dedupeIndex, mergeIndex } from "../index/builder";
import { log, warn } from "../output";
import { sourceDir } from "../paths";
import { loadConfig, loadEmbeddings, loadIndex, loadInstalled, saveEmbeddings, saveIndex } from "../store";
import type { InstalledRecord, SkillEntry, SourceConfig, SourceReputation } from "../types";
import { run } from "./common";

interface SyncOptions {
  dryRun: boolean;
  source?: string[];
  github: boolean;
  embeddings: boolean;
  verbose: boolean;
  dedupe?: boolean;
}

const RISK_FIELDS: (keyof SkillEntry)[] = [
  "riskLevel",
  "hasScripts",
  "networkCalls",
  "destructiveOps",
  "confirmsBeforeDestructive",
  "claudeCodeOnly",
  "promptInjectionSuspected",
  "secretReferences",
];

async function computeReputation(source: SourceConfig, dir: string, useGithub: boolean): Promise<SourceReputation> {
  const github = useGithub ? await fetchGithubRepoInfo(source.repo) : null;
  const contributors = contributorCount(dir);
  return {
    stars: github?.stars ?? 0,
    lastActivityDate: repositoryLastActivity(dir) || github?.pushedAt || "",
    singleMaintainer: contributors <= 1,
    hasCi: hasCiWorkflow(dir),
  };
}

export function describeDrift(record: InstalledRecord, previous: SkillEntry | undefined, current: SkillEntry): string[] {
  const lines = [
    `Drift detected for "${record.name}" from source "${record.source}" installed at ${record.installPath}`,
    `  installed hash: ${record.contentHash}`,
    `  current hash:   ${current.contentHash}`,
  ];
  if (previous && previous.lastCommitHash !== current.lastCommitHash) {
    lines.push(`  commit: ${shortHash(previous.lastCommitHash) || "unknown"} -> ${shortHash(current.lastCommitHash) || "unknown"} (${current.lastCommitDate || "unknown date"})`);
  } else if (current.lastCommitHash) {
    lines.push(`  commit: ${shortHash(current.lastCommitHash)} (${current.lastCommitDate || "unknown date"})`);
  }
  if (previous) {
    const changedFlags = RISK_FIELDS.filter((field) => previous[field] !== current[field]).map(
      (field) => `${field}: ${String(previous[field])} -> ${String(current[field])}`,
    );
    if (changedFlags.length > 0) lines.push(`  risk changes: ${changedFlags.join(", ")}`);
    if (previous.description !== current.description) lines.push("  description changed");
    if (previous.lines !== current.lines) lines.push(`  SKILL.md lines: ${previous.lines} -> ${current.lines}`);
  }
  if (record.link) {
    lines.push("  installed as a symlink, the new content is already active at the install path");
  } else {
    lines.push(`  the installed copy was not modified, review with "acs info ${record.name} --source ${record.source}" before running "acs install ${record.name} --source ${record.source} --target ${record.target}"`);
  }
  return lines;
}

export function registerSync(program: Command): void {
  program
    .command("sync")
    .description("Clone or update every enabled source and rebuild the skill index")
    .option("--dry-run", "show what would be synced without touching the disk", false)
    .option("--source <name...>", "only sync the named sources")
    .option("--no-github", "skip GitHub API lookups for star counts")
    .option("--no-embeddings", "skip embedding computation even if a provider is configured")
    .option("--verbose", "print skipped directories and other details", false)
    .option("--dedupe", "remove duplicate skills after rebuilding the index, also enabled by dedupeAfterSync in config.json")
    .action(
      run(async (options: SyncOptions) => {
        const config = loadConfig();
        const selected = config.sources.filter((source) => source.enabled && (!options.source || options.source.includes(source.name)));
        if (options.source) {
          for (const name of options.source) {
            if (!config.sources.some((source) => source.name === name)) throw new Error(`Unknown source "${name}"`);
          }
        }
        if (selected.length === 0) throw new Error("No enabled sources to sync. Edit config.json to add or enable sources.");

        if (options.dryRun) {
          log("Dry run, nothing will be written.");
          for (const source of selected) log(`  ${source.name}: ${source.repo} -> ${sourceDir(source.name)}`);
          log(`Would rebuild the index for ${selected.length} source(s).`);
          return;
        }

        ensureGitAvailable();
        const previousIndex = loadIndex();
        const previousByKey = new Map(previousIndex.map((entry) => [`${entry.source}/${entry.name}`, entry]));
        const fresh: SkillEntry[] = [];
        const refreshed: string[] = [];
        let failures = 0;

        for (const source of selected) {
          const dir = sourceDir(source.name);
          process.stdout.write(`Syncing ${source.name} (${source.repo}) ... `);
          try {
            const action = cloneOrPull(cloneUrl(source.repo), dir);
            const reputation = await computeReputation(source, dir, options.github);
            const result = buildSourceIndex(dir, {
              source: source.name,
              repository: normalizeRepoUrl(source.repo),
              reputation,
              commitLookup: (relativePath) => lastCommitForPath(dir, relativePath),
            });
            fresh.push(...result.entries);
            refreshed.push(source.name);
            log(`${action}, ${result.entries.length} skills indexed, ${result.invalid.length} skipped`);
            if (options.verbose) {
              for (const invalid of result.invalid) log(`  skipped ${invalid.path || "."}: ${invalid.reason}`);
            }
          } catch (error) {
            failures++;
            log("failed");
            warn(error instanceof Error ? error.message : String(error));
          }
        }

        const disabled = config.sources.filter((source) => !source.enabled).map((source) => source.name);
        let index = mergeIndex(previousIndex, [...refreshed, ...disabled], fresh);
        if (options.dedupe || (options.dedupe !== false && config.dedupeAfterSync)) {
          const result = dedupeIndex(index, config.sources);
          if (result.removed.length > 0) log(`Removed ${result.removed.length} duplicate skill(s) in ${result.groups.length} group(s).`);
          index = result.kept;
        }
        saveIndex(index);
        log(`Index rebuilt with ${index.length} skills from ${new Set(index.map((entry) => entry.source)).size} source(s).`);

        const installed = loadInstalled();
        const currentByKey = new Map<string, SkillEntry[]>();
        for (const entry of index) {
          const key = `${entry.source}/${entry.name}`;
          currentByKey.set(key, [...(currentByKey.get(key) ?? []), entry]);
        }
        let drifted = 0;
        for (const record of installed.installed) {
          const key = `${record.source}/${record.name}`;
          const matches = (currentByKey.get(key) ?? []).filter((entry) => record.path === undefined || entry.path === record.path);
          if (matches.length === 0) {
            if (refreshed.includes(record.source)) warn(`Installed skill "${record.name}" from "${record.source}" is no longer present in the source.`);
            continue;
          }
          if (!matches.some((entry) => entry.contentHash === record.contentHash)) {
            drifted++;
            log("");
            const [headline, ...details] = describeDrift(record, previousByKey.get(key), matches[0]);
            warn(headline);
            for (const line of details) process.stderr.write(`${line}\n`);
          }
        }
        if (drifted > 0) {
          log("");
          warn(`${drifted} installed skill(s) changed upstream. Installed copies are never updated automatically, review them before reinstalling.`);
        }

        if (options.embeddings) {
          const provider = createEmbeddingProvider(config.embedding);
          if (provider) {
            process.stdout.write(`Computing embeddings with ${provider.name} (${provider.model}) ... `);
            const result = await syncEmbeddings(index, provider, loadEmbeddings());
            saveEmbeddings(result.embeddings);
            log(`${result.computed} computed, ${result.reused} reused, ${result.removed} removed`);
          } else if (options.verbose) {
            log('No embedding provider configured, skipping embeddings. Configure "embedding" in config.json to enable "acs ui".');
          }
        }

        if (failures > 0) throw new Error(`${failures} source(s) failed to sync.`);
      }),
    );
}
