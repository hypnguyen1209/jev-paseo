# jev-paseo — plan

> **v0.2 update:** redesigned into a **judge-task queue**. No slash command. A composer pill
> (`Jev · N`) opens a popover listing every pending judge task; each is resolved **by the user**
> (tap an option) or **by a model** (`jev.judge-task`). Tasks persist in `server/store.ts`
> (`~/.paseo/plugin-data/jev-tasks.json`). RPCs: `jev.list-models` / `list-tasks` / `add-task` /
> `judge-task` / `resolve-task` / `remove-task`. UI: `client/queue.tsx` (shared by panel + popover),
> `client/pill.ts`, `client/form.tsx`. See README for the current shape; the notes below are the
> original one-shot design.


A self-contained Paseo plugin that runs **jev/kev-style typed decisions** over any state
using **any user-chosen LLM** (no dependency on a fine-tuned model), rendering the verdict
as an **inline card in the session timeline** plus a workspace panel.

## What it reproduces from kev/jev
kev/jev is a typed-decision classifier (no prompts — logic is in fine-tuned weights). We
re-implement only its **contract** on top of an arbitrary chat model:

- Three question types: `choice` (pick 1 of N), `score` (ordinal level), `noul` (yes/no → p).
- Output: a calibrated probability distribution over the fixed option set, plus a derived
  answer and a **confidence** (kev's `choice_confidence` / `score_confidence`, verbatim).
- Calibration philosophy: when the state lacks deciding evidence, spread probability toward
  uncertainty instead of guessing — surfaced as low confidence → `insufficient` under STRICT.

## Model-agnostic mechanism (Paseo SDK)
- Discover models: `paseo.providers.waitForReady()` → flat `provider/model` list (panel + settings).
- Judge call: `paseo.agents.create({ config:{ provider:"provider/model", systemPrompt, toolPolicy:{preapproved:[]} }, cwd, parent: agentId, prompt, outputSchema, autoArchive:true })`
  then `handle.waitForFinish()` → parse `lastMessage` JSON.
- Render: `paseo.agents.ref(agentId).timeline.append({ type:"plugin", kind:"jev-decision", version:1, data })`.

## Surfaces
- `/jev` slash command (context: agent): `choice|score|yn [model=prov/model] [strict] <question> | opt | opt`.
- Inline timeline card (`jev-decision` renderer): verdict, chosen answer, per-option bars, STRICT badge, rounds/fail-streak, confidence, model, expandable reasoning.
- Workspace panel (context: agent): model picker (from providers), type/strict/threshold, question + options + optional state, "Run decision", recent results.
- Settings screen: default model, strict, threshold, maxRounds.

## Multi-round STRICT judge (matches the screenshot)
`runJudge`: up to `maxRounds` (default 2). Each round asks the model for a distribution; compute
confidence. STRICT → round is `sufficient` only if `confidence ≥ threshold` (default 0.9), else
re-ask with feedback and increment `failStreak`. Verdict = `sufficient` | `insufficient` (STRICT)
or `decided` (non-STRICT). Card footer: `⚖ verdict · round N/max · fail-streak k/max · C%`.

## Module layout (SilverKnightKMA conventions: split runtime, dotted RPC names, handlers never throw)
```
paseo-plugin.json         { id:"jev", requirements:{ paseo:">=0.8.0" } }
package.json tsconfig.json vitest.config.ts
shared/contract.ts        PURE: types, optionsOf, normalizeDistribution, confidences, assemble, prompt+schema builders
shared/model-json.ts      PURE: tolerant JSON extraction from model text
shared/command.ts         PURE: parse the /jev arg string
shared/rpc.ts             zod RPC contracts: jev.decide, jev.list-models
shared/settings.ts        defineSettings (default model, strict, threshold, maxRounds)
shared/card.ts            DecisionCard zod schema (shared by RPC output + renderer)
server/judge.ts           runJudge multi-round loop (injected ask → unit-testable)
server/decide.ts          jev.decide handler: judge on chosen model + append card
server/models.ts          jev.list-models handler: enumerate providers/models
index.server.ts           registerSettings + handle(decide/models)
index.client.tsx          panel + command item + settings screen + slash command + timeline renderer
client/card.tsx           JevDecisionCard renderer
client/panel.tsx          JevPanel (agent panel)
client/settings.tsx       JevSettings screen
```

## Tests (vitest, pure modules only — no RN/daemon)
- `shared/contract.test.ts`: confidence formulas vs known values, distribution normalization (missing/negative/NaN/all-zero → uniform), assemble for all 3 types, schema/prompt shape.
- `shared/model-json.test.ts`: plain JSON, fenced JSON, surrounding prose, garbage → null.
- `shared/command.test.ts`: each type, model= + strict flags anywhere, options split, error cases.
- `server/judge.test.ts`: STRICT low-confidence → multi-round + insufficient + failStreak; high-confidence → 1 round sufficient; non-STRICT → decided.

## Verification
`npm run test` (vitest) green, `npm run typecheck` (tsc) clean. (Full install/run inside a live
Paseo daemon is out of scope here — glue is kept thin and the decision logic is the tested part.)
