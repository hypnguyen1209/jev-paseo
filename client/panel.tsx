// v0.2.0: the Jev agent panel — the judge-task queue for the current session.
import { useAgent, type PluginAgentPanelProps } from "@getpaseo/plugin/client";
import { JevQueueScreen } from "./queue";

export function JevPanel({ theme, workspaceId, agentId }: PluginAgentPanelProps) {
  const agent = useAgent(agentId, (a) => ({ cwd: a.cwd }));
  return <JevQueueScreen theme={theme} workspaceId={workspaceId} agentId={agentId} cwd={agent?.cwd ?? "."} />;
}
