import { describe, expect, it } from "vitest";
import { canReuseIndex } from "../src/commands/sync";

const state = { head: "abc", version: "0.4.0", syncedAt: "2026-08-31T00:00:00Z" };

describe("canReuseIndex", () => {
  it("reuses the index only when head, version and existing entries all line up", () => {
    expect(canReuseIndex(state, "abc", "0.4.0", 20)).toBe(true);
    expect(canReuseIndex(state, "def", "0.4.0", 20)).toBe(false);
    expect(canReuseIndex(state, "abc", "0.4.1", 20)).toBe(false);
    expect(canReuseIndex(state, "abc", "0.4.0", 0)).toBe(false);
    expect(canReuseIndex(undefined, "abc", "0.4.0", 20)).toBe(false);
    expect(canReuseIndex(state, "", "0.4.0", 20)).toBe(false);
  });
});
