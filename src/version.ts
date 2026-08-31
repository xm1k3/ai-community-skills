declare const __ACS_VERSION__: string | undefined;

export const DEV_VERSION = "0.0.0-dev";

export function currentVersion(): string {
  return typeof __ACS_VERSION__ === "string" ? __ACS_VERSION__ : DEV_VERSION;
}
