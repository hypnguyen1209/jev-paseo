// v0.6.0: Level-1 agent → plugin channel. Paseo can't give a plugin an agent-callable tool, and has
// no pre-tool-call hook, so the agent pushes a jev question by emitting a `[jev] …` marker in its
// output; this `agent.turn_ended` observer turns markers into decision tasks (optionally auto-judged).
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { extractMarkers } from "../shared/marker";
import { jevSettingsSchema, type JevSettingsValues } from "../shared/settings";
import { addTask, newId, readStore } from "./store";
import { judgeTask } from "./tasks";
import type { JevTask } from "../shared/task";

const INSTRUCTION = [
  "You can offload a small typed decision to the Jev judge instead of reasoning it out:",
  "emit a line `[jev] <choice|score|yn> [strict]: <question> [| option | option ...]`.",
  "It becomes a decision task in the Jev panel, resolved by you or a model.",
  "Example: `[jev] choice: Which fix is safer? | rollback | hotfix`.",
].join(" ");

function envConfig(): { config: JevSettingsValues; autoJudge: boolean } {
  const config = jevSettingsSchema.parse({
    defaultModel: process.env.JEV_HOOK_MODEL ?? "",
    samples: Number(process.env.JEV_HOOK_SAMPLES ?? "1") || 1,
  });
  return { config, autoJudge: process.env.JEV_HOOK_AUTOJUDGE === "1" };
}

export function registerJevHook(server: PluginServerContext): void {
  server.on("agent.turn_ended", async (event, context) => {
    try {
      const agent = event.agent;
      if (!agent.workspaceId) return; // headless subagents (incl. our own judges) have no workspace
      const texts: string[] = [];
      for (const raw of event.timeline as unknown as ReadonlyArray<Record<string, unknown>>) {
        if (raw.type === "assistant_message" && typeof raw.text === "string") texts.push(raw.text);
      }
      const markers = extractMarkers(texts.join("\n"));
      if (!markers.length) return;

      // de-dupe: skip a question already queued/resolved for this agent (turn_ended can replay history)
      const seen = new Set(
        readStore()
          .filter((t) => t.agentId === agent.id)
          .map((t) => `${t.type}:${t.instructions}`),
      );
      const { config, autoJudge } = envConfig();
      for (const m of markers) {
        const key = `${m.type}:${m.instructions}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const task: JevTask = {
          id: newId(),
          workspaceId: agent.workspaceId,
          agentId: agent.id,
          cwd: agent.cwd,
          type: m.type,
          instructions: m.instructions,
          options: m.options,
          strict: m.strict,
          createdAt: new Date().toISOString(),
          status: "pending",
        };
        addTask(task);
        // fire-and-forget: never hold the turn-ended observer on a model call
        if (autoJudge) void judgeTask(task, config, context).catch(() => {});
      }
    } catch {
      // observers are best-effort; a parse/store hiccup must not affect the turn
    }
  });

  // Opt-in (JEV_HOOK_INSTRUCT=1): teach agents the marker convention via their system prompt.
  server.before("agent.create", (input) => {
    if (process.env.JEV_HOOK_INSTRUCT !== "1") return undefined;
    const config = input.request.config;
    if (config.title === "jev judge") return undefined; // don't nudge our own judge subagents
    config.systemPrompt = config.systemPrompt ? `${config.systemPrompt}\n\n${INSTRUCTION}` : INSTRUCTION;
    return input.request;
  });
}
