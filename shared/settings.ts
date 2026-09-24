// v0.1.0: host-scoped defaults. `defaultModel` is the fallback provider/model used when a /jev
// call or the panel doesn't override it — this is what makes "set the model once" work.
import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const jevSettingsSchema = z
  .object({
    defaultModel: z.string().trim().default(""),
    strict: z.boolean().default(true),
    /** high-band / auto-accept confidence (STRICT gate). */
    threshold: z.number().min(0).max(1).default(0.9),
    /** medium-band floor: below this is "low" (escalate). */
    reviewFloor: z.number().min(0).max(1).default(0.6),
    maxRounds: z.number().int().min(1).max(5).default(2),
    /**
     * self-consistency: 1 = one self-reported distribution (fast); ≥2 = K votes tallied (calibrated).
     * Voting only calibrates on a provider that samples (temperature > 0) — Claude Code / Codex do
     * by default. A deterministic provider returns K identical votes, so confidence lands at 0/1.
     */
    samples: z.number().int().min(1).max(9).default(1),
    /** shadow mode: judge + log + show a card, but DON'T resolve — for calibrating against your own picks. */
    shadow: z.boolean().default(false),
    /** feedback: when a task the agent pushed via a [jev] marker resolves, send the verdict back into
     * its session with agents.send so the agent continues. Also enabled by the JEV_FEEDBACK=1 env. */
    feedback: z.boolean().default(false),
    /** feedbackAll: with feedback on, also send back tasks you created yourself, not just marker ones.
     * Also enabled by JEV_FEEDBACK_ALL=1. Off by default so your own tasks don't nudge the agent. */
    feedbackAll: z.boolean().default(false),
  })
  // reviewFloor is the medium/low cutoff and must sit at or below the high-band threshold, else the
  // medium band is unreachable and bandOf would auto-accept below the user's review floor.
  .refine((v) => v.reviewFloor <= v.threshold, {
    message: "reviewFloor must be ≤ threshold",
    path: ["reviewFloor"],
  });

export const jevSettings = defineSettings({
  id: "jev",
  scope: "host",
  version: 1,
  schema: jevSettingsSchema,
});

export type JevSettingsValues = z.infer<typeof jevSettingsSchema>;
