// v0.2.0: the composer-pill popover — the judge-task queue, opened from beside the composer.
import { View } from "react-native";
import { useAgent, type PluginButtonContentProps } from "@getpaseo/plugin/client";
import { JevQueueScreen } from "./queue";

export function JevQueuePopover(props: PluginButtonContentProps) {
  const agentId = props.context === "agent" ? props.agentId : "";
  const agent = useAgent(agentId, (a) => ({ cwd: a.cwd }));
  return (
    <View style={{ width: 340, maxWidth: "100%" }}>
      <JevQueueScreen
        theme={props.theme}
        workspaceId={props.workspaceId}
        agentId={agentId}
        cwd={agent?.cwd ?? "."}
        compact
      />
    </View>
  );
}
