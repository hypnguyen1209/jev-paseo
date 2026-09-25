import { describe, expect, it } from "vitest";
import { runBatchJudge, runJudge } from "../server/judge";
import type { JudgeBackend, RawAnswer } from "../server/backend";
import { buildQuestion } from "../server/card-map";
import type { NoulQuestion, Question } from "../shared/contract";

const q: NoulQuestion = { type: "noul", instructions: "Is the bug fixed?" };
const base = { state: "s", model: "m", threshold: 0.9, reviewFloor: 0.6, maxRounds: 2 };

/** Fake backend replaying a distribution per call; records the questions it saw. */
function singleReplay(replies: Array<Record<string, number>>) {
  let i = 0;
  const seen: Array<Record<string, Question>> = [];
  const backend: JudgeBackend = {
    async evaluate(_state, questions) {
      seen.push(questions);
      const rep = replies[Math.min(i, replies.length - 1)];
      i++;
      const out: Record<string, RawAnswer> = {};
      for (const id of Object.keys(questions)) out[id] = { probabilities: rep, reasoning: `r${i}` };
      return out;
    },
  };
  return { backend, seen };
}

describe("runJudge", () => {
  it("STRICT high-confidence → 1 round, sufficient, band high", async () => {
    const { backend } = singleReplay([{ no: 0.02, yes: 0.98 }]);
    const r = await runJudge({ ...base, question: q, strict: true, backend });
    expect(r.rounds).toBe(1);
    expect(r.verdict).toBe("sufficient");
    expect(r.band).toBe("high");
    expect(r.failStreak).toBe(0);
  });

  it("STRICT sufficiency is inclusive at the threshold (>=, not >)", async () => {
    const { backend } = singleReplay([{ no: 0.05, yes: 0.95 }]); // choiceConfidence = 0.90 == threshold
    const r = await runJudge({ ...base, question: q, strict: true, backend });
    expect(r.rounds).toBe(1);
    expect(r.verdict).toBe("sufficient");
    expect(r.band).toBe("high");
    expect(r.failStreak).toBe(0);
  });

  it("STRICT low → exhausts rounds, insufficient, re-ask carries feedback", async () => {
    const { backend, seen } = singleReplay([{ no: 0.5, yes: 0.5 }]);
    const r = await runJudge({ ...base, question: q, strict: true, backend });
    expect(r.rounds).toBe(2);
    expect(r.failStreak).toBe(2);
    expect(r.verdict).toBe("insufficient");
    expect(r.band).toBe("low");
    expect(seen[1].main.instructions).toContain("[Re-judge]");
  });

  it("STRICT low then high → 2 rounds sufficient failStreak 1", async () => {
    const { backend } = singleReplay([{ no: 0.5, yes: 0.5 }, { no: 0.02, yes: 0.98 }]);
    const r = await runJudge({ ...base, question: q, strict: true, maxRounds: 3, backend });
    expect(r.rounds).toBe(2);
    expect(r.failStreak).toBe(1);
    expect(r.verdict).toBe("sufficient");
  });

  it("non-STRICT → single round decided, band medium at 0.6", async () => {
    const { backend } = singleReplay([{ no: 0.2, yes: 0.8 }]); // conf 0.6
    const r = await runJudge({ ...base, question: q, strict: false, backend });
    expect(r.rounds).toBe(1);
    expect(r.verdict).toBe("decided");
    expect(r.band).toBe("medium");
  });
});

describe("runBatchJudge (fan-out)", () => {
  it("answers many tasks in ONE backend call", async () => {
    let calls = 0;
    const per: Record<string, Record<string, number>> = {
      t1: { no: 0.02, yes: 0.98 },
      t2: { no: 0.5, yes: 0.5 },
    };
    const backend: JudgeBackend = {
      async evaluate(_s, questions) {
        calls++;
        const out: Record<string, RawAnswer> = {};
        for (const id of Object.keys(questions)) out[id] = { probabilities: per[id] ?? {} };
        return out;
      },
    };
    const res = await runBatchJudge({
      ...base,
      strict: true,
      backend,
      tasks: [
        { id: "t1", question: q },
        { id: "t2", question: q },
      ],
    });
    expect(calls).toBe(1);
    expect(res.t1.verdict).toBe("sufficient");
    expect(res.t1.band).toBe("high");
    expect(res.t2.verdict).toBe("insufficient");
    expect(res.t2.band).toBe("low");
  });

  it("keys each task by its OWN option keys (heterogeneous choice + score)", async () => {
    const cq = buildQuestion("choice", "pick", ["a", "b"])!; // keys o0, o1
    const sq = buildQuestion("score", "rate", ["lo", "mid", "hi"])!; // keys 0, 1, 2
    const per: Record<string, Record<string, number>> = {
      c: { o0: 0.8, o1: 0.2 },
      s: { "0": 0.1, "1": 0.2, "2": 0.7 },
    };
    const backend: JudgeBackend = {
      async evaluate(_s, questions) {
        const out: Record<string, RawAnswer> = {};
        for (const id of Object.keys(questions)) out[id] = { probabilities: per[id] ?? {} };
        return out;
      },
    };
    const res = await runBatchJudge({
      ...base,
      strict: false,
      backend,
      tasks: [
        { id: "c", question: cq },
        { id: "s", question: sq },
      ],
    });
    if (res.c.decision.type !== "choice") throw new Error("type c");
    expect(res.c.decision.choice).toBe("o0");
    if (res.s.decision.type !== "score") throw new Error("type s");
    expect(res.s.decision.score).toBeCloseTo(1.6); // 0*0.1 + 1*0.2 + 2*0.7
  });

  it("dedupes duplicate task ids (first occurrence wins)", async () => {
    const cq = buildQuestion("choice", "pick", ["a", "b"])!;
    const sq = buildQuestion("score", "rate", ["lo", "hi"])!;
    const backend: JudgeBackend = {
      async evaluate(_s, questions) {
        const out: Record<string, RawAnswer> = {};
        for (const id of Object.keys(questions)) out[id] = { probabilities: {} };
        return out;
      },
    };
    const res = await runBatchJudge({
      ...base,
      strict: false,
      backend,
      tasks: [
        { id: "x", question: cq },
        { id: "x", question: sq },
      ],
    });
    expect(Object.keys(res)).toEqual(["x"]);
    expect(res.x.decision.type).toBe("choice"); // first (choice) wins, not the later score
  });
});
