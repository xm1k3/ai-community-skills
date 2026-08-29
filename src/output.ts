import readline from "node:readline";

export function log(message = ""): void {
  process.stdout.write(`${message}\n`);
}

export function warn(message: string): void {
  process.stderr.write(`Warning: ${message}\n`);
}

export function fail(message: string): void {
  process.stderr.write(`Error: ${message}\n`);
}

export async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    warn("Standard input is not a terminal. Pass --yes to skip the confirmation prompt.");
    return false;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question(`${question} [y/N] `, (value) => resolve(value));
  });
  rl.close();
  const normalized = answer.trim().toLowerCase();
  return normalized === "y" || normalized === "yes";
}

export function truncate(text: string, width: number): string {
  const single = text.replace(/\s+/g, " ").trim();
  if (single.length <= width) return single;
  return `${single.slice(0, Math.max(0, width - 3))}...`;
}

export function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => (row[column] ?? "").length)),
  );
  const render = (cells: string[]): string =>
    cells.map((cell, column) => cell.padEnd(widths[column])).join("  ").trimEnd();
  const lines = [render(headers), render(widths.map((width) => "-".repeat(width)))];
  for (const row of rows) lines.push(render(row));
  return lines.join("\n");
}

export function formatKeyValues(pairs: [string, string][]): string {
  const width = Math.max(...pairs.map(([key]) => key.length));
  return pairs.map(([key, value]) => `${key.padEnd(width)}  ${value}`).join("\n");
}

export function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

export function terminalWidth(): number {
  return process.stdout.columns && process.stdout.columns > 40 ? process.stdout.columns : 120;
}
