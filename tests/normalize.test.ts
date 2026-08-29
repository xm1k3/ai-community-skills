import { describe, expect, it } from "vitest";
import { dedupeIndex } from "../src/index/builder";
import { normalizedSkillHash } from "../src/index/normalize";
import type { SkillEntry } from "../src/types";

const body = "# Golang\n\nWrite idiomatic Go.\n";

describe("normalizedSkillHash", () => {
  it("ignores catalog metadata differences in the frontmatter", () => {
    const nested = normalizedSkillHash({
      frontmatter: { name: "golang-pro", description: "Go skills", metadata: { "aas-risk": "critical", "aas-source": "community" } },
      body,
      files: [],
    });
    const flat = normalizedSkillHash({
      frontmatter: { name: "golang-pro", description: "Go skills", risk: "critical", source: "community", date_added: "2026-02-27" },
      body,
      files: [],
    });
    expect(nested).toBe(flat);
  });

  it("ignores line ending, blank line, and trailing whitespace differences", () => {
    const unix = normalizedSkillHash({ frontmatter: { name: "a", description: "d" }, body: "line one\nline two\n", files: [] });
    const windows = normalizedSkillHash({ frontmatter: { name: "a", description: "d" }, body: "line one  \r\nline two\r\n\r\n", files: [] });
    const spaced = normalizedSkillHash({ frontmatter: { name: "a", description: "d" }, body: "\n\nline one\n\n\n\nline two", files: [] });
    const singleBlank = normalizedSkillHash({ frontmatter: { name: "a", description: "d" }, body: "line one\n\nline two", files: [] });
    expect(unix).toBe(windows);
    expect(spaced).toBe(singleBlank);
  });

  it("changes when the body, a shipped file, or a meaningful field changes", () => {
    const base = { frontmatter: { name: "a", description: "d" }, body, files: [] };
    const withScript = { ...base, files: [{ relativePath: "scripts/run.py", content: "print(1)" }] };
    const otherBody = { ...base, body: `${body}\nMore.` };
    const otherTools = { ...base, frontmatter: { ...base.frontmatter, "allowed-tools": "Bash" } };
    const hashes = [base, withScript, otherBody, otherTools].map((skill) => normalizedSkillHash(skill));
    expect(new Set(hashes).size).toBe(4);
  });
});

function entry(partial: Partial<SkillEntry>): SkillEntry {
  return {
    name: "skill",
    description: "",
    category: "general",
    source: "src",
    repository: "",
    path: "skill",
    lastCommitHash: "",
    lastCommitDate: "",
    contentHash: "x",
    riskLevel: "low",
    hasScripts: false,
    networkCalls: false,
    destructiveOps: false,
    confirmsBeforeDestructive: false,
    claudeCodeOnly: false,
    promptInjectionSuspected: false,
    secretReferences: false,
    sourceReputation: { stars: 0, lastActivityDate: "", singleMaintainer: false, hasCi: false },
    lines: 1,
    tokenEstimate: 1,
    ...partial,
  };
}

describe("dedupeIndex with normalized hashes", () => {
  it("collapses entries whose normalized hash matches even when content hashes differ", () => {
    const kept = entry({ path: "skills/golang-pro", contentHash: "aaa", normalizedHash: "norm" });
    const removed = entry({ path: "plugins/bundle/skills/golang-pro", contentHash: "bbb", normalizedHash: "norm" });
    const other = entry({ name: "other", path: "skills/other", contentHash: "ccc", normalizedHash: "different" });
    const result = dedupeIndex([kept, removed, other], ["src"]);
    expect(result.kept.map((item) => item.path).sort()).toEqual(["skills/golang-pro", "skills/other"]);
    expect(result.removed.map((item) => item.path)).toEqual(["plugins/bundle/skills/golang-pro"]);
  });

  it("prefers the most trusted source over config order", () => {
    const untrusted = entry({ source: "first", path: "a", contentHash: "aaa", normalizedHash: "norm" });
    const trusted = entry({ source: "second", path: "b", contentHash: "bbb", normalizedHash: "norm" });
    const result = dedupeIndex([untrusted, trusted], [{ name: "first", trust: 40 }, { name: "second", trust: 100 }]);
    expect(result.kept[0].source).toBe("second");
    expect(result.removed[0].source).toBe("first");
  });

  it("falls back to the content hash for entries without a normalized hash", () => {
    const a = entry({ path: "a", contentHash: "same" });
    const b = entry({ path: "b", contentHash: "same" });
    const result = dedupeIndex([a, b], ["src"]);
    expect(result.kept.length).toBe(1);
    expect(result.removed.length).toBe(1);
  });
});
