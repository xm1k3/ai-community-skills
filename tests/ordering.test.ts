import { describe, expect, it } from "vitest";
import { depthOf, folderFacets, folderOf, folderRank, inFolder, minDepthBySource } from "../src/index/ordering";

describe("path helpers", () => {
  it("measures depth and extracts the parent folder", () => {
    expect(depthOf("artifacts-builder")).toBe(1);
    expect(depthOf("composio-skills/ably-automation")).toBe(2);
    expect(depthOf("")).toBe(0);
    expect(folderOf("artifacts-builder")).toBe(".");
    expect(folderOf("composio-skills/ably-automation")).toBe("composio-skills");
    expect(folderOf("plugins/bundle/skills/one")).toBe("plugins/bundle/skills");
  });

  it("matches folders including the root marker", () => {
    expect(inFolder("artifacts-builder", ".")).toBe(true);
    expect(inFolder("composio-skills/ably-automation", ".")).toBe(false);
    expect(inFolder("composio-skills/ably-automation", "composio-skills")).toBe(true);
    expect(inFolder("composio-skills-extra/x", "composio-skills")).toBe(false);
    expect(inFolder("skills/libreoffice/calc", "skills")).toBe(true);
  });
});

describe("folderRank", () => {
  const entries = [
    { source: "composio", path: "artifacts-builder" },
    { source: "composio", path: "composio-skills/ably-automation" },
    { source: "sickn33", path: "skills/main-skill" },
    { source: "sickn33", path: "plugins/bundle/skills/nested" },
  ];
  const minDepths = minDepthBySource(entries);

  it("is relative to the shallowest skill of each source", () => {
    expect(minDepths.get("composio")).toBe(1);
    expect(minDepths.get("sickn33")).toBe(2);
    expect(folderRank(entries[0], minDepths)).toBe(0);
    expect(folderRank(entries[1], minDepths)).toBe(1);
    expect(folderRank(entries[2], minDepths)).toBe(0);
    expect(folderRank(entries[3], minDepths)).toBe(2);
  });

  it("falls back to zero for unknown sources", () => {
    expect(folderRank({ source: "other", path: "a/b/c" }, minDepths)).toBe(3);
  });
});

describe("folderFacets", () => {
  it("counts skills per folder, shallow folders first, then by size", () => {
    const facets = folderFacets([
      { path: "one" },
      { path: "two" },
      { path: "bulk/a" },
      { path: "bulk/b" },
      { path: "bulk/c" },
      { path: "docs/a" },
      { path: "deep/er/a" },
    ]);
    expect(facets).toEqual([
      { name: ".", count: 2 },
      { name: "bulk", count: 3 },
      { name: "docs", count: 1 },
      { name: "deep/er", count: 1 },
    ]);
  });

  it("honours the limit", () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({ path: `folder-${i}/skill` }));
    expect(folderFacets(entries, 5)).toHaveLength(5);
  });
});
