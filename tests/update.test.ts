import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compareVersions,
  fetchLatestVersion,
  formatUpdateNotice,
  isCacheFresh,
  isUpdateCheckDisabled,
  readUpdateCache,
  UpdateChecker,
  updateInfoFor,
  writeUpdateCache,
} from "../src/update";

let home: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "acs-update-"));
  process.env.ACS_HOME = home;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ACS_HOME;
  fs.rmSync(home, { recursive: true, force: true });
});

function stubRegistry(version: string, ok = true) {
  const fetchMock = vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => ({ version }) }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("compareVersions", () => {
  it("orders by major, minor, patch", () => {
    expect(compareVersions("0.2.0", "0.3.0")).toBe(-1);
    expect(compareVersions("1.0.0", "0.9.9")).toBe(1);
    expect(compareVersions("0.2.0", "0.2.0")).toBe(0);
    expect(compareVersions("0.2.10", "0.2.9")).toBe(1);
  });

  it("ranks prereleases below the final release", () => {
    expect(compareVersions("0.3.0-beta.1", "0.3.0")).toBe(-1);
    expect(compareVersions("0.3.0", "0.3.0-rc.1")).toBe(1);
    expect(compareVersions("v0.2.0", "0.2.0")).toBe(0);
  });

  it("treats unparsable versions as equal", () => {
    expect(compareVersions("latest", "0.2.0")).toBe(0);
  });
});

describe("updateInfoFor", () => {
  it("flags an update only when the registry is ahead", () => {
    expect(updateInfoFor("0.2.0", "0.3.0").updateAvailable).toBe(true);
    expect(updateInfoFor("0.3.0", "0.3.0").updateAvailable).toBe(false);
    expect(updateInfoFor("0.4.0", "0.3.0").updateAvailable).toBe(false);
    expect(updateInfoFor("0.2.0", null).updateAvailable).toBe(false);
  });

  it("never reports an update for the dev build", () => {
    expect(updateInfoFor("0.0.0-dev", "9.9.9").updateAvailable).toBe(false);
  });
});

describe("update cache", () => {
  it("round-trips through ACS_HOME and reports freshness", () => {
    expect(readUpdateCache()).toBeNull();
    const checkedAt = new Date("2026-08-31T10:00:00Z").toISOString();
    writeUpdateCache({ checkedAt, latest: "0.3.0" });
    expect(readUpdateCache()).toEqual({ checkedAt, latest: "0.3.0" });
    const later = Date.parse(checkedAt) + 60 * 60 * 1000;
    const muchLater = Date.parse(checkedAt) + 25 * 60 * 60 * 1000;
    expect(isCacheFresh(readUpdateCache(), later)).toBe(true);
    expect(isCacheFresh(readUpdateCache(), muchLater)).toBe(false);
    expect(isCacheFresh(null)).toBe(false);
  });

  it("ignores malformed cache files", () => {
    fs.writeFileSync(path.join(home, "update-check.json"), "{ nope");
    expect(readUpdateCache()).toBeNull();
  });
});

describe("isUpdateCheckDisabled", () => {
  it("honours ACS_NO_UPDATE_CHECK and NO_UPDATE_NOTIFIER", () => {
    expect(isUpdateCheckDisabled({})).toBe(false);
    expect(isUpdateCheckDisabled({ ACS_NO_UPDATE_CHECK: "1" })).toBe(true);
    expect(isUpdateCheckDisabled({ ACS_NO_UPDATE_CHECK: "0" })).toBe(false);
    expect(isUpdateCheckDisabled({ NO_UPDATE_NOTIFIER: "true" })).toBe(true);
  });
});

describe("fetchLatestVersion", () => {
  it("returns the version published on the registry", async () => {
    stubRegistry("0.3.0");
    await expect(fetchLatestVersion()).resolves.toBe("0.3.0");
  });

  it("rejects on HTTP errors and on payloads without a version", async () => {
    stubRegistry("0.3.0", false);
    await expect(fetchLatestVersion()).rejects.toThrow(/HTTP 500/);
    stubRegistry("not-a-version");
    await expect(fetchLatestVersion()).rejects.toThrow(/no version/);
  });
});

describe("UpdateChecker", () => {
  it("fetches once, writes the cache and reports the update", async () => {
    const fetchMock = stubRegistry("0.3.0");
    const checker = new UpdateChecker("0.2.0", {});
    const info = await checker.result();
    expect(info).toEqual({ current: "0.2.0", latest: "0.3.0", updateAvailable: true });
    expect(readUpdateCache()?.latest).toBe("0.3.0");
    await checker.result();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not touch the network while the cache is fresh", async () => {
    const fetchMock = stubRegistry("0.9.0");
    writeUpdateCache({ checkedAt: new Date().toISOString(), latest: "0.3.0" });
    const info = await new UpdateChecker("0.2.0", {}).result();
    expect(info.latest).toBe("0.3.0");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the stale cache when the registry is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    writeUpdateCache({ checkedAt: "2020-01-01T00:00:00.000Z", latest: "0.3.0" });
    const info = await new UpdateChecker("0.2.0", {}).result();
    expect(info).toEqual({ current: "0.2.0", latest: "0.3.0", updateAvailable: true });
  });

  it("is disabled by the opt-out variable and for dev builds", async () => {
    const fetchMock = stubRegistry("0.3.0");
    expect(new UpdateChecker("0.2.0", { ACS_NO_UPDATE_CHECK: "1" }).enabled).toBe(false);
    expect(new UpdateChecker("0.0.0-dev", {}).enabled).toBe(false);
    const info = await new UpdateChecker("0.2.0", { ACS_NO_UPDATE_CHECK: "1" }).result();
    expect(info.updateAvailable).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives up after the wait budget without hanging on the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      ),
    );
    const info = await new UpdateChecker("0.2.0", {}).result(20);
    expect(info).toEqual({ current: "0.2.0", latest: null, updateAvailable: false });
  });
});

describe("formatUpdateNotice", () => {
  it("names both versions and the upgrade command", () => {
    const text = formatUpdateNotice(updateInfoFor("0.2.0", "0.3.0"));
    expect(text).toContain("0.2.0 -> 0.3.0");
    expect(text).toContain("npm install -g ai-community-skills@latest");
  });
});
