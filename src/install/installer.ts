import fs from "node:fs";
import path from "node:path";
import { riskReasons } from "../analysis/risk";
import { shortHash } from "../hash";
import { sourceDir } from "../paths";
import { loadInstalled, saveInstalled } from "../store";
import type { InstalledRecord, InstalledState, InstallScope, InstallTarget, SkillEntry } from "../types";
import { describeTarget, resolveInstallPath } from "./targets";
import { createZip } from "./zip";

export interface InstallRequest {
  entry: SkillEntry;
  target: InstallTarget;
  scope: InstallScope | null;
  link: boolean;
  force: boolean;
  cwd: string;
}

export interface InstallPlan extends InstallRequest {
  sourcePath: string;
  destination: string;
  existing: InstalledRecord | null;
  conflict: InstalledRecord | null;
  destinationExists: boolean;
  warnings: string[];
  blockers: string[];
}

export function riskSummaryLines(entry: SkillEntry): string[] {
  const lines = [
    `Risk level: ${entry.riskLevel}`,
    `Has scripts: ${entry.hasScripts ? "yes" : "no"}`,
    `Network calls: ${entry.networkCalls ? "yes" : "no"}`,
    `Destructive operations: ${entry.destructiveOps ? "yes" : "no"}`,
    `Confirms before destructive: ${entry.destructiveOps ? (entry.confirmsBeforeDestructive ? "yes" : "no") : "n/a"}`,
    `Claude Code only: ${entry.claudeCodeOnly ? "yes" : "no"}`,
    `Prompt injection suspected: ${entry.promptInjectionSuspected ? "yes" : "no"}`,
    `Secret references: ${entry.secretReferences ? "yes" : "no"}`,
    `Source stars: ${entry.sourceReputation.stars}`,
    `Source last activity: ${entry.sourceReputation.lastActivityDate || "unknown"}`,
    `Single maintainer: ${entry.sourceReputation.singleMaintainer ? "yes" : "no"}`,
    `CI configured: ${entry.sourceReputation.hasCi ? "yes" : "no"}`,
    `Content hash: ${shortHash(entry.contentHash)}`,
  ];
  const reasons = riskReasons(entry);
  if (reasons.length > 0) lines.push(`Reasons: ${reasons.join("; ")}`);
  return lines;
}

function sameLocation(record: InstalledRecord, request: InstallRequest, destination: string): boolean {
  return record.target === request.target && path.resolve(record.installPath) === path.resolve(destination);
}

export function planInstall(request: InstallRequest, state: InstalledState = loadInstalled()): InstallPlan {
  const { entry } = request;
  const scope = request.target === "web" ? null : request.scope ?? "personal";
  const destination = resolveInstallPath(request.target, scope, entry.name, request.cwd);
  const sourcePath = path.join(sourceDir(entry.source), entry.path);
  const warnings: string[] = [];
  const blockers: string[] = [];

  if (!fs.existsSync(path.join(sourcePath, "SKILL.md"))) {
    blockers.push(`Skill files not found at ${sourcePath}. Run "acs sync" first.`);
  }
  if (request.link && request.target === "web") {
    blockers.push("--link cannot be combined with the web target");
  }

  const existing = state.installed.find((record) => record.name === entry.name && record.source === entry.source && sameLocation(record, request, destination)) ?? null;
  const conflict = state.installed.find((record) => record.name === entry.name && record.source !== entry.source && sameLocation(record, request, destination)) ?? null;
  const destinationExists = fs.existsSync(destination) || isDanglingSymlink(destination);

  if (conflict) {
    const message = `A skill named "${entry.name}" from source "${conflict.source}" is already installed at ${destination}`;
    if (request.force) warnings.push(`${message}. It will be replaced because --force was passed.`);
    else blockers.push(`${message}. Pass --force to replace it.`);
  }
  if (existing) {
    if (existing.contentHash !== entry.contentHash) {
      warnings.push(`Installed version ${shortHash(existing.contentHash)} will be replaced by ${shortHash(entry.contentHash)}.`);
    } else {
      warnings.push("The same content hash is already installed. Reinstalling will overwrite the existing files.");
    }
  } else if (destinationExists && !conflict) {
    const message = `${destination} already exists and is not tracked by acs`;
    if (request.force) warnings.push(`${message}. It will be replaced because --force was passed.`);
    else blockers.push(`${message}. Pass --force to replace it.`);
  }
  if (entry.claudeCodeOnly && request.target !== "claude-code") {
    warnings.push("This skill uses Claude Code specific frontmatter fields that other tools may ignore.");
  }
  if (entry.riskLevel === "high") {
    warnings.push("This skill is rated high risk. Review its contents before installing.");
  }
  if (entry.setup) {
    warnings.push(`The source repository declares manual setup (${entry.setup.type})${entry.setup.summary ? `: ${entry.setup.summary}` : ". See SKILL.md."}`);
  }

  return { ...request, scope, sourcePath, destination, existing, conflict, destinationExists, warnings, blockers };
}

function isDanglingSymlink(target: string): boolean {
  try {
    fs.lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

function removePath(target: string): void {
  try {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || stat.isFile()) fs.unlinkSync(target);
    else fs.rmSync(target, { recursive: true, force: true });
  } catch {
    return;
  }
}

function listFilesRecursive(dir: string, relative = ""): { relativePath: string; absolutePath: string }[] {
  const output: { relativePath: string; absolutePath: string }[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === ".git") continue;
    const relativePath = relative === "" ? entry.name : `${relative}/${entry.name}`;
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...listFilesRecursive(absolutePath, relativePath));
    else if (entry.isFile()) output.push({ relativePath, absolutePath });
  }
  return output;
}

export function describePlan(plan: InstallPlan): string[] {
  const lines = [
    `Skill: ${plan.entry.name}`,
    `Source: ${plan.entry.source} (${plan.entry.repository})`,
    `Path in source: ${plan.entry.path || "."}`,
    `Target: ${describeTarget(plan.target, plan.scope)}`,
    `Mode: ${plan.target === "web" ? "zip archive" : plan.link ? "symlink" : "copy"}`,
    `Destination: ${plan.destination}`,
  ];
  return lines;
}

export function executeInstall(plan: InstallPlan, state: InstalledState = loadInstalled()): InstalledRecord {
  if (plan.blockers.length > 0) throw new Error(plan.blockers.join("\n"));
  if (plan.target === "web") {
    const files = listFilesRecursive(plan.sourcePath).map((file) => ({
      name: `${plan.entry.name}/${file.relativePath}`,
      data: fs.readFileSync(file.absolutePath),
      mtime: fs.statSync(file.absolutePath).mtime,
    }));
    fs.mkdirSync(path.dirname(plan.destination), { recursive: true });
    fs.writeFileSync(plan.destination, createZip(files));
  } else {
    fs.mkdirSync(path.dirname(plan.destination), { recursive: true });
    removePath(plan.destination);
    if (plan.link) {
      fs.symlinkSync(plan.sourcePath, plan.destination, "dir");
    } else {
      fs.cpSync(plan.sourcePath, plan.destination, {
        recursive: true,
        dereference: true,
        filter: (source) => path.basename(source) !== ".git",
      });
    }
  }
  const record: InstalledRecord = {
    name: plan.entry.name,
    source: plan.entry.source,
    path: plan.entry.path,
    target: plan.target,
    scope: plan.scope,
    installPath: plan.destination,
    contentHash: plan.entry.contentHash,
    link: plan.link && plan.target !== "web",
    installedAt: new Date().toISOString(),
  };
  const remaining = state.installed.filter(
    (item) => !(item.name === record.name && item.target === record.target && path.resolve(item.installPath) === path.resolve(record.installPath)),
  );
  saveInstalled({ installed: [...remaining, record] });
  return record;
}

export function removeInstalled(record: InstalledRecord, state: InstalledState = loadInstalled()): void {
  removePath(record.installPath);
  const remaining = state.installed.filter((item) => item !== record && !(item.name === record.name && item.target === record.target && path.resolve(item.installPath) === path.resolve(record.installPath)));
  saveInstalled({ installed: remaining });
}
