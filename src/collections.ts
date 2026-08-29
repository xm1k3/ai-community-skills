import { randomBytes } from "node:crypto";
import { loadCollections, saveCollections } from "./store";
import type { Collection, CollectionsState, SkillEntry, SkillRef } from "./types";

export function refKey(ref: SkillRef): string {
  return `${ref.source} ${ref.path} ${ref.name}`;
}

export function sameRef(a: SkillRef, b: SkillRef): boolean {
  return a.source === b.source && a.path === b.path && a.name === b.name;
}

export function toRef(entry: Pick<SkillEntry, "name" | "source" | "path">): SkillRef {
  return { name: entry.name, source: entry.source, path: entry.path };
}

export function normalizeRef(raw: unknown): SkillRef {
  if (!raw || typeof raw !== "object") throw new Error("A skill reference with name, source, and path is required");
  const value = raw as Record<string, unknown>;
  if (typeof value.name !== "string" || value.name === "") throw new Error("Skill reference is missing a name");
  if (typeof value.source !== "string" || value.source === "") throw new Error("Skill reference is missing a source");
  return { name: value.name, source: value.source, path: typeof value.path === "string" ? value.path : "" };
}

function now(): string {
  return new Date().toISOString();
}

function validateName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") throw new Error("Group name is required");
  if (trimmed.length > 80) throw new Error("Group name is too long");
  return trimmed;
}

function dedupeRefs(refs: SkillRef[]): SkillRef[] {
  const seen = new Set<string>();
  const result: SkillRef[] = [];
  for (const ref of refs) {
    const key = refKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}

function requireCollection(state: CollectionsState, id: string): Collection {
  const collection = state.collections.find((item) => item.id === id);
  if (!collection) throw new Error(`Group "${id}" was not found`);
  return collection;
}

function replace(state: CollectionsState, updated: Collection): CollectionsState {
  const next = { ...state, collections: state.collections.map((item) => (item.id === updated.id ? { ...updated, updatedAt: now() } : item)) };
  saveCollections(next);
  return next;
}

export function toggleLike(ref: SkillRef, state: CollectionsState = loadCollections()): { liked: boolean; state: CollectionsState } {
  const exists = state.likes.some((item) => sameRef(item, ref));
  const likes = exists ? state.likes.filter((item) => !sameRef(item, ref)) : [...state.likes, ref];
  const next = { ...state, likes };
  saveCollections(next);
  return { liked: !exists, state: next };
}

export function createCollection(input: { name: string; description?: string; skills?: SkillRef[] }, state: CollectionsState = loadCollections()): Collection {
  const name = validateName(input.name);
  if (state.collections.some((collection) => collection.name.toLowerCase() === name.toLowerCase())) throw new Error(`A group named "${name}" already exists`);
  const collection: Collection = {
    id: randomBytes(6).toString("hex"),
    name,
    description: (input.description ?? "").trim(),
    skills: dedupeRefs(input.skills ?? []),
    createdAt: now(),
    updatedAt: now(),
  };
  saveCollections({ ...state, collections: [...state.collections, collection] });
  return collection;
}

export function updateCollection(id: string, patch: { name?: string; description?: string }, state: CollectionsState = loadCollections()): Collection {
  const collection = requireCollection(state, id);
  const name = patch.name !== undefined ? validateName(patch.name) : collection.name;
  if (state.collections.some((item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase())) throw new Error(`A group named "${name}" already exists`);
  const updated = { ...collection, name, description: patch.description !== undefined ? patch.description.trim() : collection.description };
  return requireCollection(replace(state, updated), id);
}

export function deleteCollection(id: string, state: CollectionsState = loadCollections()): void {
  requireCollection(state, id);
  saveCollections({ ...state, collections: state.collections.filter((item) => item.id !== id) });
}

export function addToCollection(id: string, ref: SkillRef, state: CollectionsState = loadCollections()): Collection {
  const collection = requireCollection(state, id);
  if (collection.skills.some((item) => sameRef(item, ref))) return collection;
  return requireCollection(replace(state, { ...collection, skills: [...collection.skills, ref] }), id);
}

export function removeFromCollection(id: string, ref: SkillRef, state: CollectionsState = loadCollections()): Collection {
  const collection = requireCollection(state, id);
  return requireCollection(replace(state, { ...collection, skills: collection.skills.filter((item) => !sameRef(item, ref)) }), id);
}

export interface CollectionExport {
  format: "acs-collection";
  version: 1;
  name: string;
  description: string;
  skills: (SkillRef & { repository?: string })[];
}

export function exportCollection(collection: Collection, index: SkillEntry[]): CollectionExport {
  return {
    format: "acs-collection",
    version: 1,
    name: collection.name,
    description: collection.description,
    skills: collection.skills.map((ref) => {
      const entry = index.find((item) => item.source === ref.source && item.path === ref.path && item.name === ref.name);
      return entry ? { ...ref, repository: entry.repository } : ref;
    }),
  };
}

export function parseCollectionImport(raw: unknown): { name: string; description: string; skills: SkillRef[] } {
  if (!raw || typeof raw !== "object") throw new Error("Import data must be a JSON object");
  const value = raw as Record<string, unknown>;
  if (value.format !== "acs-collection") throw new Error('Import data is not an acs collection (expected "format": "acs-collection")');
  if (typeof value.name !== "string") throw new Error("Import data is missing a name");
  if (!Array.isArray(value.skills)) throw new Error("Import data is missing a skills array");
  return {
    name: value.name,
    description: typeof value.description === "string" ? value.description : "",
    skills: value.skills.map(normalizeRef),
  };
}
