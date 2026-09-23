// v0.2.0: a composer pill per agent, opening the judge-task queue popover. The label shows the
// pending count, refreshed on register + every 8s. Mirrors the SDK's agent-observation pattern.
import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { JevListTasksRpc } from "../shared/rpc";
import { JevQueuePopover } from "./popover";

export function startJevPills(client: PluginClientContext): () => void {
  const pills = new Map<string, { reg: PluginButtonRegistration; timer: ReturnType<typeof setInterval> }>();
  let stopped = false;
  let release: (() => void) | undefined;
  const lifetime = new AbortController();

  const drop = (agentId: string) => {
    const p = pills.get(agentId);
    if (p) {
      p.reg.remove();
      clearInterval(p.timer);
    }
    pills.delete(agentId);
  };

  const register = (agent: { id: string; workspaceId?: string | null }) => {
    drop(agent.id); // clear any prior pill first — incl. an agent that just lost its workspaceId
    if (stopped || !agent.workspaceId) return;
    const workspaceId = agent.workspaceId;
    const reg = client.addComposerPill({
      id: "jev",
      workspaceId,
      agentId: agent.id,
      button: {
        title: "Jev judge tasks",
        icon: "Scale",
        label: "Jev",
        behavior: { kind: "popover", Content: JevQueuePopover },
      },
    });
    const refresh = () => {
      void client
        .rpc(JevListTasksRpc, { workspaceId, agentId: agent.id, status: "pending" })
        .then((r) => {
          if (!stopped) reg.update({ label: r.tasks.length ? `Jev · ${r.tasks.length}` : "Jev" });
        })
        .catch(() => undefined);
    };
    refresh();
    // ponytail: 30s badge poll; the count is discrete-action driven and the popover refetches on open.
    const timer = setInterval(refresh, 30_000);
    pills.set(agent.id, { reg, timer });
  };

  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ subscription }) => {
      if (stopped) {
        (subscription as { release?: () => void }).release?.();
        return undefined;
      }
      release = () => (subscription as { release?: () => void }).release?.();
      subscription.subscribe({
        snapshot: ({ entries }) => {
          for (const id of [...pills.keys()]) drop(id);
          for (const { agent } of entries) register(agent);
        },
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "remove") drop(update.agentId);
          else register(update.agent);
        },
      });
      return undefined;
    })
    .catch((error) => {
      if (!stopped) console.error("Jev pill observation failed", error);
    });

  return () => {
    stopped = true;
    lifetime.abort();
    release?.(); // the daemon subscription (signal is a no-op on 0.8.0) — release it explicitly
    for (const id of [...pills.keys()]) drop(id);
  };
}
