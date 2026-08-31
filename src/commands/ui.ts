import type { Command } from "commander";
import { log, warn } from "../output";
import { startUiServer } from "../ui/server";
import { printUpdateNotice, UI_CHECK_INTERVAL_MS, UpdateChecker } from "../update";
import { run } from "./common";

export const DEFAULT_UI_PORT = 8080;

export function registerUi(program: Command): void {
  program
    .command("ui")
    .description("Start the local web dashboard for browsing, auditing, and installing skills")
    .option("--port <port>", "port to listen on, falls back to a free port when busy", String(DEFAULT_UI_PORT))
    .option("--host <host>", "host to bind", "127.0.0.1")
    .action(
      run(async (options: { port: string; host: string }) => {
        const port = Number.parseInt(options.port, 10);
        if (!Number.isFinite(port) || port < 0 || port > 65535) throw new Error("--port must be a number between 0 and 65535");
        const { server, url, mode, fallbackPort } = await startUiServer({ host: options.host, port, cwd: process.cwd() });
        if (fallbackPort) warn(`Port ${port} is in use, using a free port instead.`);
        log(`acs ui is listening on ${url}`);
        if (mode === "lexical") {
          log('No embedding provider configured: using keyword search. Configure "embedding" in config.json and run "acs sync" for semantic search.');
        } else {
          log("Semantic search enabled.");
        }
        log("Project scope installs and web exports use the current directory.");
        log("Press Ctrl+C to stop.");
        printUpdateNotice(await new UpdateChecker(undefined, process.env, UI_CHECK_INTERVAL_MS).result());
        const shutdown = () => {
          server.close(() => process.exit(0));
        };
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
        await new Promise<void>(() => undefined);
      }),
    );
}
