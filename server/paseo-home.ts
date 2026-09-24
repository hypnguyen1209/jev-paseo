// v0.6.0: resolve the Paseo home dir the way the daemon does, so plugin data lands in the right
// place on a daemon started with PASEO_HOME or `--home` (not just the default ~/.paseo). Mirrors the
// convention used across the panrafal/paseo-plugins monorepo.
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function paseoHome(): string {
  const raw = process.env.PASEO_HOME;
  if (!raw) return join(homedir(), ".paseo");
  if (raw === "~") return homedir();
  if (raw.startsWith("~/") || raw.startsWith("~\\")) return resolve(homedir(), raw.slice(2));
  return raw;
}

/** `<paseoHome>/plugin-data/<name>` — where a plugin keeps its files. */
export function pluginData(name: string): string {
  return join(paseoHome(), "plugin-data", name);
}
