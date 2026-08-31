import { updateCheckPath } from "./paths";
import { readJsonFile, writeJsonFile } from "./store";
import { currentVersion, DEV_VERSION } from "./version";

export const PACKAGE_NAME = "ai-community-skills";
export const LATEST_VERSION_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
export const RELEASES_URL = "https://github.com/xm1k3/ai-community-skills/releases";
export const UPGRADE_COMMAND = `npm install -g ${PACKAGE_NAME}@latest`;
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;

export interface UpdateCache {
  checkedAt: string;
  latest: string;
}

export interface UpdateInfo {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
}

function parseVersion(value: string): { numbers: number[]; prerelease: string | null } | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(value.trim());
  if (!match) return null;
  return { numbers: [Number(match[1]), Number(match[2]), Number(match[3])], prerelease: match[4] ?? null };
}

export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  for (let i = 0; i < 3; i++) {
    if (left.numbers[i] !== right.numbers[i]) return left.numbers[i] < right.numbers[i] ? -1 : 1;
  }
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease < right.prerelease ? -1 : 1;
}

export function isUpdateCheckDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.ACS_NO_UPDATE_CHECK ?? env.NO_UPDATE_NOTIFIER;
  return flag !== undefined && flag !== "" && flag !== "0" && flag !== "false";
}

export function readUpdateCache(): UpdateCache | null {
  try {
    const cache = readJsonFile<Partial<UpdateCache>>(updateCheckPath(), {});
    if (typeof cache.checkedAt !== "string" || typeof cache.latest !== "string") return null;
    return { checkedAt: cache.checkedAt, latest: cache.latest };
  } catch {
    return null;
  }
}

export function writeUpdateCache(cache: UpdateCache): void {
  try {
    writeJsonFile(updateCheckPath(), cache);
  } catch {
    return;
  }
}

export function isCacheFresh(cache: UpdateCache | null, current: string, now = Date.now(), intervalMs = CHECK_INTERVAL_MS): boolean {
  if (!cache) return false;
  if (compareVersions(cache.latest, current) < 0) return false;
  const checkedAt = Date.parse(cache.checkedAt);
  return Number.isFinite(checkedAt) && now - checkedAt < intervalMs;
}

export async function fetchLatestVersion(url = LATEST_VERSION_URL, timeoutMs = FETCH_TIMEOUT_MS, signal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const forward = () => controller.abort();
  signal?.addEventListener("abort", forward, { once: true });
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { version?: unknown };
    if (typeof data.version !== "string" || !parseVersion(data.version)) throw new Error("the registry returned no version");
    return data.version;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forward);
  }
}

export function updateInfoFor(current: string, latest: string | null): UpdateInfo {
  return {
    current,
    latest,
    updateAvailable: latest !== null && current !== DEV_VERSION && compareVersions(current, latest) < 0,
  };
}

export function cachedUpdateInfo(current = currentVersion()): UpdateInfo {
  return updateInfoFor(current, readUpdateCache()?.latest ?? null);
}

export class UpdateChecker {
  private controller: AbortController | null = null;
  private pending: Promise<UpdateInfo> | null = null;

  constructor(
    private readonly current = currentVersion(),
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  get enabled(): boolean {
    return this.current !== DEV_VERSION && !isUpdateCheckDisabled(this.env);
  }

  start(now = Date.now()): Promise<UpdateInfo> {
    if (this.pending) return this.pending;
    const cache = readUpdateCache();
    if (!this.enabled) return Promise.resolve(updateInfoFor(this.current, null));
    if (isCacheFresh(cache, this.current, now)) return Promise.resolve(updateInfoFor(this.current, cache?.latest ?? null));
    const controller = new AbortController();
    this.controller = controller;
    this.pending = fetchLatestVersion(LATEST_VERSION_URL, FETCH_TIMEOUT_MS, controller.signal)
      .then((latest) => {
        writeUpdateCache({ checkedAt: new Date(now).toISOString(), latest });
        return updateInfoFor(this.current, latest);
      })
      .catch(() => updateInfoFor(this.current, cache?.latest ?? null))
      .finally(() => {
        this.pending = null;
        this.controller = null;
      });
    return this.pending;
  }

  async result(maxWaitMs = 1500): Promise<UpdateInfo> {
    const pending = this.start();
    let timer: NodeJS.Timeout | null = null;
    const timeout = new Promise<UpdateInfo>((resolve) => {
      timer = setTimeout(() => {
        this.controller?.abort();
        resolve(updateInfoFor(this.current, readUpdateCache()?.latest ?? null));
      }, maxWaitMs);
    });
    try {
      return await Promise.race([pending, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export function formatUpdateNotice(info: UpdateInfo): string {
  return [`Update available: ${PACKAGE_NAME} ${info.current} -> ${info.latest}`, `Run "${UPGRADE_COMMAND}" to upgrade. Release notes: ${RELEASES_URL}`].join("\n");
}

export function printUpdateNotice(info: UpdateInfo, stream: NodeJS.WriteStream = process.stderr): boolean {
  if (!info.updateAvailable || !stream.isTTY) return false;
  stream.write(`\n${formatUpdateNotice(info)}\n`);
  return true;
}
