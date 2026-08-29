import { afterEach, describe, expect, it, vi } from "vitest";
import { bundledDefaultConfig, fetchCuratedConfig, resolveInitialConfig } from "../src/commands/init";
import { parseConfigData } from "../src/store";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseConfigData", () => {
  it("normalizes sources, trust, and flags", () => {
    const config = parseConfigData({
      sources: [{ name: "one", repo: "https://github.com/a/b", trust: 250 }, { name: "two", repo: "c/d", enabled: false }],
      dedupeAfterSync: true,
    });
    expect(config.sources).toEqual([
      { name: "one", repo: "https://github.com/a/b", enabled: true, trust: 100 },
      { name: "two", repo: "c/d", enabled: false },
    ]);
    expect(config.dedupeAfterSync).toBe(true);
    expect(config.embedding).toBeNull();
  });

  it("rejects payloads without a sources array or with broken entries", () => {
    expect(() => parseConfigData({})).toThrow(/sources/);
    expect(() => parseConfigData([])).toThrow();
    expect(() => parseConfigData({ sources: [{ repo: "x" }] })).toThrow(/missing a name/);
  });
});

describe("curated config", () => {
  it("bundles a valid default config with anthropic as a trusted source", () => {
    const config = bundledDefaultConfig();
    expect(config.sources.length).toBeGreaterThan(0);
    expect(config.sources.find((source) => source.name === "anthropic-skills")?.trust).toBe(100);
  });

  it("uses the downloaded config when the fetch succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ sources: [{ name: "remote", repo: "r/s" }] }), { status: 200 })));
    const config = await fetchCuratedConfig("https://example.test/config.json");
    expect(config.sources.map((source) => source.name)).toEqual(["remote"]);
  });

  it("falls back to the bundled config when the download fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const result = await resolveInitialConfig(false);
    expect(result.origin).toBe("bundled");
    expect(result.reason).toMatch(/HTTP 500/);
    expect(result.config.sources.length).toBeGreaterThan(0);
  });

  it("skips the download when offline is requested", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await resolveInitialConfig(true);
    expect(result.origin).toBe("bundled");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
