import fs from "node:fs";
import path from "node:path";
import type { UpstreamSetup } from "../types";

export interface UpstreamMeta {
  category?: string;
  risk?: string;
  tags?: string[];
  tools?: string[];
  setup?: UpstreamSetup;
  author?: string;
}

const CATALOG_LOCATIONS = ["skills_index.json", "data/skills_index.json"];
const MAX_ENTRIES = 50000;
const MAX_TAGS = 12;
const MAX_TOOLS = 8;
const MAX_LABEL = 60;
const MAX_SUMMARY = 300;

function cleanLabel(value: unknown, max = MAX_LABEL): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed === "") return undefined;
  return trimmed.slice(0, max);
}

function cleanLabelList(value: unknown, limit: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  for (const item of value) {
    const label = cleanLabel(item);
    if (label) seen.add(label.toLowerCase());
    if (seen.size >= limit) break;
  }
  return seen.size > 0 ? [...seen] : undefined;
}

function normalizeCatalogPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (normalized === "" || normalized.includes("..")) return null;
  return normalized;
}

function parseSetup(value: unknown): UpstreamSetup | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const type = cleanLabel(record.type);
  if (!type || type === "none") return undefined;
  return { type, summary: cleanLabel(record.summary, MAX_SUMMARY) ?? "" };
}

function parseTools(record: Record<string, unknown>): string[] | undefined {
  const direct = cleanLabelList(record.tools, MAX_TOOLS);
  if (direct) return direct;
  const plugin = record.plugin;
  if (typeof plugin !== "object" || plugin === null) return undefined;
  const targets = (plugin as Record<string, unknown>).targets;
  if (typeof targets !== "object" || targets === null) return undefined;
  const supported = Object.entries(targets as Record<string, unknown>)
    .filter(([, status]) => status === "supported")
    .map(([tool]) => cleanLabel(tool))
    .filter((tool): tool is string => tool !== undefined);
  return supported.length > 0 ? supported.slice(0, MAX_TOOLS) : undefined;
}

export function parseUpstreamEntry(value: unknown): { path: string; meta: UpstreamMeta } | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const entryPath = normalizeCatalogPath(record.path);
  if (!entryPath) return null;
  const category = cleanLabel(record.category)?.toLowerCase();
  const meta: UpstreamMeta = {
    category: category && category !== "uncategorized" ? category : undefined,
    risk: cleanLabel(record.risk)?.toLowerCase(),
    tags: cleanLabelList(record.tags, MAX_TAGS),
    tools: parseTools(record),
    setup: parseSetup(typeof record.plugin === "object" && record.plugin !== null ? (record.plugin as Record<string, unknown>).setup : undefined),
    author: cleanLabel(record.author),
  };
  if (!meta.category && !meta.risk && !meta.tags && !meta.tools && !meta.setup && !meta.author) return null;
  return { path: entryPath, meta };
}

export function loadUpstreamCatalog(rootDir: string): Map<string, UpstreamMeta> {
  const catalog = new Map<string, UpstreamMeta>();
  for (const location of CATALOG_LOCATIONS) {
    const file = path.join(rootDir, location);
    if (!fs.existsSync(file)) continue;
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const list = Array.isArray(data) ? data : typeof data === "object" && data !== null && Array.isArray((data as Record<string, unknown>).skills) ? ((data as Record<string, unknown>).skills as unknown[]) : null;
    if (!list) continue;
    for (const item of list.slice(0, MAX_ENTRIES)) {
      const parsed = parseUpstreamEntry(item);
      if (parsed && !catalog.has(parsed.path)) catalog.set(parsed.path, parsed.meta);
    }
    if (catalog.size > 0) break;
  }
  return catalog;
}
