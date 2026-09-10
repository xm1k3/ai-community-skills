import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commitLookupForRepository, lastCommitForPath, parseCommitLog } from "../src/git";

let repo: string;

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z" } }).trim();
}

function commit(message: string, files: Record<string, string>): void {
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), content);
  }
  git("add", "-A");
  git("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", message);
}

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "acs-git-"));
  git("init", "-q");
});

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe("parseCommitLog", () => {
  it("assigns every parent directory to the most recent commit touching it", () => {
    const output = ["\x1eaaa\x1f2026-02-01T00:00:00Z", "skills/one/SKILL.md", "", "\x1ebbb\x1f2026-01-01T00:00:00Z", "skills/one/SKILL.md", "skills/two/extra/notes.md", "README.md"].join("\n");
    const latest = parseCommitLog(output);
    expect(latest.get("")).toEqual({ hash: "aaa", date: "2026-02-01T00:00:00Z" });
    expect(latest.get("skills")?.hash).toBe("aaa");
    expect(latest.get("skills/one")?.hash).toBe("aaa");
    expect(latest.get("skills/two")?.hash).toBe("bbb");
    expect(latest.get("skills/two/extra")?.hash).toBe("bbb");
    expect(latest.get("missing")).toBeUndefined();
  });
});

describe("commitLookupForRepository", () => {
  it("matches git log -1 for every skill directory and the repository root", () => {
    commit("first", { "skills/alpha/SKILL.md": "a", "skills/beta/SKILL.md": "b", "README.md": "r" });
    commit("second", { "skills/beta/SKILL.md": "b2" });
    commit("third", { "docs/guide.md": "g" });
    const lookup = commitLookupForRepository(repo);
    for (const relativePath of ["", "skills/alpha", "skills/beta", "skills", "docs"]) {
      expect(lookup(relativePath)).toEqual(lastCommitForPath(repo, relativePath));
    }
    expect(lookup("skills/alpha").hash).not.toBe(lookup("skills/beta").hash);
    expect(lookup("nowhere")).toEqual({ hash: "", date: "" });
  });
});
