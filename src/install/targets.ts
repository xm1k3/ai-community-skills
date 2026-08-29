import path from "node:path";
import { homeDir } from "../paths";
import type { InstallScope, InstallTarget } from "../types";

export const INSTALL_TARGETS: InstallTarget[] = ["claude-code", "codex", "grok", "web"];

export function parseTarget(value: string): InstallTarget {
  if ((INSTALL_TARGETS as string[]).includes(value)) return value as InstallTarget;
  throw new Error(`Unknown install target "${value}". Expected one of: ${INSTALL_TARGETS.join(", ")}`);
}

export function resolveInstallPath(target: InstallTarget, scope: InstallScope | null, name: string, cwd: string): string {
  if (target === "web") return path.join(cwd, "acs-exports", `${name}.zip`);
  const folder = target === "claude-code" ? ".claude" : target === "grok" ? ".grok" : ".codex";
  const base = scope === "project" ? cwd : homeDir();
  return path.join(base, folder, "skills", name);
}

export function describeTarget(target: InstallTarget, scope: InstallScope | null): string {
  if (target === "web") return "web (zip export for claude.ai upload)";
  return `${target} (${scope ?? "personal"})`;
}
