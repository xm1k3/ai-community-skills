export interface ParsedSkillMd {
  data: Record<string, unknown>;
  body: string;
}

const KEY_LINE = /^([A-Za-z0-9_.-]+):(?:\s+(.*))?$/;

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function splitInline(raw: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const char of raw) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
      current += char;
    } else if (char === ",") {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim() !== "") parts.push(current);
  return parts;
}

function stripComment(value: string): string {
  return value.replace(/\s+#.*$/, "").trim();
}

export function parseScalar(raw: string): unknown {
  const value = raw.trim();
  if (value === "") return "";
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    return splitInline(value.slice(1, -1)).map((part) => parseScalar(part));
  }
  const cleaned = stripComment(value);
  if (cleaned === "true") return true;
  if (cleaned === "false") return false;
  if (cleaned === "null" || cleaned === "~") return null;
  if (/^-?\d+(\.\d+)?$/.test(cleaned)) return Number(cleaned);
  return cleaned;
}

function dedent(lines: string[]): string[] {
  const nonEmpty = lines.filter((line) => line.trim() !== "");
  const minIndent = nonEmpty.length === 0 ? 0 : Math.min(...nonEmpty.map(indentOf));
  return lines.map((line) => (line.trim() === "" ? "" : line.slice(minIndent)));
}

function foldLines(lines: string[]): string {
  const paragraphs: string[][] = [[]];
  for (const line of lines) {
    if (line.trim() === "") {
      if (paragraphs[paragraphs.length - 1].length > 0) paragraphs.push([]);
    } else {
      paragraphs[paragraphs.length - 1].push(line.trim());
    }
  }
  return paragraphs
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => paragraph.join(" "))
    .join("\n")
    .trim();
}

function collectChildren(lines: string[], start: number): { children: string[]; next: number } {
  const children: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || indentOf(line) > 0 || line.trimStart().startsWith("- ")) {
      children.push(line);
      i++;
    } else {
      break;
    }
  }
  while (children.length > 0 && children[children.length - 1].trim() === "") children.pop();
  return { children, next: i };
}

export function parseYamlSubset(lines: string[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#") || indentOf(line) > 0) {
      i++;
      continue;
    }
    const match = KEY_LINE.exec(line.trimEnd());
    if (!match) {
      i++;
      continue;
    }
    const key = match[1];
    const rest = (match[2] ?? "").trim();
    i++;
    if (rest === "") {
      const { children, next } = collectChildren(lines, i);
      i = next;
      const nonEmpty = children.filter((child) => child.trim() !== "");
      if (nonEmpty.length === 0) {
        data[key] = "";
      } else if (nonEmpty.every((child) => child.trim().startsWith("- "))) {
        data[key] = nonEmpty.map((child) => parseScalar(child.trim().slice(2)));
      } else if (nonEmpty.every((child) => KEY_LINE.test(child.trim()))) {
        data[key] = parseYamlSubset(dedent(nonEmpty));
      } else {
        data[key] = foldLines(dedent(children));
      }
    } else if (/^[|>][-+]?$/.test(rest)) {
      const { children, next } = collectChildren(lines, i);
      i = next;
      const dedented = dedent(children);
      data[key] = rest.startsWith("|") ? dedented.join("\n").replace(/\n+$/, "") : foldLines(dedented);
    } else {
      data[key] = parseScalar(rest);
    }
  }
  return data;
}

export function parseFrontmatter(content: string): ParsedSkillMd | null {
  const lines = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n");
  if (lines.length === 0 || lines[0].trim() !== "---") return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "---" || trimmed === "...") {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  return {
    data: parseYamlSubset(lines.slice(1, end)),
    body: lines.slice(end + 1).join("\n"),
  };
}

export function stringField(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  if (typeof value === "string") return value.trim() === "" ? null : value.trim();
  if (typeof value === "number") return String(value);
  return null;
}
