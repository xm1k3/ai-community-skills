export type RiskLevel = "high" | "medium" | "low";

export interface SourceReputation {
  stars: number;
  lastActivityDate: string;
  singleMaintainer: boolean;
  hasCi: boolean;
}

export interface Entry {
  name: string;
  description: string;
  category: string;
  source: string;
  repository: string;
  path: string;
  riskLevel: RiskLevel;
  hasScripts: boolean;
  networkCalls: boolean;
  destructiveOps: boolean;
  confirmsBeforeDestructive: boolean;
  claudeCodeOnly: boolean;
  promptInjectionSuspected: boolean;
  secretReferences: boolean;
  sourceReputation: SourceReputation;
  contentHash: string;
  lastCommitDate: string;
  lines: number;
  tokenEstimate: number;
  riskSummary: string[];
  tags: string[];
  tools: string[];
  upstreamCategory: string | null;
  upstreamRisk: string | null;
  setup: { type: string; summary: string } | null;
  author: string | null;
  qualityScore: number | null;
}

export interface InstalledRef {
  target: string;
  scope: string | null;
  installPath: string;
  contentHash?: string;
  drift?: boolean;
}

export interface ListedEntry extends Entry {
  score: number | null;
  installed: InstalledRef[];
  copies: number;
  liked: boolean;
  groups: string[];
}

export interface SkillRef {
  name: string;
  source: string;
  path: string;
}

export type LibraryEntry = (ListedEntry & { missing: false }) | (SkillRef & { missing: true });

export interface Collection {
  id: string;
  name: string;
  description: string;
  skills: LibraryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface Library {
  likes: LibraryEntry[];
  collections: Collection[];
}

export interface SyncJob {
  id: string;
  status: "running" | "done" | "failed";
  sources: string[];
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  lines: string[];
  partial: string;
}

export interface DedupePreview {
  before: number;
  after: number;
  removed: number;
  groupCount: number;
  bySource: Facet[];
  groups: { contentHash: string; keep: SkillRef; remove: SkillRef[] }[];
  truncated: boolean;
}

export interface CollectionInstallItem {
  skill: SkillRef;
  riskLevel: RiskLevel | null;
  destination: string | null;
  warnings: string[];
  blockers: string[];
}

export interface CollectionInstallResult {
  skill: SkillRef;
  status: "installed" | "failed" | "skipped";
  detail: string;
}

export interface Status {
  mode: "lexical" | "semantic";
  provider: string | null;
  model: string | null;
  hint: string | null;
  skills: number;
  embeddings: number;
  sources: string[];
  installed: number;
  likes: number;
  groups: number;
  cwd: string;
  home: string;
  lastSync: string | null;
  syncRunning: boolean;
}

export interface Facet {
  name: string;
  count: number;
}

export interface RiskCounts {
  high: number;
  medium: number;
  low: number;
}

export interface FlagCounts {
  hasScripts: number;
  networkCalls: number;
  destructiveOps: number;
  confirmsBeforeDestructive: number;
  claudeCodeOnly: number;
  promptInjectionSuspected: number;
  secretReferences: number;
}

export interface SourceStats {
  name: string;
  repo: string;
  enabled: boolean;
  trust: number;
  skills: number;
  stars: number;
  lastActivityDate: string;
  singleMaintainer: boolean;
  hasCi: boolean;
  cloned: boolean;
  byRisk: RiskCounts;
  categories: number;
}

export interface Stats {
  total: number;
  byRisk: RiskCounts;
  byCategory: Facet[];
  bySource: Facet[];
  flags: FlagCounts;
  installed: number;
  drifted: number;
  driftedSkills: { name: string; source: string; target: string; installPath: string }[];
  tags: Facet[];
  authors: { name: string; count: number; avgQuality: number | null }[];
  duplicates: number;
  likes: number;
  groups: number;
  lastSync: string | null;
  mode: "lexical" | "semantic";
  sources: SourceStats[];
  recent: ListedEntry[];
  attention: ListedEntry[];
}

export interface BrowseQuery {
  query: string;
  risk: string[];
  category: string;
  source: string;
  path: string;
  tag: string;
  author: string;
  installed: string;
  flags: string[];
  sort: string;
  order: string;
  page: number;
  size: number;
}

export interface BrowseResponse {
  query: string;
  mode: "lexical" | "semantic" | null;
  total: number;
  page: number;
  size: number;
  sort: string;
  order: string;
  results: ListedEntry[];
  facets: { categories: Facet[]; sources: Facet[]; risk: RiskCounts; tags: Facet[] };
}

export interface InstalledRecord {
  name: string;
  source: string;
  target: string;
  scope: string | null;
  installPath: string;
  contentHash: string;
  link: boolean;
  installedAt: string;
  drift: boolean;
  indexed: boolean;
}

export type MatchType = "exact" | "word" | "substring" | "fuzzy" | "none";

export interface FieldMatch {
  score: number;
  type: MatchType;
}

export interface TermExplanation {
  term: string;
  name: FieldMatch;
  description: FieldMatch;
  category: FieldMatch;
  best: "name" | "description" | "category" | "none";
  contribution: number;
}

export interface ScoreExplanation {
  terms: TermExplanation[];
  matchedTerms: number;
  totalTerms: number;
  score: number;
}

export interface Finding {
  category: "network" | "destructive" | "confirmation" | "promptInjection" | "secret" | "script" | "claudeCodeOnly";
  label: string;
  file: string;
  line: number;
  match: string;
  excerpt: string;
  blockKind: "code" | "prose" | "frontmatter" | "file";
}

export interface SkillFile {
  path: string;
  content: string;
  lines: number;
}

export interface SkillDetail {
  entry: Entry & { liked: boolean; groups: string[] };
  repositoryUrl: string | null;
  frontmatter: Record<string, unknown>;
  files: SkillFile[];
  findings: Finding[];
  reasons: string[];
  validation: { errors: string[]; warnings: string[] };
  installed: InstalledRef[];
  scoreExplanation: ScoreExplanation | null;
  mode: "lexical" | "semantic";
  collections: { id: string; name: string; skills: number }[];
}

export interface InstallRequest {
  name: string;
  source: string;
  path?: string;
  target: string;
  scope: string;
  link: boolean;
  force: boolean;
}

export interface InstallPlan {
  plan: string[];
  riskSummary: string[];
  warnings: string[];
  blockers: string[];
  destination: string;
  canInstall: boolean;
}

export interface InstallResult {
  installed: { installPath: string; target: string; scope: string | null };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? response.statusText);
  return data as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export function notifyDataChanged(): void {
  window.dispatchEvent(new CustomEvent("acs-refresh"));
}

async function mutate<T>(path: string, body: unknown): Promise<T> {
  const result = await post<T>(path, body);
  notifyDataChanged();
  return result;
}

export function fetchStatus(): Promise<Status> {
  return request<Status>("/api/status");
}

export function fetchStats(): Promise<Stats> {
  return request<Stats>("/api/stats");
}

export function browseSkills(query: BrowseQuery): Promise<BrowseResponse> {
  const params = new URLSearchParams();
  if (query.query) params.set("query", query.query);
  if (query.risk.length > 0) params.set("risk", query.risk.join(","));
  if (query.category) params.set("category", query.category);
  if (query.source) params.set("source", query.source);
  if (query.path) params.set("path", query.path);
  if (query.tag) params.set("tag", query.tag);
  if (query.author) params.set("author", query.author);
  if (query.installed) params.set("installed", query.installed);
  if (query.flags.length > 0) params.set("flags", query.flags.join(","));
  params.set("sort", query.sort);
  if (query.order) params.set("order", query.order);
  params.set("page", String(query.page));
  params.set("size", String(query.size));
  return request<BrowseResponse>(`/api/skills?${params.toString()}`);
}

export function fetchSkill(source: string, path: string, query: string): Promise<SkillDetail> {
  const params = new URLSearchParams({ source, path });
  if (query) params.set("query", query);
  return request<SkillDetail>(`/api/skill?${params.toString()}`);
}

export function fetchInstalled(): Promise<{ installed: InstalledRecord[] }> {
  return request<{ installed: InstalledRecord[] }>("/api/installed");
}

export function planInstall(body: InstallRequest): Promise<InstallPlan> {
  return post<InstallPlan>("/api/install/plan", body);
}

export function executeInstall(body: InstallRequest): Promise<InstallResult> {
  return mutate<InstallResult>("/api/install/execute", body);
}

export function uninstallSkill(record: { name: string; source: string; target: string; installPath: string }): Promise<{ removed: InstalledRecord }> {
  return mutate<{ removed: InstalledRecord }>("/api/uninstall", record);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

export function fetchSources(): Promise<{ dedupeAfterSync: boolean; sources: SourceStats[] }> {
  return request("/api/sources");
}

export function suggestSourceName(repo: string): Promise<{ name: string }> {
  return request(`/api/sources/suggest?${new URLSearchParams({ repo }).toString()}`);
}

export function addSource(body: { name: string; repo: string; enabled: boolean; trust: number }): Promise<{ source: { name: string } }> {
  return mutate("/api/sources", body);
}

export function updateSource(body: { name: string; repo?: string; enabled?: boolean; trust?: number }): Promise<{ source: { name: string } }> {
  return mutate("/api/sources/update", body);
}

export function deleteSource(body: { name: string; removeFiles: boolean }): Promise<{ removedSkills: number; removedFiles: boolean }> {
  return mutate("/api/sources/delete", body);
}

export function setDedupeAfterSync(enabled: boolean): Promise<{ dedupeAfterSync: boolean }> {
  return mutate("/api/config/dedupe-after-sync", { enabled });
}

export function fetchSyncStatus(): Promise<{ job: SyncJob | null }> {
  return request("/api/sync/status");
}

export function startSync(body: { sources?: string[]; dedupe?: boolean }): Promise<{ job: SyncJob }> {
  return mutate("/api/sync", body);
}

export function cancelSync(): Promise<{ cancelled: boolean }> {
  return mutate("/api/sync/cancel", {});
}

export function fetchDedupePreview(): Promise<DedupePreview> {
  return request("/api/dedupe/preview");
}

export function applyDedupe(): Promise<{ removed: number; groups: number; total: number }> {
  return mutate("/api/dedupe", {});
}

export function fetchLibrary(): Promise<Library> {
  return request("/api/library");
}

export function toggleLike(ref: SkillRef): Promise<{ liked: boolean }> {
  return mutate("/api/likes/toggle", ref);
}

export function createCollection(body: { name: string; description: string; skills?: SkillRef[] }): Promise<{ collection: { id: string; name: string } }> {
  return mutate("/api/collections", body);
}

export function updateCollection(body: { id: string; name?: string; description?: string }): Promise<{ collection: { id: string } }> {
  return mutate("/api/collections/update", body);
}

export function deleteCollection(id: string): Promise<{ deleted: boolean }> {
  return mutate("/api/collections/delete", { id });
}

export function addToCollection(id: string, skill: SkillRef): Promise<{ collection: { id: string } }> {
  return mutate("/api/collections/add", { id, skill });
}

export function removeFromCollection(id: string, skill: SkillRef): Promise<{ collection: { id: string } }> {
  return mutate("/api/collections/remove", { id, skill });
}

export function exportCollection(id: string): Promise<Record<string, unknown>> {
  return request(`/api/collections/export?${new URLSearchParams({ id }).toString()}`);
}

export function importCollection(data: unknown): Promise<{ collection: { id: string; name: string }; missing: SkillRef[] }> {
  return mutate("/api/collections/import", { data });
}

export function planCollectionInstall(body: { id: string; target: string; scope: string; link: boolean; force: boolean }): Promise<{ collection: { id: string; name: string }; items: CollectionInstallItem[] }> {
  return post("/api/collections/install/plan", body);
}

export function installCollection(body: { id: string; target: string; scope: string; link: boolean; force: boolean; skip: SkillRef[] }): Promise<{ results: CollectionInstallResult[] }> {
  return mutate("/api/collections/install", body);
}

export function planBulkInstall(body: { skills: SkillRef[]; target: string; scope: string; link: boolean; force: boolean }): Promise<{ items: CollectionInstallItem[] }> {
  return post("/api/install/bulk/plan", body);
}

export function bulkInstall(body: { skills: SkillRef[]; target: string; scope: string; link: boolean; force: boolean; skip: SkillRef[] }): Promise<{ results: CollectionInstallResult[] }> {
  return mutate("/api/install/bulk", body);
}

export function toRef(entry: SkillRef): SkillRef {
  return { name: entry.name, source: entry.source, path: entry.path };
}
