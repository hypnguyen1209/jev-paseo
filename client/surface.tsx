// v0.4.0: the big Jev view, shared by two hosts:
//   - JevWorkspacePanel (context "workspace") — shows in the "+" tab menu, opens as a real
//     workspace tab you can drag and split alongside Agent / Terminal / Browser.
//   - JevSurface — a full-screen sidebar/command route.
// Both render JevBoard: a session picker plus the full-size JevQueueScreen for the picked session.
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import {
  usePaseo,
  type PluginSurfaceProps,
  type PluginWorkspacePanelProps,
} from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { JevQueueScreen } from "./queue";
import { Chip, Dropdown } from "./ui";

type Navigation = PluginSurfaceProps["navigation"];

interface Session {
  id: string;
  workspaceId: string;
  cwd: string;
  title: string;
}

// A real session has a workspaceId; our own headless judges ("jev judge") do not get one, and we
// drop them by title as a belt-and-suspenders guard.
function toSession(a: { id: string; workspaceId?: string | null; cwd?: string; title?: string | null; provider?: string }): Session | null {
  if (!a.workspaceId || a.title === "jev judge") return null;
  return { id: a.id, workspaceId: a.workspaceId, cwd: a.cwd || ".", title: a.title || a.provider || a.id.slice(0, 8) };
}

/** Live top-level sessions, tracked over the same agents subscription the composer pill uses. */
function useJevSessions(): Session[] {
  const paseo = usePaseo();
  const [sessions, setSessions] = useState<Session[]>([]);
  useEffect(() => {
    let stopped = false;
    let unsubscribe: (() => void) | undefined;
    let release: (() => void) | undefined;
    const lifetime = new AbortController();
    const map = new Map<string, Session>();
    const flush = () => {
      if (!stopped) setSessions([...map.values()]);
    };
    void paseo.agents
      .list({ subscribe: {}, signal: lifetime.signal })
      .then(({ subscription }) => {
        if (!subscription) return;
        if (stopped) {
          (subscription as { release?: () => void }).release?.();
          return;
        }
        release = () => (subscription as { release?: () => void }).release?.();
        unsubscribe = subscription.subscribe({
          snapshot: ({ entries }) => {
            map.clear();
            for (const { agent } of entries) {
              const s = toSession(agent);
              if (s) map.set(s.id, s);
            }
            flush();
          },
          update: (message) => {
            if (message.type !== "agent_update") return;
            const u = message.payload;
            if (u.kind === "remove") map.delete(u.agentId);
            else {
              const s = toSession(u.agent);
              if (s) map.set(s.id, s);
              else map.delete(u.agent.id);
            }
            flush();
          },
        });
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
      lifetime.abort();
      unsubscribe?.();
      release?.();
    };
  }, [paseo]);
  return sessions;
}

/** The shared board: pick a session across the top, judge its tasks below, full width. */
function JevBoard({ theme, navigation }: { theme: PluginTheme; navigation?: Navigation }) {
  const c = theme.colors;
  const sessions = useJevSessions();
  const [selectedId, setSelectedId] = useState("");
  const selected = useMemo(
    () => sessions.find((s) => s.id === selectedId) ?? sessions[0],
    [sessions, selectedId],
  );
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const openAgent = navigation?.openAgent;

  return (
    <View style={{ flex: 1, backgroundColor: c.surface0 }}>
      <View style={{ padding: 16, gap: 12, borderBottomWidth: 1, borderColor: c.border }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: c.foreground, fontSize: 18, fontWeight: "800" }}>⚖ Jev</Text>
          <Text style={{ color: c.foregroundMuted, fontSize: 13, flex: 1 }} numberOfLines={1}>
            {sessions.length <= 1 && selected ? selected.title : "judge-task queue"}
          </Text>
          {selected && openAgent ? (
            <Chip theme={theme} active={false} label="open session ↗" onPress={() => openAgent({ agentId: selected.id })} />
          ) : null}
        </View>
        {sessions.length > 1 ? (
          <Dropdown
            theme={theme}
            label="session"
            items={sessions.map((s) => ({ key: s.id, label: s.title }))}
            selectedKey={selected?.id ?? ""}
            onSelect={setSelectedId}
            placeholder="pick a session"
          />
        ) : null}
      </View>

      {selected ? (
        <View style={{ flex: 1, width: "100%" }}>
          <JevQueueScreen
            key={selected.id}
            theme={theme}
            workspaceId={selected.workspaceId}
            agentId={selected.id}
            cwd={selected.cwd}
          />
        </View>
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ color: c.foregroundMuted, textAlign: "center", maxWidth: 360 }}>
            No active session yet. Start an agent, then reopen Jev to queue and judge decisions here.
          </Text>
        </View>
      )}
    </View>
  );
}

/** Workspace tab: appears in the "+" menu, drag- and split-able like Agent / Terminal / Browser. */
export function JevWorkspacePanel({ theme, navigation }: PluginWorkspacePanelProps) {
  return <JevBoard theme={theme} navigation={navigation} />;
}

/** Full-screen sidebar / command route. */
export function JevSurface({ theme, navigation }: PluginSurfaceProps) {
  return <JevBoard theme={theme} navigation={navigation} />;
}
