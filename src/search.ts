import type { SkillEntry } from "./types";

function subsequenceScore(query: string, text: string): number {
  let position = 0;
  let score = 0;
  let streak = 0;
  for (const char of query) {
    const found = text.indexOf(char, position);
    if (found === -1) return 0;
    if (found === position) {
      streak++;
      score += 2 + streak;
    } else {
      streak = 0;
      score += 1;
    }
    position = found + 1;
  }
  return score / (query.length * 4);
}

export type MatchType = "exact" | "word" | "substring" | "fuzzy" | "none";

export function fuzzyMatch(query: string, text: string): { score: number; type: MatchType } {
  const needle = query.toLowerCase().trim();
  const haystack = text.toLowerCase();
  if (needle === "" || haystack === "") return { score: 0, type: "none" };
  if (haystack === needle) return { score: 1, type: "exact" };
  const index = haystack.indexOf(needle);
  if (index !== -1) {
    const boundary = index === 0 || /[^a-z0-9]/.test(haystack[index - 1]);
    return boundary ? { score: 0.9, type: "word" } : { score: 0.75, type: "substring" };
  }
  if (needle.length < 3) return { score: 0, type: "none" };
  const bestWindow = haystack.split(/[^a-z0-9]+/).reduce((best, word) => {
    if (word === "") return best;
    return Math.max(best, subsequenceScore(needle, word));
  }, 0);
  const whole = subsequenceScore(needle, haystack);
  const score = Math.max(bestWindow * 0.7, whole * 0.4);
  return { score, type: score > 0 ? "fuzzy" : "none" };
}

export function fuzzyScore(query: string, text: string): number {
  return fuzzyMatch(query, text).score;
}

export interface TermExplanation {
  term: string;
  name: { score: number; type: MatchType };
  description: { score: number; type: MatchType };
  category: { score: number; type: MatchType };
  best: "name" | "description" | "category" | "none";
  contribution: number;
}

export interface SearchExplanation {
  terms: TermExplanation[];
  matchedTerms: number;
  totalTerms: number;
  score: number;
}

const NAME_WEIGHT = 2;
const CATEGORY_WEIGHT = 0.5;
const MATCH_THRESHOLD = 0.15;

export function splitTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term !== "");
}

export function explainSearch(entry: SkillEntry, query: string): SearchExplanation {
  const terms = splitTerms(query);
  let total = 0;
  let matched = 0;
  const categoryTexts = [entry.category, ...(entry.tags ?? [])];
  const explanations: TermExplanation[] = terms.map((term) => {
    const name = fuzzyMatch(term, entry.name);
    const description = fuzzyMatch(term, entry.description);
    const category = categoryTexts.reduce<{ score: number; type: MatchType }>(
      (best, text) => {
        const match = fuzzyMatch(term, text);
        return match.score > best.score ? match : best;
      },
      { score: 0, type: "none" },
    );
    const weighted = { name: name.score * NAME_WEIGHT, description: description.score, category: category.score * CATEGORY_WEIGHT };
    let best: TermExplanation["best"] = "none";
    let contribution = 0;
    for (const field of ["name", "description", "category"] as const) {
      if (weighted[field] > contribution) {
        contribution = weighted[field];
        best = field;
      }
    }
    if (contribution > MATCH_THRESHOLD) matched++;
    total += contribution;
    return { term, name, description, category, best, contribution };
  });
  const coverage = terms.length === 0 ? 0 : matched / terms.length;
  const score = terms.length === 0 || matched === 0 ? 0 : Math.min(1, ((total / terms.length) * coverage) / 2);
  return { terms: explanations, matchedTerms: matched, totalTerms: terms.length, score };
}

export interface SearchHit {
  entry: SkillEntry;
  score: number;
}

export function searchSkills(index: SkillEntry[], query: string, limit = 25): SearchHit[] {
  if (splitTerms(query).length === 0) return [];
  const hits: SearchHit[] = [];
  for (const entry of index) {
    const explanation = explainSearch(entry, query);
    if (explanation.matchedTerms === 0) continue;
    hits.push({ entry, score: explanation.score });
  }
  hits.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
  return hits.slice(0, limit);
}
