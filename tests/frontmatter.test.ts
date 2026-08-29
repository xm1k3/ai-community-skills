import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../src/frontmatter";

describe("parseFrontmatter", () => {
  it("parses simple key value pairs and the body", () => {
    const parsed = parseFrontmatter("---\nname: my-skill\ndescription: Does things when asked.\n---\n# Heading\nbody");
    expect(parsed?.data).toEqual({ name: "my-skill", description: "Does things when asked." });
    expect(parsed?.body).toBe("# Heading\nbody");
  });

  it("returns null without frontmatter", () => {
    expect(parseFrontmatter("# Just markdown")).toBeNull();
    expect(parseFrontmatter("---\nname: x\nno closing")).toBeNull();
  });

  it("handles quoted strings, lists, nested maps, and block scalars", () => {
    const raw = [
      "---",
      'name: "quoted name"',
      "description: >",
      "  A folded",
      "  description.",
      "notes: |",
      "  line one",
      "  line two",
      "tags: [a, b, \"c d\"]",
      "steps:",
      "  - first",
      "  - second",
      "metadata:",
      "  author: someone",
      "  version: 2",
      "allowed-tools: Bash, Read",
      "flag: true",
      "---",
      "body",
    ].join("\n");
    const parsed = parseFrontmatter(raw);
    expect(parsed?.data).toEqual({
      name: "quoted name",
      description: "A folded description.",
      notes: "line one\nline two",
      tags: ["a", "b", "c d"],
      steps: ["first", "second"],
      metadata: { author: "someone", version: 2 },
      "allowed-tools": "Bash, Read",
      flag: true,
    });
  });

  it("handles CRLF line endings and a BOM", () => {
    const parsed = parseFrontmatter("\uFEFF---\r\nname: crlf\r\ndescription: Windows file.\r\n---\r\nbody\r\n");
    expect(parsed?.data).toEqual({ name: "crlf", description: "Windows file." });
  });

  it("supports list items at the same indent as their key", () => {
    const parsed = parseFrontmatter("---\nname: x\ntags:\n- one\n- two\ndescription: y\n---\n");
    expect(parsed?.data).toEqual({ name: "x", tags: ["one", "two"], description: "y" });
  });
});
