// v0.1.0: jev.list-models handler. Enumerates the host's installed providers/models so the panel
// and settings can offer a picker — the discovery half of "user specifies the model". Never throws.
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { JevModelsRpc } from "../shared/rpc";

type Input = RpcInput<typeof JevModelsRpc>;
type Output = RpcOutput<typeof JevModelsRpc>;

export async function modelsHandler(input: Input, context: PluginHandlerContext): Promise<Output> {
  try {
    const snapshot = (await context.paseo.providers.waitForReady({
      cwd: input.cwd,
      timeoutMs: 30_000,
    })) as unknown as {
      entries?: Array<{
        provider?: string;
        status?: string;
        models?: Array<{ id?: string; label?: string; isDefault?: boolean }>;
      }>;
    };

    const models: Output["models"] = [];
    for (const entry of snapshot?.entries ?? []) {
      if (entry.status && entry.status !== "ready") continue;
      const provider = entry.provider ?? "";
      for (const m of entry.models ?? []) {
        if (!m.id) continue;
        models.push({
          id: `${provider}/${m.id}`,
          label: m.label ?? m.id,
          provider,
          isDefault: Boolean(m.isDefault),
        });
      }
    }

    return {
      models,
      note: models.length ? undefined : "No provider models found. Configure a provider in Paseo settings.",
    };
  } catch (e) {
    return { models: [], note: e instanceof Error ? e.message : String(e) };
  }
}
