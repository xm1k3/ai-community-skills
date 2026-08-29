import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildEntry, buildSourceIndex, dedupeIndex, mergeIndex, type BuildContext } from "../src/index/builder";
import { deriveCategory, loadSkillDirectory, scanSkillTree } from "../src/index/scanner";
import type { SkillEntry } from "../src/types";

let root: string;

function writeSkill(relativeDir: string, frontmatter: string, body = "Body text.", extra: Record<string, string> = {}): string {
  const dir = path.join(root, relativeDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\n${frontmatter}\n---\n${body}\n`);
  for (const [file, content] of Object.entries(extra)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  return dir;
}

const context: BuildContext = {
  source: "fixture",
  repository: "https://github.com/example/fixture",
  reputation: { stars: 5, lastActivityDate: "2026-01-01T00:00:00Z", singleMaintainer: true, hasCi: false },
  commitLookup: (relativePath) => ({ hash: `hash-${relativePath || "root"}`, date: "2026-01-02T00:00:00Z" }),
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "acs-builder-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("scanSkillTree", () => {
  it("indexes directories with a valid SKILL.md and skips invalid ones", () => {
    writeSkill("skills/writing/summarize", "name: summarize\ndescription: Summarize long documents when asked.");
    writeSkill("skills/broken", "name: broken");
    writeSkill("skills/no-frontmatter", "", "");
    fs.writeFileSync(path.join(root, "skills", "no-frontmatter", "SKILL.md"), "# no frontmatter\n");
    fs.mkdirSync(path.join(root, "node_modules", "pkg"), { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules", "pkg", "SKILL.md"), "---\nname: hidden\ndescription: should be ignored\n---\n");

    const result = scanSkillTree(root);
    expect(result.skills.map((skill) => skill.name)).toEqual(["summarize"]);
    expect(result.skills[0].relativePath).toBe("skills/writing/summarize");
    expect(result.skills[0].category).toBe("writing");
    expect(result.invalid.map((item) => item.reason).sort()).toEqual([
      "SKILL.md has no YAML frontmatter",
      "frontmatter is missing a description",
    ]);
  });

  it("does not descend into a skill directory looking for nested skills", () => {
    writeSkill("outer", "name: outer\ndescription: Outer skill for testing nesting.", "Body", {
      "examples/SKILL.md": "---\nname: inner\ndescription: nested\n---\n",
    });
    const result = scanSkillTree(root);
    expect(result.skills.map((skill) => skill.name)).toEqual(["outer"]);
  });

  it("supports a repository whose root is a single skill", () => {
    writeSkill("", "name: root-skill\ndescription: Root level skill used for testing.");
    const result = scanSkillTree(root);
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].relativePath).toBe("");
    expect(result.skills[0].category).toBe("general");
  });
});

describe("deriveCategory", () => {
  it("prefers the frontmatter category", () => {
    expect(deriveCategory({ category: "Data Science" }, "skills/misc/x")).toBe("data-science");
  });

  it("skips generic path segments", () => {
    expect(deriveCategory({}, "skills/x")).toBe("general");
    expect(deriveCategory({}, ".claude/skills/devops/x")).toBe("devops");
    expect(deriveCategory({}, "x")).toBe("general");
  });

  it("skips plugin names and skill collection folders", () => {
    expect(deriveCategory({}, "plugins/my-plugin/skills/x")).toBe("general");
    expect(deriveCategory({}, "composio-skills/x")).toBe("general");
    expect(deriveCategory({}, "plugins/my-plugin/skills/data/x")).toBe("data");
    expect(deriveCategory({}, "skills/v2/x")).toBe("general");
  });
});

describe("loadSkillDirectory", () => {
  it("computes a stable content hash over all files", () => {
    const dir = writeSkill("skills/a", "name: a\ndescription: Skill a used for hash testing.", "Body", { "scripts/run.sh": "echo 1" });
    const first = loadSkillDirectory(dir, "skills/a");
    const second = loadSkillDirectory(dir, "skills/a");
    expect("contentHash" in first && "contentHash" in second && first.contentHash === second.contentHash).toBe(true);
    fs.writeFileSync(path.join(dir, "scripts", "run.sh"), "echo 2");
    const third = loadSkillDirectory(dir, "skills/a");
    expect("contentHash" in third && "contentHash" in first && third.contentHash !== first.contentHash).toBe(true);
  });

  it("counts lines and estimates tokens from SKILL.md", () => {
    const dir = writeSkill("skills/b", "name: b\ndescription: Skill b used for size testing.", "line one\nline two");
    const skill = loadSkillDirectory(dir, "skills/b");
    if ("reason" in skill) throw new Error(skill.reason);
    const raw = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8");
    expect(skill.lines).toBe(raw.split("\n").length);
    expect(skill.tokenEstimate).toBe(Math.ceil(raw.length / 4));
    expect(skill.files.map((file) => file.relativePath)).toEqual(["SKILL.md"]);
  });
});

describe("buildEntry and buildSourceIndex", () => {
  it("builds a complete index entry with risk flags, commit info, and reputation", () => {
    writeSkill("skills/ops/cleanup", "name: cleanup\ndescription: Clean build artifacts when the user asks.", "```bash\nrm -rf dist\n```");
    const { entries, invalid } = buildSourceIndex(root, context);
    expect(invalid).toEqual([]);
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry).toMatchObject({
      name: "cleanup",
      description: "Clean build artifacts when the user asks.",
      category: "ops",
      source: "fixture",
      repository: "https://github.com/example/fixture",
      path: "skills/ops/cleanup",
      lastCommitHash: "hash-skills/ops/cleanup",
      lastCommitDate: "2026-01-02T00:00:00Z",
      riskLevel: "high",
      hasScripts: true,
      networkCalls: false,
      destructiveOps: true,
      confirmsBeforeDestructive: false,
      claudeCodeOnly: false,
      promptInjectionSuspected: false,
      secretReferences: false,
      sourceReputation: context.reputation,
    });
    expect(entry.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.lines).toBeGreaterThan(0);
    expect(entry.tokenEstimate).toBeGreaterThan(0);
  });

  it("sorts entries by name", () => {
    writeSkill("skills/zeta", "name: zeta\ndescription: Zeta skill used for ordering tests.");
    writeSkill("skills/alpha", "name: alpha\ndescription: Alpha skill used for ordering tests.");
    const { entries } = buildSourceIndex(root, context);
    expect(entries.map((entry) => entry.name)).toEqual(["alpha", "zeta"]);
  });

  it("copies reputation so later mutation does not leak between entries", () => {
    const dir = writeSkill("skills/c", "name: c\ndescription: Skill c used for reputation tests.");
    const skill = loadSkillDirectory(dir, "skills/c");
    if ("reason" in skill) throw new Error(skill.reason);
    const entry = buildEntry(skill, context);
    expect(entry.sourceReputation).not.toBe(context.reputation);
  });
});

function entry(overrides: Partial<SkillEntry>): SkillEntry {
  return {
    name: "x",
    description: "d",
    category: "general",
    source: "s",
    repository: "r",
    path: "p",
    lastCommitHash: "",
    lastCommitDate: "",
    contentHash: "h",
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
    ...overrides,
  };
}

describe("mergeIndex", () => {
  it("replaces entries from refreshed sources and keeps the rest", () => {
    const previous = [entry({ name: "a", source: "one" }), entry({ name: "b", source: "two" })];
    const fresh = [entry({ name: "c", source: "one" })];
    const merged = mergeIndex(previous, ["one"], fresh);
    expect(merged.map((item) => `${item.source}/${item.name}`)).toEqual(["two/b", "one/c"]);
  });
});

describe("dedupeIndex", () => {
  it("keeps one entry per content hash preferring config source order", () => {
    const index = [
      entry({ name: "dup", source: "second", contentHash: "same", path: "a/dup" }),
      entry({ name: "dup", source: "first", contentHash: "same", path: "b/dup" }),
      entry({ name: "unique", source: "second", contentHash: "other" }),
    ];
    const result = dedupeIndex(index, ["first", "second"]);
    expect(result.kept.map((item) => `${item.source}/${item.name}`)).toEqual(["first/dup", "second/unique"]);
    expect(result.removed.map((item) => item.source)).toEqual(["second"]);
    expect(result.groups).toHaveLength(1);
  });
});
