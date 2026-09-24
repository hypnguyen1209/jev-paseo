import { afterEach, describe, expect, it, vi } from "vitest";

// pill.ts pulls in ./popover (→ react-native) only for the popover Content; stub it so the pill's
// pure lifecycle logic can be tested in node.
vi.mock("../client/popover", () => ({ JevQueuePopover: () => null }));

// eslint-disable-next-line import/first
import { startJevPills } from "../client/pill";

type Observer = {
  snapshot: (s: { entries: Array<{ agent: Agent }> }) => void;
  update: (m: { type: string; payload: unknown }) => void;
};
interface Agent {
  id: string;
  workspaceId: string | null;
  cwd: string;
  provider: string;
  title: string | null;
}
interface PillRec {
  workspaceId: string;
  agentId: string;
  removed: boolean;
}

const agent = (id: string, workspaceId: string | null): Agent => ({ id, workspaceId, cwd: ".", provider: "claude", title: null });
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function harness() {
  let observer: Observer | undefined;
  const pills: PillRec[] = [];
  let addCalls = 0;
  let rpcCalls = 0;
  let released = 0;
  const client = {
    paseo: {
      agents: {
        list: async () => ({
          subscription: {
            subscribe: (o: Observer) => {
              observer = o;
              return () => {};
            },
            release: () => {
              released += 1;
            },
          },
        }),
      },
    },
    addComposerPill: (contrib: { workspaceId: string; agentId: string }) => {
      addCalls += 1;
      const rec: PillRec = { workspaceId: contrib.workspaceId, agentId: contrib.agentId, removed: false };
      pills.push(rec);
      return { update: () => {}, remove: () => (rec.removed = true) };
    },
    rpc: async () => {
      rpcCalls += 1;
      return { tasks: [] };
    },
  } as unknown as Parameters<typeof startJevPills>[0];
  return {
    client,
    pills,
    obs: () => observer!,
    counts: () => ({ addCalls, rpcCalls, released }),
  };
}

describe("startJevPills lifecycle", () => {
  let stop: (() => void) | undefined;
  afterEach(() => {
    stop?.();
    stop = undefined;
  });

  it("registers one pill per agent-with-workspace, and refreshes its badge once", async () => {
    const h = harness();
    stop = startJevPills(h.client);
    await flush();
    h.obs().snapshot({ entries: [{ agent: agent("a1", "w1") }, { agent: agent("headless", null) }] });
    expect(h.pills.filter((p) => !p.removed).map((p) => p.agentId)).toEqual(["a1"]); // headless (no ws) skipped
    expect(h.counts().addCalls).toBe(1);
    expect(h.counts().rpcCalls).toBe(1); // one immediate badge refresh
  });

  it("does NOT rebuild the pill on an unchanged-workspace update (no RPC storm)", async () => {
    const h = harness();
    stop = startJevPills(h.client);
    await flush();
    h.obs().snapshot({ entries: [{ agent: agent("a1", "w1") }] });
    const before = h.counts();
    // a plain agent_update with the same workspace fires constantly; it must be a no-op
    h.obs().update({ type: "agent_update", payload: { kind: "update", agent: agent("a1", "w1") } });
    expect(h.counts().addCalls).toBe(before.addCalls); // no new pill
    expect(h.counts().rpcCalls).toBe(before.rpcCalls); // no extra list-tasks
    expect(h.pills.filter((p) => !p.removed)).toHaveLength(1);
  });

  it("rebuilds only when the workspace actually changes", async () => {
    const h = harness();
    stop = startJevPills(h.client);
    await flush();
    h.obs().snapshot({ entries: [{ agent: agent("a1", "w1") }] });
    h.obs().update({ type: "agent_update", payload: { kind: "update", agent: agent("a1", "w2") } });
    expect(h.counts().addCalls).toBe(2); // rebuilt
    expect(h.pills[0].removed).toBe(true); // old dropped
    expect(h.pills.filter((p) => !p.removed).map((p) => p.workspaceId)).toEqual(["w2"]);
  });

  it("drops the pill on a remove update, and losing the workspace", async () => {
    const h = harness();
    stop = startJevPills(h.client);
    await flush();
    h.obs().snapshot({ entries: [{ agent: agent("a1", "w1") }] });
    h.obs().update({ type: "agent_update", payload: { kind: "remove", agentId: "a1" } });
    expect(h.pills.every((p) => p.removed)).toBe(true);
  });

  it("cleanup removes every pill and releases the subscription", async () => {
    const h = harness();
    stop = startJevPills(h.client);
    await flush();
    h.obs().snapshot({ entries: [{ agent: agent("a1", "w1") }, { agent: agent("a2", "w2") }] });
    expect(h.pills.filter((p) => !p.removed)).toHaveLength(2);
    stop();
    stop = undefined;
    expect(h.pills.every((p) => p.removed)).toBe(true);
    expect(h.counts().released).toBe(1);
  });
});
