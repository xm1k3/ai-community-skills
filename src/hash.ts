import { createHash } from "node:crypto";

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hashFileSet(files: { relativePath: string; content: Buffer }[]): string {
  const hash = createHash("sha256");
  const sorted = [...files].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  for (const file of sorted) {
    hash.update(file.relativePath);
    hash.update("\0");
    hash.update(file.content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function shortHash(hash: string): string {
  return hash.slice(0, 12);
}
