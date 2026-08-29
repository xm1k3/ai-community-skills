import hljs from "highlight.js/lib/common";
import MarkdownIt from "markdown-it";

const LANG_ALIASES: Record<string, string> = { vue: "xml", html: "xml", jsonc: "json", tsx: "typescript", jsx: "javascript", zsh: "bash", sh: "bash", shell: "bash" };

export const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  highlight: (code, lang) => {
    const language = LANG_ALIASES[lang] ?? lang;
    if (language && hljs.getLanguage(language)) {
      try {
        return hljs.highlight(code, { language, ignoreIllegals: true }).value;
      } catch {
        return "";
      }
    }
    return "";
  },
});

const defaultLink = markdown.renderer.rules.link_open ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet("target", "_blank");
  tokens[index].attrSet("rel", "noopener noreferrer");
  return defaultLink(tokens, index, options, env, self);
};

export function stripFrontmatter(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return text;
  const closing = lines.findIndex((line, index) => index > 0 && (line.trim() === "---" || line.trim() === "..."));
  if (closing === -1) return text;
  return lines.slice(closing + 1).join("\n");
}

export function renderMarkdown(text: string): string {
  return markdown.render(stripFrontmatter(text));
}
