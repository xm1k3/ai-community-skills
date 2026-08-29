# ai-community-skills

Aggregate Agent Skills (SKILL.md based) from public community git repositories into one searchable local catalog, run static risk and security analysis on every skill, and install selected skills into Claude Code, Codex CLI, or export them for claude.ai upload.

Runs with zero install through npx:

```
npx ai-community-skills init
npx ai-community-skills sync
npx ai-community-skills search "release notes"
```

The short binary alias is `acs`. After a global install (`npm install -g ai-community-skills`) or inside `npx`, every example below works with `acs` in place of `npx ai-community-skills`.

## Requirements

- Node.js 20 or newer
- git on PATH (used to clone and update sources and to read commit history)

There are no runtime npm dependencies, no postinstall scripts, and no external binaries besides git.

## How it works

1. `acs init` writes `~/.acs/config.json` with a small set of default community sources.
2. `acs sync` clones or updates every enabled source under `~/.acs/sources/<name>`, walks each tree, indexes every directory containing a SKILL.md with at least `name` and `description` in its frontmatter, runs static analysis, and rebuilds `~/.acs/index.json`.
3. `acs list`, `acs search`, `acs info`, and `acs stats` read the index.
4. `acs install` copies, symlinks, or zips a skill into the chosen target after printing a full risk summary and asking for confirmation.
5. `~/.acs/installed.json` records what was installed and with which content hash, so the next `acs sync` can warn about upstream drift.

All analysis is static. No script or code found in a skill is ever executed by this tool.

## Commands

| Command | Description |
| --- | --- |
| `acs init` | Write the default config. `--force` overwrites, `--dry-run` prints without writing. |
| `acs sync` | Clone or pull enabled sources and rebuild the index. `--source <name...>`, `--dry-run`, `--no-github`, `--verbose`, `--dedupe` (also enabled by `dedupeAfterSync: true` in config.json). |
| `acs list` | List indexed skills. Filters: `--category`, `--risk low,medium,high`, `--tool claude-code\|codex\|web`, `--source`, `--has-scripts`, `--network`, `--destructive`, `--json`. |
| `acs search <query>` | Fuzzy search over name and description. `--limit`, `--json`. |
| `acs validate [skill]` | Check frontmatter, referenced paths, and description length. Accepts a skill name or a directory path. Never modifies files. |
| `acs info <skill>` | Full metadata, risk flags, source reputation, last commit, install state. |
| `acs install <skill>` | Install with a risk summary and confirmation. `--target`, `--personal`, `--project`, `--link`, `--force`, `--yes`, `--dry-run`, `--source`. |
| `acs uninstall <skill>` | Remove an installed skill and its record. `--target`, `--yes`, `--dry-run`. |
| `acs dedupe` | Remove duplicate index entries. Duplicates are detected by a normalized content hash that ignores catalog metadata in the frontmatter (`aas-*`, `risk`, `source`, `date_added`, `tags`, `author`) and whitespace differences; the skill body, shipped files, and meaningful frontmatter fields all still count. `--dry-run`, `--yes`. |
| `acs stats` | Counts by category, source, risk level, and flag. |
| `acs export-awesome-list` | Generate `awesome-list.md` from the catalog. `--output`, `--dry-run`, `--yes`. |
| `acs ui` | Start the local web dashboard on port 8080 for browsing, auditing, and installing skills. `--port`, `--host`. |

Every command that writes to disk either has a `--dry-run` flag or asks for confirmation unless `--yes` is passed. Exit codes are non zero on any error.

When a skill name exists in more than one source, pass `--source <name>` to `info`, `install`, `validate`, or `uninstall`.

## Install targets

| Target | `--personal` (default) | `--project` |
| --- | --- | --- |
| `claude-code` | `~/.claude/skills/<name>/` | `./.claude/skills/<name>/` |
| `codex` | `~/.codex/skills/<name>/` | `./.codex/skills/<name>/` |
| `web` | `./acs-exports/<name>.zip` for manual upload to claude.ai | same |

- `--link` creates a symlink to the synced source directory instead of copying, so later `acs sync` runs propagate updates automatically. Not available for `web`.
- Installing a skill whose name conflicts with an already installed skill from a different source prints a warning and requires `--force`.
- Reinstalling an updated skill from the same source is never silent: the plan shows the old and new content hash and asks for confirmation.

## Risk and security analysis

Each indexed skill records these flags, derived from SKILL.md and every text file shipped with the skill:

| Flag | Meaning |
| --- | --- |
| `hasScripts` | Ships a `scripts/` directory, script files, or executable code blocks (bash, python, javascript, and similar) in the body. |
| `networkCalls` | References a network call such as `curl`, `wget`, `fetch(`, `requests.*`, or `axios`. Bare `http(s)://` URLs count only inside code blocks and script files, so documentation links do not trip the flag. |
| `destructiveOps` | References `rm`, `rmdir`, `mv`, `DROP TABLE`, `delete`, `shred`, forced git pushes, or forced resets. Method calls like `map.delete(key)` are not counted. |
| `confirmsBeforeDestructive` | Every block containing a destructive operation also contains a confirmation pattern (`confirm`, `are you sure`, `read -p`, `[y/N]`, `ask the user`, `rm -i`, and similar). Blocks are fenced code blocks, script files, or markdown sections. |
| `claudeCodeOnly` | Uses Claude Code specific frontmatter fields such as `allowed-tools`, `context`, `hooks`, `model`. |
| `promptInjectionSuspected` | Contains instructions to ignore previous instructions, act outside the stated scope, or hide actions from the user. |
| `secretReferences` | Reads non trivial environment variables (`process.env`, `os.environ`, `$MY_TOKEN`), sets Authorization headers, contains key-like literals, private keys, credential files (`.env`, `~/.ssh`, `~/.aws`), or a base64 decode piped into a shell. Generic words such as `API key`, `password`, `credentials`, or `secret` count only inside code blocks and script files, not in prose. |

`riskLevel` is derived as:

- `high`: a destructive operation without a paired confirmation, or `promptInjectionSuspected`, or a secret reference inside a code block or script file
- `medium`: a destructive operation with confirmation, a network call, or a secret reference that only appears in prose
- `low`: none of the above

Source reputation is recorded per source from git history and, when reachable, the GitHub API: star count, date of the last commit, whether the repository has a single contributor, and whether a CI workflow is configured. Set `GITHUB_TOKEN` to raise the GitHub API rate limit, or pass `--no-github` to skip it.

These heuristics are intentionally conservative and produce false positives. Treat a risk level as a prompt to read the skill, not as a verdict.

## Drift detection

On every `acs sync`, the content hash of each indexed skill is compared with the hash recorded in `installed.json` at install time. When they differ, a warning names the skill, the installed hash, the new hash, the commit change, and any risk flag that changed. Installed copies are never updated automatically. Skills installed with `--link` already point at the updated source, and the warning says so.

## Local data

```
~/.acs/
  config.json       sources, their trust levels, and options
  index.json        one entry per indexed skill
  installed.json    install records with content hashes
  collections.json  favorites and groups
  sources/<name>/   git clones of each source
```

Set `ACS_HOME` to use a different data directory.

## Config

```json
{
  "sources": [
    { "name": "anthropic-skills", "repo": "https://github.com/anthropics/skills", "enabled": true, "trust": 100 }
  ]
}
```

`repo` accepts https URLs, `owner/name` GitHub shorthand, ssh URLs, or local `file://` URLs. `trust` (0-100, default 50) says how much you trust the repository: when the same skill exists in more than one source, dedupe keeps the copy from the most trusted one, then falls back to config order and the shortest path.

## Web dashboard

`acs ui` starts a local HTTP server bound to 127.0.0.1 on port 8080 (a free port is used when 8080 is busy, pass `--port` to choose one) and serves a Vue 3 and PrimeVue dashboard bundled with the package: sidebar navigation, light and dark themes, charts on the dashboard, and GitHub-style file browsing on skill pages. No external assets are loaded at runtime and the server only accepts same-origin requests.

Pages:

| Route | Content |
| --- | --- |
| `/` | Dashboard: index size, installed skills with available updates, library and duplicate counts, browse-by-tag chips, risk distribution, finding counts, top categories, top authors ranked by a per-skill quality score, recently updated skills. |
| `/browse` | Full index with search, risk, source, category, tag, path prefix, and finding filters, sorting, and pagination (25/50/100 per page). Rows can be multi-selected for bulk install, bulk favorite, or adding to a group. Duplicate copies of a skill (same normalized content) are collapsed into one row. Every filter lives in the URL, so a filtered view can be bookmarked or shared. |
| `/skill/<source>/<path>` | Skill detail with clickable breadcrumbs that collapse when space runs out. Tabs: Overview (SKILL.md rendered as markdown with syntax-highlighted code blocks), Files (folder tree with a Preview/Code toggle for markdown), Details (search score breakdown, risk reasons, validation issues, source reputation, upstream metadata, installed copies), Findings (every risk finding sorted by severity, filterable by category, with a clickable `file:line` that opens the file at the highlighted line), and Frontmatter. Add `?q=<query>` to keep the score explanation. |
| `/favorites` | Skills marked with the heart. |
| `/groups` | Named lists of skills that can be installed together, exported as JSON, and imported on another machine. Stored in `~/.acs/collections.json`. |
| `/installed` | Everything installed through acs with target, scope, path, and upstream drift. Uninstall asks for confirmation before removing anything. |
| `/sources` | Add, edit, enable, disable, delete, and sync sources, and set a trust level per source. Adding writes `config.json`; deleting also drops the source's index entries and cloned repository after confirmation. |
| `/settings` | Run a sync (as a separate process, log streamed to the page), preview and remove duplicate index entries, and toggle automatic dedupe after every sync (`dedupeAfterSync` in `config.json`). |

Links to skills are stable as long as the server runs on the same port. Use the Copy link button on a skill page to share a specific skill and its findings.

Installing from the UI reuses the same plan, risk summary, warning, and confirmation flow as the CLI: the dialog first previews the plan, then asks for confirmation before writing anything. Search uses the same keyword matching as `acs search`.

Every finding shown in the UI comes from static pattern matching, so the detail page exists to let you judge false positives: a match in prose is far less meaningful than a match in a code block or a shipped script, and the excerpt plus the highlighted line makes that visible.

## Development

```
npm install
npm run typecheck
npm test
npm run build
node dist/cli.js --help
```

`npm run build` runs tsup for the CLI and Vite for the dashboard, producing `dist/cli.js` and `dist/ui/`. The CLI is a single bundled file with no runtime dependencies; Vue, PrimeVue, and Vite are development dependencies only. Unit tests cover the risk analysis engine, the frontmatter parser, the index builder, and search.

To work on the dashboard with hot reload, start the API with `node dist/cli.js ui` in one terminal and `npm run dev:ui` in another. The Vite dev server on port 5173 proxies `/api` to port 8080 (set `ACS_UI_PORT` if the API runs elsewhere). The dashboard sources live in `ui/`.

## License

MIT
