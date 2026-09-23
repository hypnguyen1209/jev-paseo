import { describe, expect, it } from "vitest";
import { jevSettingsSchema } from "../shared/settings";

describe("jevSettingsSchema", () => {
  it("applies defaults; reviewFloor <= threshold by default", () => {
    const v = jevSettingsSchema.parse({});
    expect(v.threshold).toBe(0.9);
    expect(v.reviewFloor).toBe(0.6);
    expect(v.samples).toBe(1);
  });
  it("rejects reviewFloor > threshold (medium band would be unreachable)", () => {
    expect(jevSettingsSchema.safeParse({ threshold: 0.6, reviewFloor: 0.9 }).success).toBe(false);
  });
});
