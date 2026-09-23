import { describe, expect, it } from "vitest";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { makeAsk, recentState } from "../server/model-ask";

describe("makeAsk", () => {
  it("returns lastMessage when the judge finishes idle", async () => {
    const ctx = {
      paseo: {
        agents: {
          create: async () => ({ waitForFinish: async () => ({ status: "idle", lastMessage: "OUT", final: null, error: null }), archive: async () => {} }),
        },
      },
    } as unknown as PluginHandlerContext;
    const ask = makeAsk(ctx, ".", "prov/x", "agent");
    expect(await ask({ system: "", prompt: "", schema: {} })).toBe("OUT");
  });

  it("archives the subagent when the judge doesn't finish idle (leak guard)", async () => {
    let archived = false;
    const ctx = {
      paseo: {
        agents: {
          create: async () => ({
            waitForFinish: async () => ({ status: "timeout", lastMessage: null, error: null, final: null }),
            archive: async () => {
              archived = true;
            },
          }),
        },
      },
    } as unknown as PluginHandlerContext;
    const ask = makeAsk(ctx, ".", "prov/x", "agent");
    await expect(ask({ system: "", prompt: "", schema: {} })).rejects.toThrow();
    expect(archived).toBe(true); // autoArchive doesn't fire on timeout — we archive explicitly
  });
});

describe("recentState", () => {
  it("harvests message text, tool_call detail, tool name fallback, and error message", async () => {
    const ctx = {
      paseo: {
        agents: {
          ref: () => ({
            timeline: {
              refetch: async () => ({
                entries: [
                  { item: { type: "assistant_message", text: "hello world" } },
                  { item: { type: "tool_call", name: "Read", detail: { text: "file contents here" } } },
                  { item: { type: "error", message: "boom happened" } },
                  { item: { type: "tool_call", name: "Bash" } }, // no detail.text → name fallback
                ],
              }),
            },
          }),
        },
      },
    } as unknown as PluginHandlerContext;
    const s = await recentState(ctx, "a");
    expect(s).toContain("hello world");
    expect(s).toContain("file contents here");
    expect(s).toContain("boom happened");
    expect(s).toContain("[tool: Bash]");
  });

  it("falls back to a placeholder when the timeline is empty or refetch throws", async () => {
    const empty = { paseo: { agents: { ref: () => ({ timeline: { refetch: async () => ({ entries: [] }) } }) } } } as unknown as PluginHandlerContext;
    expect(await recentState(empty, "a")).toContain("no explicit state");
    const boom = { paseo: { agents: { ref: () => ({ timeline: { refetch: async () => { throw new Error("x"); } } }) } } } as unknown as PluginHandlerContext;
    expect(await recentState(boom, "a")).toContain("no explicit state");
  });
});
