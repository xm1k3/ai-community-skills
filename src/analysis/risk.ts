import type { RiskFlags, RiskLevel, SkillFile } from "../types";

export interface AnalysisInput {
  frontmatter: Record<string, unknown>;
  body: string;
  files: SkillFile[];
  bodyLineOffset?: number;
}

export interface TextBlock {
  kind: "code" | "prose";
  language: string;
  text: string;
  origin: string;
  startLine: number;
}

export type RiskCategory = "network" | "destructive" | "confirmation" | "promptInjection" | "secret" | "script" | "exec" | "claudeCodeOnly";

export interface RiskFinding {
  category: RiskCategory;
  label: string;
  file: string;
  line: number;
  match: string;
  excerpt: string;
  blockKind: "code" | "prose" | "frontmatter" | "file";
}

const EXECUTABLE_LANGUAGES = new Set([
  "bash",
  "sh",
  "shell",
  "zsh",
  "fish",
  "console",
  "python",
  "py",
  "javascript",
  "js",
  "typescript",
  "ts",
  "node",
  "ruby",
  "rb",
  "powershell",
  "ps1",
  "perl",
]);

const SCRIPT_EXTENSIONS = new Set([
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".py",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".rb",
  ".pl",
  ".ps1",
]);

export const CLAUDE_CODE_FIELDS = [
  "allowed-tools",
  "context",
  "hooks",
  "agent",
  "model",
  "disable-model-invocation",
  "user-invocable",
  "argument-hint",
];

const NETWORK_CALL_PATTERNS = [
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bfetch\s*\(/,
  /\brequests\.(get|post|put|delete|patch)\s*\(/,
  /\baxios\b/,
  /\bInvoke-WebRequest\b/i,
  /\burllib\.request\b/,
];

const NETWORK_URL_PATTERN = /https?:\/\//i;

const BENIGN_URL_HOSTS = new Set([
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "esm.sh",
  "code.jquery.com",
  "cdn.tailwindcss.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
]);

const URL_HOST_PATTERN = /https?:\/\/([^\s/"'`<>)]+)/gi;

function isBenignHost(rawHost: string): boolean {
  const host = rawHost.replace(/:\d+$/, "").toLowerCase();
  if (BENIGN_URL_HOSTS.has(host)) return true;
  return /(^|\.)example\.(com|org|net)$|\.(test|invalid|localhost)$/.test(host);
}

function lineHasOnlyBenignUrls(line: string): boolean {
  const hosts = [...line.matchAll(URL_HOST_PATTERN)].map((match) => match[1]);
  return hosts.length > 0 && hosts.every(isBenignHost);
}

function networkPatternsFor(kind: TextBlock["kind"]): RegExp[] {
  return kind === "code" ? [...NETWORK_CALL_PATTERNS, NETWORK_URL_PATTERN] : NETWORK_CALL_PATTERNS;
}

const DESTRUCTIVE_PATTERNS = [
  /\brm\b/,
  /\brmdir\b/,
  /\bmv\b/,
  /\bdrop\s+(table|database|schema)\b/i,
  /\btruncate\s+table\b/i,
  /(?<![.\w$-])delete\b/i,
  /\bshred\b/,
  /\bgit\s+push\b[^\n]*\s(-f|--force)\b/,
  /\bgit\s+(reset|clean)\b[^\n]*\s-[a-zA-Z]*[fdx]/,
];

const CONFIRMATION_PATTERNS = [
  /\bconfirm/i,
  /\bconfirmation\b/i,
  /\bare you sure\b/i,
  /\bread\s+-p\b/,
  /\[y\/n\]/i,
  /\(y\/n\)/i,
  /\byes\/no\b/i,
  /\bask(s|ed|ing)?\s+(the\s+)?(user|for\s+permission|for\s+approval|before)\b/i,
  /\bprompt(s|ed)?\s+(the\s+)?user\b/i,
  /\brm\s+-[a-zA-Z]*i\b/,
  /--interactive\b/,
  /\bpermission\b/i,
  /\bapproval\b/i,
  /\bapprove[sd]?\b/i,
  /\bnever\b[^\n.]*\bwithout\s+(asking|confirming|checking)\b/i,
  /\bcheck\s+with\s+the\s+user\b/i,
  /\bverify\s+with\s+the\s+user\b/i,
  /\buser\s+consent\b/i,
];

const PROMPT_INJECTION_PATTERNS = [
  /\bignore\s+(all\s+|any\s+)?(previous|prior|above|earlier|preceding)\s+(instructions?|prompts?|rules|guidelines|directions)\b/i,
  /\bdisregard\s+(all\s+|any\s+)?(your|the|previous|prior|above|earlier)\s+(instructions?|guidelines|rules|system\s+prompt|safety)\b/i,
  /\bforget\s+(all\s+|any\s+)?(your|the|previous|prior|above|earlier)\s+(instructions?|rules|guidelines)\b/i,
  /\boverride\s+(your|the|all|any)\s+(system|safety|previous|prior|existing)\b/i,
  /\bbypass\s+(your|the|all|any)?\s*(safety|security|restrictions?|guardrails?|filters?|policies|policy)\b/i,
  /\byou\s+are\s+no\s+longer\b/i,
  /\byour\s+new\s+system\s+prompt\b/i,
  /\bnew\s+system\s+prompt:\s/i,
  /\bjailbreak/i,
  /\bDAN\s+mode\b/,
  /\b(do\s+not|don't|never)\s+(tell|inform|notify|show|reveal|mention|disclose)(\s+this|\s+it|\s+anything)?\s+(to\s+)?the\s+user\b/i,
  /\bwithout\s+(telling|informing|notifying|asking|alerting)\s+the\s+user\b/i,
  /\bhide\s+(this|these|the|your|any|all)\s+(action|actions|activity|command|commands|step|steps|change|changes|output|file|files)\b/i,
  /\bhidden\s+from\s+the\s+user\b/i,
  /\bsecretly\b/i,
  /\bcovertly\b/i,
  /\b(don't|do\s+not)\s+let\s+the\s+user\s+(know|see|notice)\b/i,
  /\bregardless\s+of\s+(your|the|any)\s+(instructions?|guidelines|rules|scope|policy|policies)\b/i,
  /\boutside\s+(of\s+)?(your|its|the)\s+(stated\s+|declared\s+|original\s+)?scope\b/i,
  /\bpretend\s+(you\s+are|to\s+be|that\s+you)\b/i,
  /\bexfiltrat/i,
  /\bact\s+as\s+(if\s+)?(you\s+have|there\s+are)\s+no\s+(restrictions?|limits?|rules)\b/i,
];

const PIPE_TO_SHELL_PATTERNS = [
  /\b(curl|wget)\b[^\n]*\|[^\n|]*\b(sudo\s+)?(sh|bash|zsh|source|python3?|node|perl)\b/,
  /\bbase64\s+(-d|--decode|-D)\b[^\n|]*\|\s*(sh|bash|zsh|source|eval|python3?|node|perl)\b/,
  /\b(atob|b64decode)\s*\([^\n]*\)[^\n]*\b(eval|exec|spawn|system|subprocess)\b/,
];

const SENSITIVE_NAME = "(KEY|KEYS|APIKEY|TOKEN|TOKENS|SECRET|SECRETS|PASSWORD|PASSWD|CRED|CREDS|CREDENTIAL|CREDENTIALS)";

interface StrongSecretPattern {
  pattern: RegExp;
  material: boolean;
}

const STRONG_SECRET_PATTERNS: StrongSecretPattern[] = [
  { pattern: new RegExp(`\\bprocess\\.env\\.[A-Z0-9_]*${SENSITIVE_NAME}[A-Z0-9_]*\\b`, "i"), material: false },
  { pattern: new RegExp(`\\bos\\.environ(\\.get)?\\s*[\\[(]\\s*["'][A-Z0-9_]*${SENSITIVE_NAME}[A-Z0-9_]*["']`, "i"), material: false },
  { pattern: new RegExp(`\\bgetenv\\s*\\(\\s*["']?[A-Z0-9_]*${SENSITIVE_NAME}[A-Z0-9_]*["']?\\s*\\)`, "i"), material: false },
  { pattern: /\bauthorization:\s*(bearer|basic|token)\b/i, material: false },
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, material: true },
  { pattern: /\b(sk|ghp|gho|ghu|ghs|xoxb|xoxp|xoxa|glpat)[-_][A-Za-z0-9_-]{16,}\b/, material: true },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/, material: true },
  { pattern: /(^|[\s"'`/(])\.env\b(?!\.example|\.sample|\.template)/, material: false },
  { pattern: /\bkeychain\b/i, material: false },
  { pattern: /(^|[\s"'`(=:@])~?\/?(\.aws|\.ssh|\.gnupg|\.netrc|\.npmrc|\.docker\/config\.json)(\/|\b)/, material: true },
];

const WEAK_SECRET_PATTERNS = [
  /\b(api|access|auth|bearer|secret|refresh|oauth|private|session|service|app|client)[ _-]?(key|token|secret)s?\b/i,
  /\b(password|passwd|credentials?|secrets?)\b/i,
  /\b[A-Za-z_]*(api_key|apikey|secret|token|password)[A-Za-z_]*\s*[:=]\s*["'`]?[A-Za-z0-9_\-/+=]{8,}/i,
];

const STRONG_PLACEHOLDER_PATTERN = new RegExp(
  [
    /<[^>\n]{0,60}>/.source,
    /\bREDACTED\b|\bexamples?\b|\bdummy\b|\bfake\b|\bsamples?\b|\bplaceholder\b|\bchangeme\b|x{4,}/.source,
    /EXAMPLE|SAMPLE|DUMMY|PLACEHOLDER|CHANGEME|YOUR_/.source,
    /\byour[-_ ]?[a-z0-9_ -]{0,30}(key|token|secret|password)([-_ ]?here)?\b/.source,
    /\b(key|token|secret|password|passwd|bearer|apikey)[-_ ]?(123+|abc+|xyz+|foo|bar|here)\b/.source,
    /\babc-?123\b/.source,
  ].join("|"),
  "i",
);

const WEAK_PLACEHOLDER_PATTERN = new RegExp(
  [
    STRONG_PLACEHOLDER_PATTERN.source,
    /\b(my|your|user|owner|test|demo|new|old)[-_]?(password|passwd|secret|key|token)\b/.source,
    /\b(password|passwd|secret|key|token)[-_]?(123+|abc|value|here|goes)\b/.source,
    /\bhunter2\b/.source,
  ].join("|"),
  "i",
);

const HYGIENE_PATTERNS = [
  /\bredact/i,
  /\bnever\s+(commit|share|paste|log|store|hardcode|expose|print|echo)\b[^.\n]{0,80}\b(secret|credential|key|token|password)/i,
  /\b(do\s+not|don't)\s+(commit|share|paste|log|store|hardcode|expose|print|echo)\b[^.\n]{0,80}\b(secret|credential|key|token|password)/i,
  /\b(secret|credential|key|token|password)s?\b[^.\n]{0,60}\b(stays?|kept|keep|remain)s?\s+in\s+the\s+environment\b/i,
];

const EXAMPLE_PATH_PATTERN = /(test|mock|example|fixture|sample|demo)/i;

const ENV_VAR_REFERENCE = /\$\{?([A-Z][A-Z0-9_]{1,})\}?/g;

const SENSITIVE_ENV_SEGMENTS = new Set([
  "KEY",
  "KEYS",
  "APIKEY",
  "TOKEN",
  "TOKENS",
  "SECRET",
  "SECRETS",
  "PASSWORD",
  "PASSWD",
  "CRED",
  "CREDS",
  "CREDENTIAL",
  "CREDENTIALS",
]);

const PLACEHOLDER_ENV_NAME = /EXAMPLE|SAMPLE|DUMMY|FAKE|TEST|PLACEHOLDER|YOUR/;

function isSensitiveEnvName(name: string): boolean {
  if (PLACEHOLDER_ENV_NAME.test(name)) return false;
  return name.split("_").some((segment) => SENSITIVE_ENV_SEGMENTS.has(segment));
}

function fileExtension(relativePath: string): string {
  const base = relativePath.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot).toLowerCase();
}

export function isScriptFile(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  if (normalized.startsWith("scripts/") || normalized.includes("/scripts/")) return true;
  return SCRIPT_EXTENSIONS.has(fileExtension(normalized));
}

function flushProse(blocks: TextBlock[], prose: string[], origin: string, startLine: number): void {
  let leading = 0;
  while (leading < prose.length && prose[leading].trim() === "") leading++;
  const text = prose.join("\n").trim();
  if (text !== "") blocks.push({ kind: "prose", language: "", text, origin, startLine: startLine + leading });
  prose.length = 0;
}

export function splitMarkdown(body: string, origin = "SKILL.md", lineOffset = 0): TextBlock[] {
  const blocks: TextBlock[] = [];
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const prose: string[] = [];
  let proseStart = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^\s*(`{3,}|~{3,})\s*([A-Za-z0-9_+#.-]*)/.exec(line);
    if (fence) {
      flushProse(blocks, prose, origin, lineOffset + proseStart + 1);
      const marker = fence[1];
      const language = fence[2].toLowerCase();
      const code: string[] = [];
      const codeStart = i + 1;
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) {
        code.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ kind: "code", language, text: code.join("\n"), origin, startLine: lineOffset + codeStart + 1 });
      proseStart = i;
      continue;
    }
    if (/^\s{0,3}#{1,6}\s/.test(line)) {
      flushProse(blocks, prose, origin, lineOffset + proseStart + 1);
      proseStart = i;
    }
    prose.push(line);
    i++;
  }
  flushProse(blocks, prose, origin, lineOffset + proseStart + 1);
  return blocks;
}

export function collectBlocks(input: AnalysisInput): TextBlock[] {
  const blocks = splitMarkdown(input.body, "SKILL.md", input.bodyLineOffset ?? 0);
  for (const file of input.files) {
    const normalized = file.relativePath.replace(/\\/g, "/");
    if (normalized === "SKILL.md") continue;
    const extension = fileExtension(normalized);
    if (extension === ".md" || extension === ".markdown" || extension === ".mdx") {
      blocks.push(...splitMarkdown(file.content, normalized));
    } else if (isScriptFile(normalized)) {
      blocks.push({ kind: "code", language: extension.replace(".", ""), text: file.content, origin: normalized, startLine: 1 });
    } else {
      blocks.push({ kind: "prose", language: "", text: file.content, origin: normalized, startLine: 1 });
    }
  }
  return blocks;
}

interface PatternHit {
  index: number;
  match: string;
}

function allMatches(text: string, pattern: RegExp): PatternHit[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  const hits: PatternHit[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    hits.push({ index: match.index, match: match[0] });
    if (re.lastIndex === match.index) re.lastIndex++;
  }
  return hits;
}

function lineAt(text: string, index: number): string {
  const start = text.lastIndexOf("\n", index - 1) + 1;
  let end = text.indexOf("\n", index);
  if (end === -1) end = text.length;
  return text.slice(start, end);
}

const QUOTE_PAIRS: Record<string, string> = { '"': '"', "'": "'", "`": "`", "“": "”", "‘": "’", "«": "»" };

function isQuotedMatch(text: string, hit: PatternHit): boolean {
  const before = text.slice(text.lastIndexOf("\n", hit.index - 1) + 1, hit.index).trimEnd();
  const opener = before.slice(-1);
  const closer = QUOTE_PAIRS[opener];
  if (!closer) return false;
  let lineEnd = text.indexOf("\n", hit.index);
  if (lineEnd === -1) lineEnd = text.length;
  return text.slice(hit.index + hit.match.length, lineEnd).includes(closer);
}

function firstHit(text: string, pattern: RegExp, accept: (hit: PatternHit) => boolean): PatternHit | null {
  for (const hit of allMatches(text, pattern)) {
    if (accept(hit)) return hit;
  }
  return null;
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

interface SecretHit extends PatternHit {
  strong: boolean;
  material: boolean;
  label: string;
}

function secretHitsFor(block: TextBlock): SecretHit[] {
  const hits: SecretHit[] = [];
  const hygiene = matchesAny(block.text, HYGIENE_PATTERNS);
  for (const { pattern, material } of STRONG_SECRET_PATTERNS) {
    const hit = firstHit(block.text, pattern, (candidate) => !STRONG_PLACEHOLDER_PATTERN.test(lineAt(block.text, candidate.index)));
    if (hit) hits.push({ ...hit, strong: true, material, label: "secret or credential reference" });
  }
  for (const hit of allMatches(block.text, ENV_VAR_REFERENCE)) {
    const name = /\$\{?([A-Z][A-Z0-9_]{1,})\}?/.exec(hit.match)?.[1] ?? "";
    if (!isSensitiveEnvName(name)) continue;
    if (STRONG_PLACEHOLDER_PATTERN.test(lineAt(block.text, hit.index))) continue;
    hits.push({ ...hit, strong: true, material: false, label: "sensitive environment variable reference" });
    break;
  }
  if (block.kind === "code" && !hygiene) {
    const strongLines = new Set(hits.map((hit) => block.text.lastIndexOf("\n", hit.index - 1) + 1));
    for (const pattern of WEAK_SECRET_PATTERNS) {
      const hit = firstHit(block.text, pattern, (candidate) => {
        if (strongLines.has(block.text.lastIndexOf("\n", candidate.index - 1) + 1)) return false;
        return !WEAK_PLACEHOLDER_PATTERN.test(lineAt(block.text, candidate.index));
      });
      if (hit) hits.push({ ...hit, strong: false, material: false, label: "secret keyword inside code" });
    }
  }
  return hits;
}

const NEGATION_CONTEXT_PATTERN = /\b(must\s+not|may\s+not|cannot|can't|never|avoid|prevent(s|ed|ing)?|does\s+not|doesn't|do\s+not|don't|should\s+not|shouldn't|will\s+not|won't|prohibit(s|ed)?|forbidden|not\s+allowed|blocks?|blocked|protects?(\s+against)?|defends?(\s+against)?|refuse[sd]?)\b/i;

function sentenceBefore(text: string, index: number): string {
  let start = index;
  while (start > 0 && !".!?\n".includes(text[start - 1])) start--;
  return text.slice(start, index);
}

function injectionHitsFor(block: TextBlock): PatternHit[] {
  const hits: PatternHit[] = [];
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    const hit = firstHit(
      block.text,
      pattern,
      (candidate) => !isQuotedMatch(block.text, candidate) && !NEGATION_CONTEXT_PATTERN.test(sentenceBefore(block.text, candidate.index)),
    );
    if (hit) hits.push(hit);
  }
  return hits;
}

export function detectScripts(input: AnalysisInput, blocks: TextBlock[]): boolean {
  if (input.files.some((file) => isScriptFile(file.relativePath))) return true;
  return blocks.some(
    (block) => block.kind === "code" && EXECUTABLE_LANGUAGES.has(block.language) && block.text.trim() !== "",
  );
}

function networkHitsFor(block: TextBlock): PatternHit[] {
  const hits: PatternHit[] = [];
  for (const pattern of networkPatternsFor(block.kind)) {
    const hit = firstHit(block.text, pattern, (candidate) => !lineHasOnlyBenignUrls(lineAt(block.text, candidate.index)));
    if (hit) hits.push(hit);
  }
  return hits;
}

export function detectNetworkCalls(blocks: TextBlock[]): boolean {
  return blocks.some((block) => networkHitsFor(block).length > 0);
}

export function detectDestructiveOps(blocks: TextBlock[]): { destructiveOps: boolean; confirmsBeforeDestructive: boolean } {
  let destructive = 0;
  let unconfirmed = 0;
  for (const block of blocks) {
    if (block.kind !== "code") continue;
    if (!matchesAny(block.text, DESTRUCTIVE_PATTERNS)) continue;
    destructive++;
    if (!matchesAny(block.text, CONFIRMATION_PATTERNS)) unconfirmed++;
  }
  return { destructiveOps: destructive > 0, confirmsBeforeDestructive: destructive > 0 && unconfirmed === 0 };
}

export function detectClaudeCodeOnly(frontmatter: Record<string, unknown>): boolean {
  return CLAUDE_CODE_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(frontmatter, field));
}

export function detectPromptInjection(blocks: TextBlock[]): boolean {
  return blocks.some((block) => injectionHitsFor(block).length > 0);
}

export function detectPipesToShell(blocks: TextBlock[]): boolean {
  return blocks.some((block) => matchesAny(block.text, PIPE_TO_SHELL_PATTERNS));
}

export function detectSecretReferences(blocks: TextBlock[]): { secretReferences: boolean; secretInCode: boolean } {
  let secretReferences = false;
  let secretInCode = false;
  for (const block of blocks) {
    const hits = secretHitsFor(block);
    if (hits.length === 0) continue;
    secretReferences = true;
    if (block.kind !== "code" || EXAMPLE_PATH_PATTERN.test(block.origin)) continue;
    const inScriptFile = !block.origin.endsWith(".md");
    const materialWithNetwork = hits.some((hit) => hit.material) && networkHitsFor(block).length > 0;
    if ((inScriptFile && hits.some((hit) => hit.strong)) || materialWithNetwork) {
      secretInCode = true;
    }
  }
  return { secretReferences, secretInCode };
}

export function deriveRiskLevel(flags: Omit<RiskFlags, "riskLevel"> & { secretInCode?: boolean }): RiskLevel {
  const secretInCode = flags.secretInCode ?? false;
  if (flags.promptInjectionSuspected) return "high";
  if (flags.pipesToShell) return "high";
  if (secretInCode && flags.networkCalls) return "high";
  if (secretInCode) return "medium";
  if (flags.destructiveOps && !flags.confirmsBeforeDestructive) return "medium";
  if (flags.networkCalls && (flags.hasScripts || flags.secretReferences)) return "medium";
  return "low";
}

export function analyzeSkill(input: AnalysisInput): RiskFlags {
  const blocks = collectBlocks(input);
  const destructive = detectDestructiveOps(blocks);
  const secrets = detectSecretReferences(blocks);
  const partial = {
    hasScripts: detectScripts(input, blocks),
    networkCalls: detectNetworkCalls(blocks),
    destructiveOps: destructive.destructiveOps,
    confirmsBeforeDestructive: destructive.confirmsBeforeDestructive,
    claudeCodeOnly: detectClaudeCodeOnly(input.frontmatter),
    promptInjectionSuspected: detectPromptInjection(blocks),
    secretReferences: secrets.secretReferences,
    pipesToShell: detectPipesToShell(blocks),
  };
  return { ...partial, riskLevel: deriveRiskLevel({ ...partial, secretInCode: secrets.secretInCode }) };
}

export function riskReasons(flags: RiskFlags): string[] {
  const reasons: string[] = [];
  if (flags.promptInjectionSuspected) reasons.push("prompt injection pattern detected");
  if (flags.pipesToShell) reasons.push("pipes downloaded or decoded content into an interpreter");
  if (flags.destructiveOps && !flags.confirmsBeforeDestructive) {
    reasons.push("destructive command without a paired confirmation");
  } else if (flags.destructiveOps) {
    reasons.push("destructive command guarded by a confirmation");
  }
  if (flags.secretReferences) reasons.push("references secrets, credentials, or environment variables");
  if (flags.networkCalls) reasons.push("performs or references network calls");
  if (flags.hasScripts) reasons.push("ships scripts or executable code blocks");
  if (flags.claudeCodeOnly) reasons.push("uses Claude Code specific frontmatter fields");
  return reasons;
}

const MAX_FINDINGS = 300;

function lineOfIndex(block: TextBlock, index: number): number {
  let line = block.startLine;
  for (let i = 0; i < index && i < block.text.length; i++) if (block.text.charCodeAt(i) === 10) line++;
  return line;
}

function lineExcerpt(text: string, index: number): string {
  const start = text.lastIndexOf("\n", index - 1) + 1;
  let end = text.indexOf("\n", index);
  if (end === -1) end = text.length;
  const line = text.slice(start, end).trim();
  return line.length > 200 ? `${line.slice(0, 197)}...` : line;
}

function toFinding(block: TextBlock, hit: PatternHit, category: RiskCategory, label: string): RiskFinding {
  return {
    category,
    label,
    file: block.origin,
    line: lineOfIndex(block, hit.index),
    match: hit.match.trim(),
    excerpt: lineExcerpt(block.text, hit.index),
    blockKind: block.kind,
  };
}

function findingsFor(block: TextBlock, patterns: RegExp[], category: RiskCategory, label: string): RiskFinding[] {
  const findings: RiskFinding[] = [];
  for (const pattern of patterns) {
    const match = pattern.exec(block.text);
    if (!match) continue;
    findings.push(toFinding(block, { index: match.index, match: match[0] }, category, label));
  }
  return findings;
}

export function explainRisk(input: AnalysisInput): RiskFinding[] {
  const findings: RiskFinding[] = [];
  const blocks = collectBlocks(input);
  for (const field of CLAUDE_CODE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input.frontmatter, field)) {
      findings.push({ category: "claudeCodeOnly", label: "Claude Code specific frontmatter field", file: "SKILL.md", line: 1, match: field, excerpt: `${field}: ${String(input.frontmatter[field]).slice(0, 120)}`, blockKind: "frontmatter" });
    }
  }
  for (const file of input.files) {
    if (isScriptFile(file.relativePath)) {
      findings.push({ category: "script", label: "script file shipped with the skill", file: file.relativePath, line: 1, match: file.relativePath, excerpt: file.content.split("\n")[0].trim().slice(0, 200), blockKind: "file" });
    }
  }
  for (const block of blocks) {
    if (block.kind === "code" && EXECUTABLE_LANGUAGES.has(block.language) && block.text.trim() !== "" && block.origin.endsWith(".md")) {
      findings.push({ category: "script", label: `executable code block (${block.language})`, file: block.origin, line: block.startLine, match: block.language, excerpt: block.text.trim().split("\n")[0].slice(0, 200), blockKind: "code" });
    }
    for (const hit of networkHitsFor(block)) {
      findings.push(toFinding(block, hit, "network", "network call reference"));
    }
    findings.push(...findingsFor(block, PIPE_TO_SHELL_PATTERNS, "exec", "pipes downloaded or decoded content into an interpreter"));
    if (block.kind === "code") {
      const destructive = findingsFor(block, DESTRUCTIVE_PATTERNS, "destructive", "destructive operation");
      if (destructive.length > 0) {
        const confirmations = findingsFor(block, CONFIRMATION_PATTERNS, "confirmation", "confirmation pattern in the same block");
        const suffix = confirmations.length > 0 ? " (confirmation found in the same block)" : " (no confirmation in the same block)";
        findings.push(...destructive.map((finding) => ({ ...finding, label: finding.label + suffix })), ...confirmations);
      }
    }
    for (const hit of injectionHitsFor(block)) {
      findings.push(toFinding(block, hit, "promptInjection", "prompt injection pattern"));
    }
    for (const hit of secretHitsFor(block)) {
      findings.push(toFinding(block, hit, "secret", hit.label));
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  const seen = new Set<string>();
  const unique = findings.filter((finding) => {
    const key = `${finding.category}\u0000${finding.file}\u0000${finding.excerpt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.slice(0, MAX_FINDINGS);
}
