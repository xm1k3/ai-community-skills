import { sha256 } from "./hash";
import { skillKey } from "./index/builder";
import type { EmbeddingConfig, EmbeddingsFile, SkillEntry } from "./types";

export interface EmbeddingProvider {
  name: string;
  model: string;
  embed(texts: string[]): Promise<number[][]>;
}

export const EMBEDDING_CONFIG_HINT = [
  "No embedding provider is configured.",
  'Add an "embedding" block to config.json, for example:',
  '  "embedding": { "provider": "openai", "model": "text-embedding-3-small", "apiKeyEnv": "OPENAI_API_KEY" }',
  '  "embedding": { "provider": "ollama", "model": "nomic-embed-text", "baseUrl": "http://127.0.0.1:11434" }',
  '  "embedding": { "provider": "openai-compatible", "baseUrl": "https://host/v1", "model": "model-name", "apiKeyEnv": "MY_KEY" }',
  'Then run "acs sync" to compute embeddings.',
].join("\n");

const BATCH_SIZE = 64;

async function postJson(url: string, body: unknown, headers: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Embedding request to ${url} failed with status ${response.status}${text ? `: ${text.slice(0, 300)}` : ""}`);
  }
  return response.json();
}

function apiKeyFromEnv(config: EmbeddingConfig, fallbackEnv: string | null): string | null {
  const envName = config.apiKeyEnv ?? fallbackEnv;
  if (!envName) return null;
  const value = process.env[envName];
  if (!value || value.trim() === "") {
    throw new Error(`Environment variable ${envName} is not set. It is required by the "${config.provider}" embedding provider.`);
  }
  return value;
}

function openAiProvider(config: EmbeddingConfig, defaults: { baseUrl: string; model: string; apiKeyEnv: string | null }): EmbeddingProvider {
  const baseUrl = (config.baseUrl ?? defaults.baseUrl).replace(/\/+$/, "");
  const model = config.model ?? defaults.model;
  const apiKey = apiKeyFromEnv(config, defaults.apiKeyEnv);
  const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  return {
    name: config.provider,
    model,
    async embed(texts) {
      const data = (await postJson(`${baseUrl}/embeddings`, { model, input: texts }, headers)) as {
        data?: { index?: number; embedding?: number[] }[];
      };
      if (!data.data || data.data.length !== texts.length) {
        throw new Error("Embedding provider returned an unexpected number of vectors");
      }
      const ordered = [...data.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      return ordered.map((item) => item.embedding ?? []);
    },
  };
}

function ollamaProvider(config: EmbeddingConfig): EmbeddingProvider {
  const baseUrl = (config.baseUrl ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
  const model = config.model ?? "nomic-embed-text";
  return {
    name: "ollama",
    model,
    async embed(texts) {
      const data = (await postJson(`${baseUrl}/api/embed`, { model, input: texts }, {})) as { embeddings?: number[][] };
      if (!data.embeddings || data.embeddings.length !== texts.length) {
        throw new Error("Ollama returned an unexpected number of vectors");
      }
      return data.embeddings;
    },
  };
}

export function createEmbeddingProvider(config: EmbeddingConfig | null): EmbeddingProvider | null {
  if (!config || !config.provider) return null;
  switch (config.provider) {
    case "openai":
      return openAiProvider(config, { baseUrl: "https://api.openai.com/v1", model: "text-embedding-3-small", apiKeyEnv: "OPENAI_API_KEY" });
    case "openai-compatible": {
      if (!config.baseUrl) throw new Error('The "openai-compatible" provider requires "baseUrl" in config.json');
      if (!config.model) throw new Error('The "openai-compatible" provider requires "model" in config.json');
      return openAiProvider(config, { baseUrl: config.baseUrl, model: config.model, apiKeyEnv: null });
    }
    case "ollama":
      return ollamaProvider(config);
    default:
      throw new Error(`Unknown embedding provider "${config.provider}". Supported: openai, openai-compatible, ollama`);
  }
}

export function embeddingText(entry: Pick<SkillEntry, "name" | "description" | "category" | "tags">): string {
  const tags = entry.tags && entry.tags.length > 0 ? ` [${entry.tags.join(", ")}]` : "";
  return `${entry.name}: ${entry.description}${tags}`;
}

export function descriptionHash(entry: Pick<SkillEntry, "name" | "description" | "category" | "tags">): string {
  return sha256(embeddingText(entry));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface EmbeddingSyncResult {
  embeddings: EmbeddingsFile;
  computed: number;
  reused: number;
  removed: number;
}

export async function syncEmbeddings(
  index: SkillEntry[],
  provider: EmbeddingProvider,
  existing: EmbeddingsFile,
): Promise<EmbeddingSyncResult> {
  const next: EmbeddingsFile = {};
  const pending: { key: string; entry: SkillEntry; hash: string }[] = [];
  let reused = 0;
  for (const entry of index) {
    const key = skillKey(entry);
    const hash = descriptionHash(entry);
    const previous = existing[key];
    if (previous && previous.descriptionHash === hash && previous.model === provider.model && previous.vector.length > 0) {
      next[key] = { ...previous, contentHash: entry.contentHash };
      reused++;
    } else {
      pending.push({ key, entry, hash });
    }
  }
  for (let start = 0; start < pending.length; start += BATCH_SIZE) {
    const batch = pending.slice(start, start + BATCH_SIZE);
    const vectors = await provider.embed(batch.map((item) => embeddingText(item.entry)));
    batch.forEach((item, position) => {
      next[item.key] = {
        name: item.entry.name,
        source: item.entry.source,
        contentHash: item.entry.contentHash,
        descriptionHash: item.hash,
        model: provider.model,
        vector: vectors[position] ?? [],
      };
    });
  }
  const removed = Object.keys(existing).filter((key) => !(key in next)).length;
  return { embeddings: next, computed: pending.length, reused, removed };
}

export interface SemanticHit {
  entry: SkillEntry;
  similarity: number;
}

export function rankBySimilarity(index: SkillEntry[], embeddings: EmbeddingsFile, queryVector: number[], limit: number): SemanticHit[] {
  const hits: SemanticHit[] = [];
  for (const entry of index) {
    const record = embeddings[skillKey(entry)];
    if (!record || record.vector.length === 0) continue;
    hits.push({ entry, similarity: cosineSimilarity(queryVector, record.vector) });
  }
  hits.sort((a, b) => b.similarity - a.similarity);
  return hits.slice(0, limit);
}
