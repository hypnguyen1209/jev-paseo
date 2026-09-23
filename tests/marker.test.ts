import { describe, expect, it } from "vitest";
import { extractMarkers, parseMarker } from "../shared/marker";

describe("parseMarker", () => {
  it("choice with colon + options", () => {
    expect(parseMarker("[jev] choice: Which fix is safer? | rollback | hotfix")).toEqual({
      type: "choice",
      instructions: "Which fix is safer?",
      options: ["rollback", "hotfix"],
      strict: false,
    });
  });
  it("choice without a colon", () => {
    expect(parseMarker("[jev] choice Which fix? | a | b")?.instructions).toBe("Which fix?");
  });
  it("yn / noul aliases, no options, strict flag", () => {
    const m = parseMarker("[jev] yn strict: Is the bug fixed?");
    expect(m).toEqual({ type: "noul", instructions: "Is the bug fixed?", options: [], strict: true });
  });
  it("noul keeps a pipe in the question instead of splitting it into options", () => {
    const m = parseMarker("[jev] yn: Is `a || b` a valid guard?");
    expect(m).toEqual({ type: "noul", instructions: "Is `a || b` a valid guard?", options: [], strict: false });
  });
  it("score with ordered levels", () => {
    expect(parseMarker("[jev] score: Rate risk | low | med | high")?.type).toBe("score");
  });
  it("leading whitespace + prefix mid-text is ignored", () => {
    expect(parseMarker("   [jev] yn: ok?")?.type).toBe("noul");
    expect(parseMarker("no marker here")).toBeNull();
  });
  it("rejects unknown type, empty question, and choice/score with < 2 options", () => {
    expect(parseMarker("[jev] frobnicate: x")).toBeNull();
    expect(parseMarker("[jev] choice:   ")).toBeNull();
    expect(parseMarker("[jev] choice: only one thing")).toBeNull();
    expect(parseMarker("[jev] score: just a label | one")).toBeNull();
  });
});

describe("extractMarkers", () => {
  it("collects every marker line from a block, ignoring prose", () => {
    const text = [
      "Here is my plan.",
      "[jev] yn: Did tests pass?",
      "Some analysis...",
      "[jev] choice: Ship it? | ship | hold",
    ].join("\n");
    const markers = extractMarkers(text);
    expect(markers.map((m) => m.type)).toEqual(["noul", "choice"]);
    expect(markers[1].options).toEqual(["ship", "hold"]);
  });
});
