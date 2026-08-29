import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter, stringField } from "../frontmatter";
import { hashFileSet } from "../hash";
import type { ScannedSkill, SkillFile } from "../types";

const SKIP_DIRECTORIES = new Set([".git", "node_modules", ".acs", ".venv", "venv", "__pycache__", "dist", "build", ".next", ".cache"]);

const GENERIC_SEGMENTS = new Set([
  "skills",
  "skill",
  ".claude",
  ".codex",
  ".agents",
  "src",
  "packages",
  "plugins",
  "plugin",
  "community",
  "examples",
  "agents",
  "agent-skills",
  "claude",
  "codex",
  "library",
  "catalog",
  "collection",
  "content",
  "public",
]);

const MAX_TEXT_BYTES = 256 * 1024;

export interface InvalidSkill {
  path: string;
  reason: string;
}

export interface ScanResult {
  skills: ScannedSkill[];
  invalid: InvalidSkill[];
}

function isProbablyText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  for (const byte of sample) if (byte === 0) return false;
  return true;
}

function listFiles(dir: string, relative = ""): { relativePath: string; absolutePath: string }[] {
  const output: { relativePath: string; absolutePath: string }[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return output;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const relativePath = relative === "" ? entry.name : `${relative}/${entry.name}`;
    const absolutePath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      output.push(...listFiles(absolutePath, relativePath));
    } else if (entry.isFile()) {
      output.push({ relativePath, absolutePath });
    }
  }
  return output;
}

export function readSkillFiles(dir: string): { files: SkillFile[]; contentHash: string } {
  const hashed: { relativePath: string; content: Buffer }[] = [];
  const files: SkillFile[] = [];
  for (const file of listFiles(dir)) {
    const content = fs.readFileSync(file.absolutePath);
    hashed.push({ relativePath: file.relativePath, content });
    if (content.length <= MAX_TEXT_BYTES && isProbablyText(content)) {
      files.push({ relativePath: file.relativePath, content: content.toString("utf8") });
    }
  }
  return { files, contentHash: hashFileSet(hashed) };
}

export function deriveCategory(frontmatter: Record<string, unknown>, relativePath: string): string {
  const explicit = stringField(frontmatter, "category");
  if (explicit) return explicit.toLowerCase().replace(/\s+/g, "-");
  const segments = relativePath.split("/").filter((segment) => segment !== "");
  segments.pop();
  const meaningful: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i].toLowerCase();
    const previous = i > 0 ? segments[i - 1].toLowerCase() : "";
    if (GENERIC_SEGMENTS.has(segment)) continue;
    if (previous === "plugins" || previous === "plugin" || previous === "packages") continue;
    if (/(^|[-_])skills?([-_]|$)/.test(segment)) continue;
    if (/^v?\d+(\.\d+)*$/.test(segment)) continue;
    meaningful.push(segment);
  }
  if (meaningful.length === 0) return "general";
  return meaningful[meaningful.length - 1];
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function loadSkillDirectory(dir: string, relativePath: string): ScannedSkill | InvalidSkill {
  const skillFile = path.join(dir, "SKILL.md");
  let raw: string;
  try {
    raw = fs.readFileSync(skillFile, "utf8");
  } catch {
    return { path: relativePath, reason: "SKILL.md could not be read" };
  }
  const parsed = parseFrontmatter(raw);
  if (!parsed) return { path: relativePath, reason: "SKILL.md has no YAML frontmatter" };
  const name = stringField(parsed.data, "name");
  const description = stringField(parsed.data, "description");
  if (!name) return { path: relativePath, reason: "frontmatter is missing a name" };
  if (!description) return { path: relativePath, reason: "frontmatter is missing a description" };
  const { files, contentHash } = readSkillFiles(dir);
  return {
    name,
    description,
    frontmatter: parsed.data,
    body: parsed.body,
    dir,
    relativePath,
    files,
    category: deriveCategory(parsed.data, relativePath),
    lines: raw.split(/\r?\n/).length,
    tokenEstimate: estimateTokens(raw),
    contentHash,
  };
}

export function scanSkillTree(rootDir: string): ScanResult {
  const result: ScanResult = { skills: [], invalid: [] };
  const walk = (dir: string, relative: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
      const loaded = loadSkillDirectory(dir, relative);
      if ("reason" in loaded) result.invalid.push(loaded);
      else result.skills.push(loaded);
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      walk(path.join(dir, entry.name), relative === "" ? entry.name : `${relative}/${entry.name}`);
    }
  };
  walk(rootDir, "");
  return result;
}
