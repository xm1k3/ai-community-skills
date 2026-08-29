import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadUpstreamCatalog, parseUpstreamEntry } from "../src/index/upstream";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acs-upstream-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true });
});

describe("parseUpstreamEntry", () => {
  it("extracts category, risk, tags, tools, and setup", () => {
    const parsed = parseUpstreamEntry({
      path: "./skills/demo/",
      category: "API-Integration",
      risk: "Safe",
      tags: ["Slides", "slides", "pdf", 42],
      tools: ["claude", "codex"],
      plugin: { setup: { type: "manual", summary: "Install requirements and set an API key." } },
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.path).toBe("skills/demo");
    expect(parsed?.meta.category).toBe("api-integration");
    expect(parsed?.meta.risk).toBe("safe");
    expect(parsed?.meta.tags).toEqual(["slides", "pdf"]);
    expect(parsed?.meta.tools).toEqual(["claude", "codex"]);
    expect(parsed?.meta.setup).toEqual({ type: "manual", summary: "Install requirements and set an API key." });
  });

  it("drops uncategorized categories and setup type none", () => {
    const parsed = parseUpstreamEntry({
      path: "skills/demo",
      category: "uncategorized",
      plugin: { setup: { type: "none", summary: "" }, targets: { claude: "supported", cursor: "unsupported" } },
    });
    expect(parsed?.meta.category).toBeUndefined();
    expect(parsed?.meta.setup).toBeUndefined();
    expect(parsed?.meta.tools).toEqual(["claude"]);
  });

  it("rejects entries without a usable path or with traversal", () => {
    expect(parseUpstreamEntry({ category: "dev" })).toBeNull();
    expect(parseUpstreamEntry({ path: "../evil", category: "dev" })).toBeNull();
    expect(parseUpstreamEntry({ path: "skills/demo" })).toBeNull();
  });
});

describe("loadUpstreamCatalog", () => {
  it("loads a root skills_index.json array and joins by path", () => {
    const dir = makeTempDir();
    fs.writeFileSync(
      path.join(dir, "skills_index.json"),
      JSON.stringify([
        { path: "skills/one", category: "development", tags: ["go"] },
        { path: "skills/two", risk: "safe" },
        { path: "skills/one", category: "duplicate-ignored" },
        "garbage",
      ]),
    );
    const catalog = loadUpstreamCatalog(dir);
    expect(catalog.size).toBe(2);
    expect(catalog.get("skills/one")?.category).toBe("development");
    expect(catalog.get("skills/one")?.tags).toEqual(["go"]);
    expect(catalog.get("skills/two")?.risk).toBe("safe");
  });

  it("returns an empty catalog for missing or invalid files", () => {
    const dir = makeTempDir();
    expect(loadUpstreamCatalog(dir).size).toBe(0);
    fs.writeFileSync(path.join(dir, "skills_index.json"), "not json");
    expect(loadUpstreamCatalog(dir).size).toBe(0);
  });
});
