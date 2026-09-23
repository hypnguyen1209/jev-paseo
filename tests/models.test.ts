import { describe, expect, it } from "vitest";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { modelsHandler } from "../server/models";

function ctx(waitForReady: () => Promise<unknown>): PluginHandlerContext {
  return { paseo: { providers: { waitForReady } } } as unknown as PluginHandlerContext;
}

describe("modelsHandler", () => {
  it("flattens ready providers into provider/model ids", async () => {
    const res = await modelsHandler(
      { cwd: "." },
      ctx(async () => ({
        entries: [
          { provider: "claude", status: "ready", models: [{ id: "claude-sonnet-5", label: "Sonnet", isDefault: true }, { id: "claude-opus" }] },
          { provider: "codex", status: "ready", models: [{ id: "gpt-5.5" }] },
        ],
      })),
    );
    expect(res.models.map((m) => m.id)).toEqual(["claude/claude-sonnet-5", "claude/claude-opus", "codex/gpt-5.5"]);
    expect(res.models[0].isDefault).toBe(true);
    expect(res.models[0].label).toBe("Sonnet");
    expect(res.models[1].isDefault).toBe(false);
    expect(res.note).toBeUndefined();
  });

  it("skips non-ready providers and models without an id", async () => {
    const res = await modelsHandler(
      {},
      ctx(async () => ({
        entries: [
          { provider: "warming", status: "loading", models: [{ id: "x" }] },
          { provider: "claude", status: "ready", models: [{ label: "no id" }, { id: "ok" }] },
        ],
      })),
    );
    expect(res.models.map((m) => m.id)).toEqual(["claude/ok"]);
  });

  it("empty → note", async () => {
    const res = await modelsHandler({}, ctx(async () => ({ entries: [] })));
    expect(res.models).toEqual([]);
    expect(res.note).toContain("No provider models");
  });

  it("error → caught (empty + message note)", async () => {
    const res = await modelsHandler(
      {},
      ctx(async () => {
        throw new Error("boom");
      }),
    );
    expect(res.models).toEqual([]);
    expect(res.note).toBe("boom");
  });
});
