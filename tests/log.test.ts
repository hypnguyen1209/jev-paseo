import { describe, expect, it } from "vitest";
import { aggregate, type DecisionLog } from "../server/log";

const rec = (o: Partial<DecisionLog>): DecisionLog => ({
  taskId: "t",
  agentId: "a",
  type: "noul",
  instructions: "q",
  model: "m",
  decidedBy: "model",
  verdict: "sufficient",
  band: "high",
  confidence: 0.9,
  chosen: "yes",
  shadow: false,
  createdAt: "2026-01-01",
  ...o,
});

describe("aggregate", () => {
  it("counts totals, bands, and mean confidence over model decisions", () => {
    const s = aggregate([
      rec({ taskId: "t1", band: "high", confidence: 1 }),
      rec({ taskId: "t2", band: "low", confidence: 0 }),
      rec({ taskId: "t3", decidedBy: "user", confidence: 1, chosen: "no" }),
    ]);
    expect(s.total).toBe(3);
    expect(s.byModel).toBe(2);
    expect(s.byUser).toBe(1);
    expect(s.bands).toEqual({ high: 1, medium: 0, low: 1 });
    expect(s.meanConfidence).toBeCloseTo(0.5);
  });

  it("computes model-vs-user agreement (regret) per task", () => {
    const s = aggregate([
      rec({ taskId: "t1", decidedBy: "model", chosen: "yes", shadow: true }),
      rec({ taskId: "t1", decidedBy: "user", chosen: "yes" }), // agree
      rec({ taskId: "t2", decidedBy: "model", chosen: "yes", shadow: true }),
      rec({ taskId: "t2", decidedBy: "user", chosen: "no" }), // disagree
      rec({ taskId: "t3", decidedBy: "model", chosen: "yes" }), // no user → not compared
    ]);
    expect(s.compared).toBe(2);
    expect(s.agreements).toBe(1);
    expect(s.agreementRate).toBeCloseTo(0.5);
  });

  it("agreementRate is null when nothing is comparable", () => {
    expect(aggregate([rec({})]).agreementRate).toBeNull();
  });
});
