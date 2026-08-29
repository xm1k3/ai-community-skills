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

export type RiskCategory = "network" | "destructive" | "confirmation" | "promptInjection" | "secret" | "script" | "claudeCodeOnly";

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
  /\bnew\s+system\s+prompt\b/i,
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

const SECRET_PATTERNS = [
  /\bprocess\.env\.[A-Za-z_]/,
  /\bos\.environ\b/,
  /\bgetenv\s*\(/i,
  /\bauthorization:\s*(bearer|basic|token)\b/i,
  /\bbase64\s+(-d|--decode|-D)\b[^\n|]*\|\s*(sh|bash|zsh|source|eval|python3?|node|perl)\b/,
  /\b(atob|b64decode)\s*\([^\n]*\)[^\n]*\b(eval|exec|spawn|system|subprocess)\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(sk|ghp|gho|ghu|ghs|xoxb|xoxp|xoxa|glpat)[-_][A-Za-z0-9_-]{16,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /(^|[\s"'`/(])\.env\b(?!\.example|\.sample|\.template)/,
  /\bkeychain\b/i,
  /(^|[\s"'`(=:])~?\/?(\.aws|\.ssh|\.gnupg|\.netrc|\.npmrc|\.docker\/config\.json)(\/|\b)/,
];

const SECRET_CODE_PATTERNS = [
  /\b(api|access|auth|bearer|secret|refresh|oauth|private|session|service|app|client)[ _-]?(key|token|secret)s?\b/i,
  /\b(password|passwd|credentials?|secrets?)\b/i,
  /\b[A-Za-z_]*(api_key|apikey|secret|token|password)[A-Za-z_]*\s*[:=]\s*["'`]?[A-Za-z0-9_\-/+=]{8,}/i,
];

const BENIGN_ENV_VARS = new Set([
  "HOME",
  "PATH",
  "PWD",
  "OLDPWD",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "TMP",
  "TEMP",
  "EDITOR",
  "VISUAL",
  "PAGER",
  "LANG",
  "LC_ALL",
  "TERM",
  "CWD",
  "PS1",
  "HOSTNAME",
  "HOST",
  "PORT",
  "UID",
  "GID",
  "EUID",
  "PPID",
  "DISPLAY",
  "NODE_ENV",
  "CI",
  "DEBUG",
  "VERBOSE",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "SHLVL",
  "IFS",
  "RANDOM",
  "PIPESTATUS",
  "LINENO",
  "BASH_SOURCE",
  "SECONDS",
  "OSTYPE",
  "MACHTYPE",
  "HOSTTYPE",
  "COLUMNS",
  "LINES",
  "GOPATH",
  "GOROOT",
  "JAVA_HOME",
  "PYTHONPATH",
  "VIRTUAL_ENV",
  "NVM_DIR",
  "CARGO_HOME",
  "RUSTUP_HOME",
  "PROJECT_DIR",
  "PROJECT_ROOT",
  "WORKSPACE",
  "WORKDIR",
  "ARGUMENTS",
  "ARGS",
  "OUTPUT_DIR",
  "INPUT_DIR",
  "BRANCH",
  "BRANCH_NAME",
  "REPO",
  "REPO_ROOT",
  "FILE",
  "DIR",
  "NAME",
  "VERSION",
  "CLAUDE_PROJECT_DIR",
  "CLAUDE_SKILL_DIR",
  "CLAUDE_PLUGIN_ROOT",
  "CLAUDE_SESSION_ID",
  "CODEX_HOME",
  "SKILL_DIR",
]);

const ENV_VAR_REFERENCE = /\$\{?([A-Z][A-Z0-9_]{1,})\}?/g;

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

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function referencesSensitiveEnvVar(text: string): boolean {
  ENV_VAR_REFERENCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ENV_VAR_REFERENCE.exec(text)) !== null) {
    if (!BENIGN_ENV_VARS.has(match[1])) return true;
  }
  return false;
}

export function detectScripts(input: AnalysisInput, blocks: TextBlock[]): boolean {
  if (input.files.some((file) => isScriptFile(file.relativePath))) return true;
  return blocks.some(
    (block) => block.kind === "code" && EXECUTABLE_LANGUAGES.has(block.language) && block.text.trim() !== "",
  );
}

export function detectNetworkCalls(blocks: TextBlock[]): boolean {
  return blocks.some((block) => matchesAny(block.text, networkPatternsFor(block.kind)));
}

export function detectDestructiveOps(blocks: TextBlock[]): { destructiveOps: boolean; confirmsBeforeDestructive: boolean } {
  let destructive = 0;
  let unconfirmed = 0;
  for (const block of blocks) {
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
  return blocks.some((block) => matchesAny(block.text, PROMPT_INJECTION_PATTERNS));
}

export function detectSecretReferences(blocks: TextBlock[]): { secretReferences: boolean; secretInCode: boolean } {
  let secretReferences = false;
  let secretInCode = false;
  for (const block of blocks) {
    const hit =
      matchesAny(block.text, SECRET_PATTERNS) ||
      referencesSensitiveEnvVar(block.text) ||
      (block.kind === "code" && matchesAny(block.text, SECRET_CODE_PATTERNS));
    if (!hit) continue;
    secretReferences = true;
    if (block.kind === "code") secretInCode = true;
  }
  return { secretReferences, secretInCode };
}

export function deriveRiskLevel(flags: Omit<RiskFlags, "riskLevel"> & { secretInCode?: boolean }): RiskLevel {
  const secretHigh = flags.secretInCode ?? flags.secretReferences;
  if (flags.destructiveOps && !flags.confirmsBeforeDestructive) return "high";
  if (flags.promptInjectionSuspected || secretHigh) return "high";
  if (flags.destructiveOps || flags.networkCalls || flags.secretReferences) return "medium";
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
  };
  return { ...partial, riskLevel: deriveRiskLevel({ ...partial, secretInCode: secrets.secretInCode }) };
}

export function riskReasons(flags: RiskFlags): string[] {
  const reasons: string[] = [];
  if (flags.destructiveOps && !flags.confirmsBeforeDestructive) {
    reasons.push("destructive operation without a paired confirmation");
  } else if (flags.destructiveOps) {
    reasons.push("destructive operation guarded by a confirmation");
  }
  if (flags.promptInjectionSuspected) reasons.push("prompt injection pattern detected");
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

function findingsFor(block: TextBlock, patterns: RegExp[], category: RiskCategory, label: string): RiskFinding[] {
  const findings: RiskFinding[] = [];
  for (const pattern of patterns) {
    const match = pattern.exec(block.text);
    if (!match) continue;
    findings.push({
      category,
      label,
      file: block.origin,
      line: lineOfIndex(block, match.index),
      match: match[0].trim(),
      excerpt: lineExcerpt(block.text, match.index),
      blockKind: block.kind,
    });
  }
  return findings;
}

function envVarFindings(block: TextBlock): RiskFinding[] {
  const findings: RiskFinding[] = [];
  const seen = new Set<string>();
  ENV_VAR_REFERENCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ENV_VAR_REFERENCE.exec(block.text)) !== null) {
    if (BENIGN_ENV_VARS.has(match[1]) || seen.has(match[1])) continue;
    seen.add(match[1]);
    findings.push({
      category: "secret",
      label: "environment variable reference",
      file: block.origin,
      line: lineOfIndex(block, match.index),
      match: match[0],
      excerpt: lineExcerpt(block.text, match.index),
      blockKind: block.kind,
    });
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
    findings.push(...findingsFor(block, networkPatternsFor(block.kind), "network", "network call reference"));
    const destructive = findingsFor(block, DESTRUCTIVE_PATTERNS, "destructive", "destructive operation");
    if (destructive.length > 0) {
      const confirmations = findingsFor(block, CONFIRMATION_PATTERNS, "confirmation", "confirmation pattern in the same block");
      const suffix = confirmations.length > 0 ? " (confirmation found in the same block)" : " (no confirmation in the same block)";
      findings.push(...destructive.map((finding) => ({ ...finding, label: finding.label + suffix })), ...confirmations);
    }
    findings.push(...findingsFor(block, PROMPT_INJECTION_PATTERNS, "promptInjection", "prompt injection pattern"));
    findings.push(...findingsFor(block, SECRET_PATTERNS, "secret", "secret or credential reference"));
    findings.push(...envVarFindings(block));
    if (block.kind === "code") findings.push(...findingsFor(block, SECRET_CODE_PATTERNS, "secret", "secret keyword inside code"));
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings.slice(0, MAX_FINDINGS);
}
