import { describe, expect, it } from "vitest";
import { extractJson } from "../shared/model-json";

describe("extractJson", () => {
  it("parses a bare JSON object", () => {
    expect(extractJson('{"probabilities":{"a":0.7,"b":0.3}}')).toEqual({
      probabilities: { a: 0.7, b: 0.3 },
    });
  });
  it("parses a ```json fenced block", () => {
    const t = "Here you go:\n```json\n{\"reasoning\":\"x\",\"probabilities\":{\"yes\":0.9}}\n```";
    expect(extractJson(t)).toEqual({ reasoning: "x", probabilities: { yes: 0.9 } });
  });
  it("parses JSON surrounded by prose", () => {
    const t = 'The answer is {"probabilities":{"no":0.1,"yes":0.9}} — done.';
    expect(extractJson(t)).toEqual({ probabilities: { no: 0.1, yes: 0.9 } });
  });
  it("returns null for a JSON array (not an object)", () => {
    expect(extractJson("[1,2,3]")).toBeNull();
  });
  it("returns null for garbage / empty", () => {
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson("")).toBeNull();
  });
});
