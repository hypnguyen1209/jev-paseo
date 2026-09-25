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

  // Also expose a full-screen surface + sidebar entry + a global command for it. (addSurface and
  // addSidebarItem are required client-contract methods on 0.9, our manifest floor — no fallback.)
  client.addSurface("jev", JevSurface);
  // The left-sidebar row can be hidden when the sidebar is collapsed, so the command is global —
  // Ctrl/Cmd+K → "Jev" opens the full-screen tab from anywhere.
  client.addSidebarItem({ id: "jev", title: "Jev", icon: "Scale", surface: "jev" });
  client.addCommandCenterItem({
    id: "jev-open",
    title: "Jev: open full screen",
    icon: "Scale",
    keywords: ["jev", "decision", "judge", "task", "choice", "score", "verdict", "full", "screen"],
    context: "global",
    onSelect(ctx) {
      ctx.openSurface("jev");
    },
  });

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
