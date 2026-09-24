import { afterEach, describe, expect, it } from "vitest";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { paseoHome, pluginData } from "../server/paseo-home";

const orig = process.env.PASEO_HOME;
afterEach(() => {
  if (orig === undefined) delete process.env.PASEO_HOME;
  else process.env.PASEO_HOME = orig;
});

describe("paseoHome", () => {
  it("defaults to ~/.paseo", () => {
    delete process.env.PASEO_HOME;
    expect(paseoHome()).toBe(join(homedir(), ".paseo"));
  });
  it("honors an explicit PASEO_HOME (custom daemon home)", () => {
    process.env.PASEO_HOME = join("/custom", "home");
    expect(paseoHome()).toBe(join("/custom", "home"));
  });
  it("expands a leading ~", () => {
    process.env.PASEO_HOME = "~/alt";
    expect(paseoHome()).toBe(resolve(homedir(), "alt"));
    process.env.PASEO_HOME = "~";
    expect(paseoHome()).toBe(homedir());
  });
  it("pluginData nests under plugin-data", () => {
    process.env.PASEO_HOME = join("/h");
    expect(pluginData("jev")).toBe(join("/h", "plugin-data", "jev"));
  });
});
