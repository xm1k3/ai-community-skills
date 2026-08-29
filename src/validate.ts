import fs from "node:fs";
import path from "node:path";
import { CLAUDE_CODE_FIELDS } from "./analysis/risk";
import type { ScannedSkill } from "./types";

export interface ValidationReport {
  errors: string[];
  warnings: string[];
}

const KNOWN_FIELDS = new Set([
  "name",
  "description",
  "category",
  "license",
  "version",
  "author",
  "tags",
  "metadata",
  "compatibility",
  ...CLAUDE_CODE_FIELDS,
]);

const MAX_DESCRIPTION = 1024;
const MIN_DESCRIPTION = 20;
const MAX_NAME = 64;
const MAX_LINES = 500;

const RELATIVE_PATH_REFERENCE = /(?:^|[\s(`"'])(\.{0,2}\/)?((?:scripts|references|reference|assets|templates|examples|docs|resources|lib|src|bin)\/[A-Za-z0-9_./-]+)/g;
const MARKDOWN_LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;

function referencedPaths(body: string): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  RELATIVE_PATH_REFERENCE.lastIndex = 0;
  while ((match = RELATIVE_PATH_REFERENCE.exec(body)) !== null) {
    found.add(match[2].replace(/[.,:;)]+$/, ""));
  }
  MARKDOWN_LINK.lastIndex = 0;
  while ((match = MARKDOWN_LINK.exec(body)) !== null) {
    const target = match[1];
    if (/^(https?:|mailto:|#|\/)/i.test(target)) continue;
    found.add(target.replace(/^\.\//, "").split("#")[0]);
  }
  return [...found].filter((candidate) => candidate !== "" && !candidate.includes("*") && !candidate.includes("<"));
}

export function validateSkill(skill: ScannedSkill): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const name = skill.name;
  const description = skill.description;

  if (!name) errors.push("frontmatter field \"name\" is required");
  if (!description) errors.push("frontmatter field \"description\" is required");

  if (name) {
    if (name.length > MAX_NAME) errors.push(`name is ${name.length} characters, maximum is ${MAX_NAME}`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
      warnings.push("name should use lowercase letters, digits, and single hyphens only");
    }
    const directoryName = path.basename(skill.dir);
    if (skill.relativePath !== "" && directoryName !== name) {
      warnings.push(`name "${name}" does not match directory name "${directoryName}"`);
    }
  }

  if (description) {
    if (description.length > MAX_DESCRIPTION) {
      errors.push(`description is ${description.length} characters, maximum is ${MAX_DESCRIPTION}`);
    } else if (description.length < MIN_DESCRIPTION) {
      warnings.push(`description is only ${description.length} characters, consider describing what the skill does and when to use it`);
    }
    if (!/\b(use|when|for|helps?|use this)\b/i.test(description)) {
      warnings.push("description does not explain when the skill should be used");
    }
  }

  for (const key of Object.keys(skill.frontmatter)) {
    if (!KNOWN_FIELDS.has(key)) warnings.push(`unknown frontmatter field "${key}"`);
  }

  if (skill.body.trim() === "") errors.push("SKILL.md body is empty");
  if (skill.lines > MAX_LINES) warnings.push(`SKILL.md is ${skill.lines} lines, consider moving detail into reference files`);

  for (const reference of referencedPaths(skill.body)) {
    const target = path.resolve(skill.dir, reference);
    if (!target.startsWith(path.resolve(skill.dir))) {
      warnings.push(`reference "${reference}" points outside the skill directory`);
      continue;
    }
    if (!fs.existsSync(target)) errors.push(`referenced path "${reference}" does not exist`);
  }

  return { errors, warnings };
}
