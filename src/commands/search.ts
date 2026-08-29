import type { Command } from "commander";
import { formatTable, log, terminalWidth, truncate } from "../output";
import { searchSkills } from "../search";
import { requireIndex } from "../store";
import { FLAG_LEGEND, flagCodes, run } from "./common";

export function registerSearch(program: Command): void {
  program
    .command("search <query>")
    .description("Fuzzy search skills by name and description")
    .option("--limit <count>", "maximum number of results", "25")
    .option("--json", "print JSON instead of a table", false)
    .action(
      run(async (query: string, options: { limit: string; json: boolean }) => {
        const limit = Number.parseInt(options.limit, 10);
        if (!Number.isFinite(limit) || limit <= 0) throw new Error("--limit must be a positive integer");
        const hits = searchSkills(requireIndex(), query, limit);
        if (options.json) {
          log(JSON.stringify(hits.map((hit) => ({ score: Number(hit.score.toFixed(3)), ...hit.entry })), null, 2));
          return;
        }
        if (hits.length === 0) {
          log(`No skills match "${query}".`);
          return;
        }
        const descriptionWidth = Math.max(24, terminalWidth() - 70);
        const rows = hits.map((hit) => [
          hit.score.toFixed(2),
          hit.entry.name,
          hit.entry.source,
          hit.entry.riskLevel,
          flagCodes(hit.entry),
          truncate(hit.entry.description, descriptionWidth),
        ]);
        log(formatTable(["SCORE", "NAME", "SOURCE", "RISK", "FLAGS", "DESCRIPTION"], rows));
        log("");
        log(`${hits.length} result(s). ${FLAG_LEGEND}`);
      }),
    );
}
