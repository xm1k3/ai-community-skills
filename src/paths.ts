import os from "node:os";
import path from "node:path";

export function acsHome(): string {
  const override = process.env.ACS_HOME;
  if (override && override.trim() !== "") return path.resolve(override);
  return path.join(os.homedir(), ".acs");
}

export function configPath(): string {
  return path.join(acsHome(), "config.json");
}

export function indexPath(): string {
  return path.join(acsHome(), "index.json");
}

export function installedPath(): string {
  return path.join(acsHome(), "installed.json");
}

export function embeddingsPath(): string {
  return path.join(acsHome(), "embeddings.json");
}

export function collectionsPath(): string {
  return path.join(acsHome(), "collections.json");
}

export function sourcesDir(): string {
  return path.join(acsHome(), "sources");
}

export function sourceDir(name: string): string {
  return path.join(sourcesDir(), name);
}

export function homeDir(): string {
  return process.env.ACS_USER_HOME && process.env.ACS_USER_HOME.trim() !== ""
    ? path.resolve(process.env.ACS_USER_HOME)
    : os.homedir();
}

export function updateCheckPath(): string {
  return path.join(acsHome(), "update-check.json");
}
