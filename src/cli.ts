import { Command } from "commander";
import { registerDedupe } from "./commands/dedupe";
import { registerExportAwesomeList } from "./commands/exportAwesome";
import { registerInfo } from "./commands/info";
import { registerInit } from "./commands/init";
import { registerInstall } from "./commands/install";
import { registerList } from "./commands/list";
import { registerSearch } from "./commands/search";
import { registerStats } from "./commands/stats";
import { registerSync } from "./commands/sync";
import { registerUi } from "./commands/ui";
import { registerUninstall } from "./commands/uninstall";
import { registerValidate } from "./commands/validate";
import { fail } from "./output";
import { printUpdateNotice, UpdateChecker } from "./update";
import { currentVersion } from "./version";

const version = currentVersion();
const updates = new UpdateChecker(version);
updates.start();

const program = new Command();
program
  .name("acs")
  .description("Aggregate, analyze, and install community Agent Skills from public git repositories")
  .version(version, "-v, --version")
  .showHelpAfterError('(use "acs --help" for the list of commands)')
  .configureOutput({ writeErr: (text) => process.stderr.write(text) });

registerInit(program);
registerSync(program);
registerList(program);
registerSearch(program);
registerValidate(program);
registerInfo(program);
registerInstall(program);
registerUninstall(program);
registerDedupe(program);
registerStats(program);
registerExportAwesomeList(program);
registerUi(program);

program
  .parseAsync(process.argv)
  .then(async () => {
    printUpdateNotice(await updates.result());
  })
  .catch((error: unknown) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
