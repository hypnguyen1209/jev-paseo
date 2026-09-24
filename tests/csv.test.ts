import { describe, expect, it } from "vitest";
import { toCsv } from "../client/csv";
import type { DecisionLogRecord } from "../shared/rpc";

const rec = (o: Partial<DecisionLogRecord>): DecisionLogRecord => ({
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

describe("toCsv", () => {
  it("writes a header and one CRLF-terminated row per record", () => {
    const lines = toCsv([rec({ taskId: "t1" })]).split("\r\n");
    expect(lines[0]).toBe(
      "createdAt,decidedBy,type,verdict,band,confidence,chosen,model,instructions,shadow,taskId",
    );
    expect(lines[1]).toContain("t1");
    expect(lines).toHaveLength(2);
  });
  it("quotes and escapes fields with commas, quotes, or newlines (RFC 4180)", () => {
    const csv = toCsv([rec({ instructions: 'Is "a, b" ok?\nreally' })]);
    expect(csv).toContain('"Is ""a, b"" ok?\nreally"');
  });
  it("a missing optional field renders as an empty cell, not the string 'undefined'", () => {
    expect(toCsv([rec({ band: undefined })])).not.toContain("undefined");
  });
});
