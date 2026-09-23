import { describe, expect, it } from "vitest";
import { makeLlmBackend, type AskFn } from "../server/backend";
import type { NoulQuestion } from "../shared/contract";

const q: NoulQuestion = { type: "noul", instructions: "Fixed?" };

describe("makeLlmBackend — self-report (samples=1)", () => {
  it("parses the self-reported distribution from one call", async () => {
    const ask: AskFn = async () => JSON.stringify({ answers: { a: { probabilities: { no: 0.1, yes: 0.9 }, reasoning: "ok" } } });
    const be = makeLlmBackend("m", ask);
    expect(be.label).toBe("m");
    const out = await be.evaluate("s", { a: q });
    expect(out.a.probabilities).toEqual({ no: 0.1, yes: 0.9 });
    expect(out.a.reasoning).toBe("ok");
  });
  it("garbage and array probabilities → empty (normalizes to uniform later)", async () => {
    expect((await makeLlmBackend("m", async () => "nope").evaluate("s", { a: q })).a.probabilities).toEqual({});
    const arr: AskFn = async () => JSON.stringify({ answers: { a: { probabilities: [0.1, 0.9] } } });
    expect((await makeLlmBackend("m", arr).evaluate("s", { a: q })).a.probabilities).toEqual({});
  });
});

describe("makeLlmBackend — self-consistency (samples>1)", () => {
  it("tallies K votes into an empirical distribution", async () => {
    const replies = ["yes", "yes", "yes", "no"]; // → {no:0.25, yes:0.75}
    let i = 0;
    const ask: AskFn = async () => JSON.stringify({ answers: { a: { choice: replies[i++] } } });
    const be = makeLlmBackend("m", ask, 4);
    expect(be.label).toContain("self-consistency");
    const out = await be.evaluate("s", { a: q });
    expect(out.a.probabilities.yes).toBeCloseTo(0.75);
    expect(out.a.probabilities.no).toBeCloseTo(0.25);
  });
  it("makes exactly K calls", async () => {
    let calls = 0;
    const ask: AskFn = async () => {
      calls++;
      return JSON.stringify({ answers: { a: { choice: "yes" } } });
    };
    await makeLlmBackend("m", ask, 5).evaluate("s", { a: q });
    expect(calls).toBe(5);
  });
  it("ignores invalid/missing votes when tallying", async () => {
    const replies: Array<Record<string, unknown>> = [{ choice: "yes" }, { choice: "maybe" }, {}, { choice: "no" }];
    let i = 0;
    const ask: AskFn = async () => JSON.stringify({ answers: { a: replies[i++] } });
    const out = await makeLlmBackend("m", ask, 4).evaluate("s", { a: q });
    // valid votes: yes, no → 50/50
    expect(out.a.probabilities.yes).toBeCloseTo(0.5);
    expect(out.a.probabilities.no).toBeCloseTo(0.5);
  });
});
