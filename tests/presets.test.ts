import { describe, expect, it } from "vitest";
import { PRESETS } from "../shared/presets";
import { buildQuestion } from "../server/card-map";

describe("PRESETS", () => {
  it("every preset builds a valid question", () => {
    for (const p of PRESETS) {
      expect(buildQuestion(p.type, p.instructions, p.options), p.key).not.toBeNull();
    }
  });
  it("choice/score presets have >= 2 options; keys are unique", () => {
    const keys = new Set<string>();
    for (const p of PRESETS) {
      if (p.type !== "noul") expect(p.options.length, p.key).toBeGreaterThanOrEqual(2);
      keys.add(p.key);
    }
    expect(keys.size).toBe(PRESETS.length);
  });
});
