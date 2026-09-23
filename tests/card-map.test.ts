import { describe, expect, it } from "vitest";
import { answerLabel, buildQuestion, toCard, userCard } from "../server/card-map";
import { runJudge } from "../server/judge";
import type { JudgeBackend, RawAnswer } from "../server/backend";

const base = { state: "s", model: "prov/x", strict: false, threshold: 0.9, reviewFloor: 0.6, maxRounds: 1 };

/** Backend that answers every question with a fixed distribution (+ optional considerations). */
function fixed(probs: Record<string, number>, considerations?: { q: string; a: string }[]): JudgeBackend {
  return {
    label: "fixed",
    multiRound: false,
    async evaluate(_s, questions) {
      const out: Record<string, RawAnswer> = {};
      for (const id of Object.keys(questions)) out[id] = { probabilities: probs, reasoning: "because", considerations };
      return out;
    },
  };
}

describe("buildQuestion", () => {
  it("noul needs no options", () => {
    expect(buildQuestion("noul", "q", [])).toEqual({ type: "noul", instructions: "q" });
  });
  it("choice → o0/o1 keyed criteria", () => {
    expect(buildQuestion("choice", "q", ["a", "b"])).toEqual({
      type: "choice",
      instructions: "q",
      criteria: { o0: "a", o1: "b" },
    });
  });
  it("score → ordered criteria array", () => {
    expect(buildQuestion("score", "q", ["lo", "hi"])).toEqual({ type: "score", instructions: "q", criteria: ["lo", "hi"] });
  });
  it("choice/score with < 2 options → null", () => {
    expect(buildQuestion("choice", "q", ["only"])).toBeNull();
    expect(buildQuestion("score", "q", [])).toBeNull();
  });
});

describe("answerLabel + toCard (through real runJudge)", () => {
  it("choice → chosen label + pct; card carries band, model, decidedBy, options", async () => {
    const q = buildQuestion("choice", "pick", ["rollback", "hotfix"])!;
    const r = await runJudge({ ...base, question: q, backend: fixed({ o0: 0.9, o1: 0.1 }) });
    expect(answerLabel(r)).toBe("rollback · 90%");
    const c = toCard(r);
    expect(c.type).toBe("choice");
    expect(c.model).toBe("prov/x");
    expect(c.decidedBy).toBe("model");
    expect(c.band).toBe(r.band);
    expect(c.reasoning).toBe("because");
    expect(c.options).toEqual([
      { key: "o0", label: "rollback", prob: 0.9 },
      { key: "o1", label: "hotfix", prob: 0.1 },
    ]);
    expect(typeof c.createdAt).toBe("string");
  });

  it("carries the judge's considerations onto the card as rationale", async () => {
    const q = buildQuestion("noul", "shipped?", [])!;
    const considerations = [{ q: "Do the tests pass?", a: "Yes, the run log shows exit 0." }];
    const c = toCard(await runJudge({ ...base, question: q, backend: fixed({ no: 0.1, yes: 0.9 }, considerations) }));
    expect(c.rationale).toEqual(considerations);
  });

  it("noul → yes / no labels", async () => {
    const q = buildQuestion("noul", "ok?", [])!;
    expect(answerLabel(await runJudge({ ...base, question: q, backend: fixed({ no: 0.2, yes: 0.8 }) }))).toBe("yes · 80%");
    expect(answerLabel(await runJudge({ ...base, question: q, backend: fixed({ no: 0.7, yes: 0.3 }) }))).toBe("no · 70%");
  });

  it("score → expected level + nearest legend label", async () => {
    const q = buildQuestion("score", "rate", ["bad", "ok", "good", "great"])!;
    const r = await runJudge({ ...base, question: q, backend: fixed({ "0": 0, "1": 0, "2": 0, "3": 1 }) });
    expect(answerLabel(r)).toBe("3.0 — great");
  });
});

describe("userCard", () => {
  it("choice pick → 100% on chosen, band high, decidedBy user", () => {
    const c = userCard("choice", "pick", ["rollback", "hotfix"], "o0");
    expect(c.decidedBy).toBe("user");
    expect(c.band).toBe("high");
    expect(c.confidence).toBe(1);
    expect(c.answerLabel).toBe("rollback · 100%");
    expect(c.options).toEqual([
      { key: "o0", label: "rollback", prob: 1 },
      { key: "o1", label: "hotfix", prob: 0 },
    ]);
  });
  it("noul pick", () => {
    expect(userCard("noul", "ok?", [], "yes").answerLabel).toBe("yes · 100%");
  });
  it("unknown key → falls back to the raw key", () => {
    expect(userCard("choice", "pick", ["a", "b"], "zzz").answerLabel).toBe("zzz");
  });
});
