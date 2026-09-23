// v0.2.0: the model-agnostic call, factored out. `makeAsk` runs one judging turn as a headless
// subagent on the CHOSEN provider/model; `recentState` gathers session text as default evidence.
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { AskFn } from "./backend";

export function makeAsk(
  context: PluginHandlerContext,
  cwd: string,
  model: string,
  parentAgentId: string,
): AskFn {
  return async ({ system, prompt, schema }) => {
    const handle = await context.paseo.agents.create({
      config: { provider: model, systemPrompt: system, toolPolicy: { preapproved: [] } },
      cwd,
      parent: parentAgentId,
      title: "jev judge",
      prompt,
      outputSchema: schema,
      autoArchive: true,
    });
    try {
      const res = await handle.waitForFinish(120_000);
      if (res.status !== "idle") throw new Error(res.error ?? `judge model ended in state: ${res.status}`);
      return res.lastMessage ?? "";
    } catch (e) {
      // autoArchive only fires on turn_completed/failed/canceled; a timeout or an unanswered
      // permission park leaves the subagent alive — archive it so judges don't leak/accumulate.
      await handle.archive().catch(() => {});
      throw e;
    }
  };
}

/** Best-effort recent session text (FetchAgentTimelinePayload.entries[].item.text). */
export async function recentState(context: PluginHandlerContext, agentId: string): Promise<string> {
  try {
    const payload = (await context.paseo.agents.ref(agentId).timeline.refetch({ limit: 30 })) as unknown as {
      entries?: Array<{ item?: Record<string, unknown> | null }>;
    };
    const texts: string[] = [];
    for (const entry of payload?.entries ?? []) {
      const item = entry?.item;
      if (!item || typeof item !== "object") continue;
      // message/reasoning carry `.text`; tool calls hold content in `.detail`; errors in `.message`.
      if (typeof item.text === "string" && item.text) {
        texts.push(item.text);
      } else if (item.type === "tool_call") {
        const detail = item.detail as { text?: unknown } | undefined;
        if (detail && typeof detail.text === "string") texts.push(detail.text);
        else if (typeof item.name === "string") texts.push(`[tool: ${item.name}]`);
      } else if ((item.type === "error" || item.type === "notification") && typeof item.message === "string") {
        texts.push(item.message);
      }
    }
    const joined = texts.slice(-20).join("\n").slice(-4000).trim();
    return joined || "(no explicit state; judge from the question alone.)";
  } catch {
    return "(no explicit state; judge from the question alone.)";
  }
}
