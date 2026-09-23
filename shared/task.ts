// v0.2.0: a "judge task" — a pending decision that the user OR a model resolves. Persisted by the
// server so the composer-pill queue survives across turns. `result` is the card once resolved.
import { z } from "zod";
import { DecisionCardSchema } from "./card";

export const JevTaskSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  agentId: z.string(),
  cwd: z.string(),
  type: z.enum(["noul", "choice", "score"]),
  instructions: z.string(),
  options: z.array(z.string()).default([]),
  state: z.string().optional(),
  /** preferred provider/model for this task; overridable when judging. */
  model: z.string().optional(),
  strict: z.boolean().optional(),
  createdAt: z.string(),
  status: z.enum(["pending", "resolved"]),
  decidedBy: z.enum(["user", "model"]).optional(),
  result: DecisionCardSchema.optional(),
});

export type JevTask = z.infer<typeof JevTaskSchema>;

/** Display option set + the keys used by the judge (mirrors contract.optionsOf / card-map.buildQuestion). */
export function taskOptions(t: Pick<JevTask, "type" | "options">): { key: string; label: string }[] {
  if (t.type === "noul") {
    return [
      { key: "no", label: "no" },
      { key: "yes", label: "yes" },
    ];
  }
  if (t.type === "score") return t.options.map((label, i) => ({ key: String(i), label }));
  return t.options.map((label, i) => ({ key: `o${i}`, label }));
}
