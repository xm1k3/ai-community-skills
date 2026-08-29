import { describe, expect, it } from "vitest";
import { explainSearch, fuzzyScore, searchSkills } from "../src/search";
import type { SkillEntry } from "../src/types";

function entry(name: string, description: string): SkillEntry {
  return {
    name,
    description,
    category: "general",
    source: "s",
    repository: "r",
    path: name,
    lastCommitHash: "",
    lastCommitDate: "",
    contentHash: name,
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
  };
}

describe("fuzzyScore", () => {
  it("ranks exact and substring matches above subsequence matches", () => {
    expect(fuzzyScore("pdf", "pdf")).toBeGreaterThan(fuzzyScore("pdf", "pdf-tools"));
    expect(fuzzyScore("pdf", "pdf-tools")).toBeGreaterThan(fuzzyScore("pdf", "print document format"));
    expect(fuzzyScore("pdf", "print document format")).toBeGreaterThan(0);
    expect(fuzzyScore("xyz", "print document format")).toBe(0);
  });
});

describe("searchSkills", () => {
  const index = [
    entry("pdf-extract", "Extract text and tables from PDF files"),
    entry("release-notes", "Generate release notes from git history"),
    entry("code-review", "Review pull requests for correctness"),
  ];

  it("finds matches by name and description", () => {
    expect(searchSkills(index, "pdf")[0].entry.name).toBe("pdf-extract");
    expect(searchSkills(index, "git history")[0].entry.name).toBe("release-notes");
  });

  it("returns nothing for unrelated queries", () => {
    expect(searchSkills(index, "kubernetes")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(searchSkills(index, "e", 1)).toHaveLength(1);
  });

  it("explains which field each term matched and reproduces the ranking score", () => {
    const explanation = explainSearch(index[1], "release history");
    expect(explanation.totalTerms).toBe(2);
    expect(explanation.matchedTerms).toBe(2);
    expect(explanation.terms[0]).toMatchObject({ term: "release", best: "name" });
    expect(explanation.terms[0].name.type).toBe("word");
    expect(explanation.terms[1]).toMatchObject({ term: "history", best: "description" });
    expect(explanation.score).toBe(searchSkills(index, "release history")[0].score);
  });
});
