// v0.3.0: app entry. Composer pill (judge-task queue) + agent panel + a full-tab surface (opened
// from the sidebar, like a session) + command item + settings + the timeline renderer that draws
// decision cards. No slash command. Synchronous contribute.
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { JevPanel } from "./client/panel";
import { JevSurface } from "./client/surface";
import { JevSettings } from "./client/settings";
import { JevDecisionCard } from "./client/card";
import { startJevPills } from "./client/pill";
import { DecisionCardSchema, JEV_DECISION_KIND, JEV_DECISION_VERSION } from "./shared/card";

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({
    id: "jev",
    title: "Jev",
    icon: "Scale",
    context: "agent",
    Component: JevPanel,
  });

  // Full-tab surface + sidebar entry. Guarded: older hosts lack these, so we fall back to the panel.
  const hasSurface = typeof client.addSurface === "function" && typeof client.addSidebarItem === "function";
  if (hasSurface) {
    client.addSurface("jev", JevSurface);
    client.addSidebarItem({ id: "jev", title: "Jev", icon: "Scale", surface: "jev" });
  }

  client.addCommandCenterItem({
    id: "jev-open",
    title: "Jev: judge-task queue",
    icon: "Scale",
    keywords: ["jev", "decision", "judge", "task", "choice", "score", "verdict"],
    context: "agent",
    onSelect(ctx) {
      if (hasSurface && typeof ctx.openSurface === "function") ctx.openSurface("jev");
      else ctx.openPanel("jev");
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
