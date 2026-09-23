// v0.2.0: daemon entry. Registers host-scoped settings + the judge-task RPC handlers.
// Synchronous contribute returning a cleanup fn (the loader rejects an async default export).
import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  JevAddTaskRpc,
  JevJudgeAllRpc,
  JevJudgeTaskRpc,
  JevListTasksRpc,
  JevModelsRpc,
  JevRemoveTaskRpc,
  JevResolveTaskRpc,
  JevStatsRpc,
} from "./shared/rpc";
import { jevSettings } from "./shared/settings";
import { modelsHandler } from "./server/models";
import { registerJevHook } from "./server/hook";
import {
  addTaskHandler,
  judgeAllHandler,
  judgeTaskHandler,
  listTasksHandler,
  removeTaskHandler,
  resolveTaskHandler,
  statsHandler,
} from "./server/tasks";

export default function contribute(server: PluginServerContext) {
  // Registers the schema so the client's useSettings can persist. 0.8.0 returns void (no server-side
  // read handle), so the effective settings are passed into judge RPCs as `config` from the client.
  server.registerSettings(jevSettings);
  server.handle(JevModelsRpc, modelsHandler);
  server.handle(JevListTasksRpc, listTasksHandler());
  server.handle(JevAddTaskRpc, addTaskHandler());
  server.handle(JevJudgeTaskRpc, judgeTaskHandler());
  server.handle(JevJudgeAllRpc, judgeAllHandler());
  server.handle(JevResolveTaskRpc, resolveTaskHandler());
  server.handle(JevRemoveTaskRpc, removeTaskHandler());
  server.handle(JevStatsRpc, statsHandler());
  registerJevHook(server); // agents can push jev questions via `[jev] …` markers
  return () => {};
}
