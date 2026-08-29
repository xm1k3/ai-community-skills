import { createHash } from "node:crypto";
import { CLAUDE_CODE_FIELDS } from "../analysis/risk";
import type { ScannedSkill } from "../types";

const MEANINGFUL_FRONTMATTER = new Set(["name", "description", "license", "version", "compatibility", ...CLAUDE_CODE_FIELDS]);

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

export function canonicalFrontmatter(frontmatter: Record<string, unknown>): string {
  const kept = Object.entries(frontmatter)
    .filter(([key]) => MEANINGFUL_FRONTMATTER.has(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => [key, canonicalValue(value)]);
  return JSON.stringify(kept);
}

export function normalizedSkillHash(skill: Pick<ScannedSkill, "frontmatter" | "body" | "files">): string {
  const hash = createHash("sha256");
  hash.update(canonicalFrontmatter(skill.frontmatter));
  hash.update("\0");
  hash.update(normalizeText(skill.body));
  hash.update("\0");
  const others = skill.files
    .filter((file) => file.relativePath.replace(/\\/g, "/") !== "SKILL.md")
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  for (const file of others) {
    hash.update(file.relativePath.replace(/\\/g, "/"));
    hash.update("\0");
    hash.update(normalizeText(file.content));
    hash.update("\0");
  }
  return hash.digest("hex");
}
