import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function runGit(args: string[], cwd?: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}

function describeGitError(error: unknown): string {
  const err = error as { stderr?: string | Buffer; message?: string };
  const stderr = err.stderr ? String(err.stderr).trim() : "";
  return stderr !== "" ? stderr.split("\n").slice(-3).join(" ") : err.message ?? String(error);
}

export function ensureGitAvailable(): void {
  try {
    runGit(["--version"]);
  } catch {
    throw new Error("git was not found on PATH. Install git to sync sources.");
  }
}

export function isGitRepository(dir: string): boolean {
  return fs.existsSync(path.join(dir, ".git"));
}

export function cloneRepository(repo: string, dir: string): void {
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  try {
    runGit(["clone", "--quiet", "--filter=blob:none", repo, dir]);
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    try {
      runGit(["clone", "--quiet", repo, dir]);
    } catch (fallbackError) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw new Error(`Failed to clone ${repo}: ${describeGitError(fallbackError ?? error)}`);
    }
  }
}

export function pullRepository(dir: string): void {
  try {
    runGit(["fetch", "--quiet", "--prune", "origin"], dir);
    let remoteHead = "";
    try {
      remoteHead = runGit(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], dir);
    } catch {
      remoteHead = "";
    }
    if (remoteHead === "") {
      const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"], dir);
      remoteHead = `origin/${branch}`;
    }
    runGit(["reset", "--quiet", "--hard", remoteHead], dir);
  } catch (error) {
    throw new Error(`Failed to update ${dir}: ${describeGitError(error)}`);
  }
}

export function cloneOrPull(repo: string, dir: string): "cloned" | "updated" {
  if (isGitRepository(dir)) {
    pullRepository(dir);
    return "updated";
  }
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  cloneRepository(repo, dir);
  return "cloned";
}

export interface CommitInfo {
  hash: string;
  date: string;
}

export function lastCommitForPath(dir: string, relativePath: string): CommitInfo {
  try {
    const args = ["log", "-1", "--format=%H%x1f%cI"];
    if (relativePath !== "") args.push("--", relativePath);
    const output = runGit(args, dir);
    if (output === "") return { hash: "", date: "" };
    const [hash, date] = output.split("\x1f");
    return { hash: hash ?? "", date: date ?? "" };
  } catch {
    return { hash: "", date: "" };
  }
}

export function repositoryLastActivity(dir: string): string {
  try {
    return runGit(["log", "-1", "--format=%cI"], dir);
  } catch {
    return "";
  }
}

export function repositoryHeadHash(dir: string): string {
  try {
    return runGit(["rev-parse", "HEAD"], dir);
  } catch {
    return "";
  }
}

export function contributorCount(dir: string): number {
  try {
    const output = runGit(["log", "--format=%ae"], dir);
    const emails = new Set(
      output
        .split("\n")
        .map((line) => line.trim().toLowerCase())
        .filter((line) => line !== "" && !line.includes("[bot]") && line !== "noreply@github.com"),
    );
    return emails.size;
  } catch {
    return 0;
  }
}

export function hasCiWorkflow(dir: string): boolean {
  const workflows = path.join(dir, ".github", "workflows");
  if (fs.existsSync(workflows)) {
    try {
      const files = fs.readdirSync(workflows).filter((file) => /\.ya?ml$/i.test(file));
      if (files.length > 0) return true;
    } catch {
      return false;
    }
  }
  const candidates = [".gitlab-ci.yml", ".circleci/config.yml", ".travis.yml", "azure-pipelines.yml", "Jenkinsfile", ".buildkite/pipeline.yml", "bitbucket-pipelines.yml"];
  return candidates.some((candidate) => fs.existsSync(path.join(dir, candidate)));
}
