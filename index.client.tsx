// v0.4.0: app entry. Composer pill (judge-task queue) + a Jev workspace panel that shows in the
// "+" tab menu and opens as a draggable / splittable tab + a full-screen surface (sidebar / command)
// + settings + the timeline renderer that draws decision cards. No slash command. Sync contribute.
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { JevSurface, JevWorkspacePanel } from "./client/surface";
import { JevSettings } from "./client/settings";
import { JevDecisionCard } from "./client/card";
import { startJevPills } from "./client/pill";
import { DecisionCardSchema, JEV_DECISION_KIND, JEV_DECISION_VERSION } from "./shared/card";

export default function contribute(client: PluginClientContext) {
  // Workspace-context panel: the "+" tab menu only lists workspace panels, and a workspace panel
  // opens as a real tab you can drag and split next to Agent / Terminal / Browser.
  client.addWorkspacePanel({
    id: "jev",
    title: "Jev",
    icon: "Scale",
    context: "workspace",
    Component: JevWorkspacePanel,
  });

  // Also expose a full-screen surface + sidebar entry + a global command for it.
  const canSurface = typeof client.addSurface === "function";
  const keywords = ["jev", "decision", "judge", "task", "choice", "score", "verdict", "full", "screen"];
  if (canSurface) {
    client.addSurface("jev", JevSurface);
    // The left-sidebar row can be hidden when the sidebar is collapsed, so the command is global —
    // Ctrl/Cmd+K → "Jev" opens the full-screen tab from anywhere.
    if (typeof client.addSidebarItem === "function")
      client.addSidebarItem({ id: "jev", title: "Jev", icon: "Scale", surface: "jev" });
    client.addCommandCenterItem({
      id: "jev-open",
      title: "Jev: open full screen",
      icon: "Scale",
      keywords,
      context: "global",
      onSelect(ctx) {
        ctx.openSurface("jev");
      },
    });
  } else {
    client.addCommandCenterItem({
      id: "jev-open",
      title: "Jev: judge-task queue",
      icon: "Scale",
      keywords,
      context: "agent",
      onSelect(ctx) {
        ctx.openPanel("jev");
      },
    });
  }

  client.addSettingsScreen({
    id: "jev",
    title: "Jev",
    icon: "Scale",
    Component: JevSettings,
  });

  client.addTimelineRenderer({
    kind: JEV_DECISION_KIND,
    version: JEV_DECISION_VERSION,
    schema: DecisionCardSchema,
    Component: JevDecisionCard,
  });

  const stopPills = startJevPills(client);
  return () => {
    stopPills();
  };
}
