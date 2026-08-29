export type RiskLevel = "low" | "medium" | "high";

export type InstallTarget = "claude-code" | "codex" | "web";

export type InstallScope = "personal" | "project";

export interface SourceConfig {
  name: string;
  repo: string;
  enabled: boolean;
  trust?: number;
}

export interface EmbeddingConfig {
  provider: string;
  model?: string;
  baseUrl?: string;
  apiKeyEnv?: string;
}

export interface Config {
  sources: SourceConfig[];
  embedding: EmbeddingConfig | null;
  dedupeAfterSync?: boolean;
}

export interface SkillRef {
  name: string;
  source: string;
  path: string;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  skills: SkillRef[];
  createdAt: string;
  updatedAt: string;
}

export interface CollectionsState {
  likes: SkillRef[];
  collections: Collection[];
}

export interface SourceReputation {
  stars: number;
  lastActivityDate: string;
  singleMaintainer: boolean;
  hasCi: boolean;
}

export interface RiskFlags {
  riskLevel: RiskLevel;
  hasScripts: boolean;
  networkCalls: boolean;
  destructiveOps: boolean;
  confirmsBeforeDestructive: boolean;
  claudeCodeOnly: boolean;
  promptInjectionSuspected: boolean;
  secretReferences: boolean;
}

export interface UpstreamSetup {
  type: string;
  summary: string;
}

export interface SkillEntry extends RiskFlags {
  name: string;
  description: string;
  category: string;
  source: string;
  repository: string;
  path: string;
  lastCommitHash: string;
  lastCommitDate: string;
  contentHash: string;
  sourceReputation: SourceReputation;
  lines: number;
  tokenEstimate: number;
  tags?: string[];
  tools?: string[];
  upstreamCategory?: string;
  upstreamRisk?: string;
  setup?: UpstreamSetup;
  author?: string;
  qualityScore?: number;
  normalizedHash?: string;
}

export interface InstalledRecord {
  name: string;
  source: string;
  path?: string;
  target: InstallTarget;
  scope: InstallScope | null;
  installPath: string;
  contentHash: string;
  link: boolean;
  installedAt: string;
}

export interface InstalledState {
  installed: InstalledRecord[];
}

export interface EmbeddingRecord {
  name: string;
  source: string;
  contentHash: string;
  descriptionHash: string;
  model: string;
  vector: number[];
}

export type EmbeddingsFile = Record<string, EmbeddingRecord>;

export interface SkillFile {
  relativePath: string;
  content: string;
}

export interface ScannedSkill {
  name: string;
  description: string;
  frontmatter: Record<string, unknown>;
  body: string;
  dir: string;
  relativePath: string;
  files: SkillFile[];
  category: string;
  lines: number;
  tokenEstimate: number;
  contentHash: string;
}
