import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerJevHook } from "../server/hook";
import { readStore } from "../server/store";

const dir = mkdtempSync(join(tmpdir(), "jev-hook-"));
process.env.JEV_TASKS_FILE = join(dir, "tasks.json");
process.env.JEV_LOG_FILE = join(dir, "log.jsonl");

type Handlers = Record<string, (...args: unknown[]) => unknown>;
function fakeServer(): { server: PluginServerContext; handlers: Handlers } {
  const handlers: Handlers = {};
  const server = {
    on: (name: string, h: (...a: unknown[]) => unknown) => {
      handlers[name] = h;
      return () => {};
    },
    before: (name: string, h: (...a: unknown[]) => unknown) => {
      handlers[`before:${name}`] = h;
      return () => {};
    },
    handle: () => {},
    registerSettings: () => {},
    registerProvider: () => {},
  } as unknown as PluginServerContext;
  return { server, handlers };
}

const context = { paseo: {}, signal: new AbortController().signal };
const turn = (id: string, workspaceId: string | null, text: string) => ({
  agent: { id, workspaceId, cwd: ".", provider: "claude", parentAgentId: null, title: null },
  turnId: "t1",
  outcome: { kind: "completed" },
  timeline: [{ type: "assistant_message", text }],
});

afterEach(() => {
  delete process.env.JEV_HOOK_INSTRUCT;
});

describe("agent.turn_ended marker hook", () => {
  it("creates pending tasks from [jev] markers and de-dupes across turns", async () => {
    const { server, handlers } = fakeServer();
    registerJevHook(server);
    const event = turn("hookA", "w", "Working…\n[jev] choice: Which fix? | rollback | hotfix\n[jev] yn: Done?");
    await handlers["agent.turn_ended"](event, context);
    const tasks = readStore().filter((t) => t.agentId === "hookA");
    expect(tasks.map((t) => t.type).sort()).toEqual(["choice", "noul"]);
    expect(tasks.every((t) => t.status === "pending")).toBe(true);
    // same markers replay next turn → no new tasks
    await handlers["agent.turn_ended"](event, context);
    expect(readStore().filter((t) => t.agentId === "hookA").length).toBe(2);
  });

  it("ignores turns with no markers, and agents with no workspace (headless judges)", async () => {
    const { server, handlers } = fakeServer();
    registerJevHook(server);
    await handlers["agent.turn_ended"](turn("hookB", "w", "just prose, no marker"), context);
    await handlers["agent.turn_ended"](turn("headless", null, "[jev] yn: ok?"), context);
    expect(readStore().filter((t) => t.agentId === "hookB").length).toBe(0);
    expect(readStore().filter((t) => t.agentId === "headless").length).toBe(0);
  });
});

describe("before(agent.create) instruction injection", () => {
  it("injects only when opted in, appends to the base prompt, and skips judge subagents", () => {
    const { server, handlers } = fakeServer();
    registerJevHook(server);
    const before = handlers["before:agent.create"];

    // default (not opted in) → no change
    expect(before({ request: { config: {} } })).toBeUndefined();

    process.env.JEV_HOOK_INSTRUCT = "1";
    const r = before({ request: { config: { systemPrompt: "BASE" } } }) as { config: { systemPrompt: string } };
    expect(r.config.systemPrompt).toContain("BASE");
    expect(r.config.systemPrompt).toContain("[jev]");
    // our own judge subagents must not be nudged
    expect(before({ request: { config: { title: "jev judge" } } })).toBeUndefined();
  });
});
