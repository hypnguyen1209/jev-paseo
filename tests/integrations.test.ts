// Drift guards for the integrations packaging (learned from DietrichGebert/ponytail's
// check-rule-copies): the marker instructions live in several files that must say the same thing,
// and the doc examples must parse with the real grammar, so a rule edit can't silently miss a copy.
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseMarker } from "../shared/marker";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");
const stripFrontmatter = (t: string) => t.replace(/^---\n[\s\S]*?\n---\n*/, "");

describe("rule copies stay in sync", () => {
  it("the committed Claude skill body is exactly snippet.md", () => {
    const snippet = read("integrations/snippet.md").trim();
    const skill = stripFrontmatter(read("integrations/claude-code/skills/jev/SKILL.md")).trim();
    expect(skill).toBe(snippet);
  });
  it("the frontmatter install.sh generates matches the committed skill's", () => {
    const embedded = /skill_frontmatter='([\s\S]*?)'/.exec(read("integrations/install.sh"));
    const committed = /^(---\n[\s\S]*?\n---\n)/.exec(read("integrations/claude-code/skills/jev/SKILL.md"));
    expect(embedded).not.toBeNull();
    expect(committed).not.toBeNull();
    expect(embedded![1].trim()).toBe(committed![1].trim());
  });
});

describe("doc marker examples parse with the real grammar", () => {
  for (const doc of ["integrations/snippet.md", "integrations/jev-protocol.md", "README.md"]) {
    it(doc, () => {
      const examples = read(doc)
        .split("\n")
        .map((l) => l.trim())
        // real examples only: skip the grammar spec line (angle brackets) and feedback samples
        .filter((l) => l.startsWith("[jev]") && !l.includes("<") && !l.includes("Decision on"));
      expect(examples.length).toBeGreaterThan(0);
      for (const line of examples) {
        expect(parseMarker(line), `does not parse: ${line}`).not.toBeNull();
      }
    });
  }
});

const hasBash = (() => {
  try {
    execFileSync("bash", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasBash)("install.sh", () => {
  it("installs a fenced block, re-runs idempotently, and uninstalls only its own block", () => {
    const dir = mkdtempSync(join(tmpdir(), "jev-install-")).replace(/\\/g, "/");
    writeFileSync(join(dir, "AGENTS.md"), "# my project\nkeep me\n");
    const sh = join(root, "integrations", "install.sh").replace(/\\/g, "/");
    const run = (...args: string[]) =>
      execFileSync("bash", [sh, "--target", dir, ...args], { encoding: "utf8" });

    run("codex");
    let agents = readFileSync(join(dir, "AGENTS.md"), "utf8");
    expect(agents).toContain("keep me");
    expect(agents).toContain("[jev]");
    expect(agents.match(/jev:begin/g)).toHaveLength(1);

    run("codex"); // idempotent: still exactly one block
    agents = readFileSync(join(dir, "AGENTS.md"), "utf8");
    expect(agents.match(/jev:begin/g)).toHaveLength(1);

    run("--uninstall", "codex");
    agents = readFileSync(join(dir, "AGENTS.md"), "utf8");
    expect(agents).toContain("keep me"); // the user's own content survives
    expect(agents).not.toContain("jev:begin");
  });
});
