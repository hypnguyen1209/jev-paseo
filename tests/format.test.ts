import { describe, expect, it } from "vitest";
import { relativeTime, withAlpha } from "../client/format";

describe("withAlpha", () => {
  it("appends the alpha byte to a #RRGGBB colour", () => {
    expect(withAlpha("#1a2b3c", "22")).toBe("#1a2b3c22");
  });
  it("passes a non-hex colour through unchanged (so callers can fall back)", () => {
    expect(withAlpha("rgb(1,2,3)", "22")).toBe("rgb(1,2,3)");
    expect(withAlpha("#abc", "22")).toBe("#abc"); // 3-digit hex isn't RRGGBB
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-09-24T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();
  it("labels each bucket", () => {
    expect(relativeTime(ago(10_000), now)).toBe("just now");
    expect(relativeTime(ago(5 * 60_000), now)).toBe("5 min ago");
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe("3 h ago");
    expect(relativeTime(ago(24 * 3_600_000), now)).toBe("yesterday");
    expect(relativeTime(ago(3 * 24 * 3_600_000), now)).toBe("3 days ago");
  });
  it("returns empty for an unparseable timestamp", () => {
    expect(relativeTime("not-a-date", now)).toBe("");
  });
});
