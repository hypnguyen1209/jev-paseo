# jev-paseo

A [Paseo](https://paseo.sh) plugin: a **judge-task queue** in your session. Queue up decisions
("judge tasks"); each one is resolved **by you** (tap an option) **or by a model** (an LLM judge on
the model *you* pick). It reproduces the jev/kev typed-decision **contract** — but model-agnostic.

| type | question | answer | confidence |
|------|----------|--------|------------|
| `choice` | pick 1 of N options | the chosen option | `(max − 1/K)/(1 − 1/K)` |
| `score`  | rate on an ordinal scale | expected level | `1 − E\|level−mode\|/(L−1)` |
| `noul`   | yes / no | `p(yes)` | distance from 50/50 |

The model judge is **calibrated**: with no deciding evidence it spreads probability toward
uncertainty → low confidence → `insufficient` under STRICT, instead of a confident guess.

## Surfaces

- **Composer pill** — a `Jev · N` button beside the composer (N = pending tasks). Click it to open
  the **queue popover**: every pending judge task, each with option chips (you decide) and an
  “🤖 ask <model>” button (a model decides). Add new tasks right there with “＋ new”.
- **Agent panel** (command center → *Jev: judge-task queue*) — the same queue, full size.
- **Inline card** — resolving a task drops a decision card into the session timeline: the answer,
  per-option bars, STRICT badge, `⚖ verdict · round N/max · fail-streak k/max · confidence%`, and
  whether it was decided **by you** or by which model.
- **Settings → Jev** — default model, STRICT default, confidence threshold, max judge rounds.

There is **no slash command** — the queue drives everything.

## Flow

1. Add a judge task (question + type + options, optional preferred model / evidence).
2. It sits **pending** in the queue (the pill shows the count).
3. Resolve it either way:
   - **You**: tap an option chip → resolved as a user decision (100%).
   - **A model**: tap “🤖 ask <model>” → the LLM judge runs on that model and resolves it.
4. Either way a decision card appears in the session and the task moves to **resolved**.

## STRICT multi-round judge

Under STRICT, each model round produces a probability distribution + confidence. A round is
`sufficient` only if confidence ≥ threshold (default 90%); otherwise the judge re-asks with feedback
up to `maxRounds` (default 2), tracking the fail streak. Final verdict is `sufficient` or
`insufficient`. Non-STRICT is a single round → `decided`.

## How it stays model-agnostic

Judging a task is just a headless Paseo subagent on the chosen model:

```ts
paseo.agents.create({
  config: { provider: "anthropic/claude-sonnet-5", systemPrompt, toolPolicy: { preapproved: [] } },
  cwd, parent: agentId, prompt, outputSchema, autoArchive: true,
});
// → waitForFinish() → parse the JSON distribution → confidence → card
```

Swap `provider` for any `provider/model` the host has — nothing else changes.

## Works with — Claude Code, Codex, pi (any Paseo provider)

jev-paseo uses only Paseo's **provider-neutral** APIs (the normalized timeline, `agents.create`, `agents.list`), so it works with **any agent harness Paseo runs** — no per-provider code. `claude` (Claude Code), `codex`, and `pi` are all **built-in Paseo direct providers** (`opencode`/`omp` too). Two independent roles, each can be any harness:

- **The session being judged** — run Claude Code / Codex / pi as a normal Paseo session. jev-paseo reads that session's timeline as *evidence* and drops decision cards into it. Identical for all three because Paseo normalizes every provider into one timeline shape.
- **The judge model** — pick any `provider/model` in the queue's *decide with* row (`claude/…`, `codex/…`, `pi/…`), or set a default in Settings. The judge runs as a headless subagent constrained to **JSON-only, no tools** (won't read files, run commands, or trigger permission prompts), with a timeout + graceful fallback — so a coding-agent provider stays stable as a judge.

**Setup:** `claude` / `codex` are auto-discovered when their CLIs are installed and authenticated (`claude`, `codex` on PATH); `pi` is process-backed (already configured on this host). Once discovered they appear in jev-paseo's model picker and as session providers — nothing plugin-specific to configure.

**Stability tip:** judge with a *fast, small* model even while the sessions you judge are heavier Claude Code / Codex runs — the judge only returns a distribution, not code.

## Agents can push questions (markers)

An agent (Claude Code / Codex / pi) can offload a decision to jev by emitting a **marker** line in its
output — Paseo doesn't let a plugin register an agent tool or a pre-tool-call hook, so the channel is
a marker parsed by an `agent.turn_ended` observer:

```
[jev] choice: Which fix is safer? | rollback | hotfix
[jev] yn strict: Is the failing test now passing?
[jev] score: Rate this diff's risk | trivial | low | medium | high | severe
```

Each new marker becomes a **pending** judge task in the queue (de-duped per question), resolved by
you or a model like any other. Configure via env on the daemon:

| Env | Effect |
|-----|--------|
| `JEV_HOOK_INSTRUCT=1` | Inject the marker convention into agent system prompts (opt-in; skips jev's own judge subagents). Off by default — otherwise teach it via your project's `AGENTS.md`/`CLAUDE.md`. |
| `JEV_HOOK_AUTOJUDGE=1` | Auto-judge marker tasks immediately (else they wait in the queue for you). |
| `JEV_HOOK_MODEL`, `JEV_HOOK_SAMPLES` | Model + self-consistency samples the auto-judge uses (the hook is server-side and can't read the client's settings on 0.8.0). |

Returning the verdict *back into the agent's context* (the full "harness" loop) is intentionally out
of scope here — that's a follow-up that would `agents.send` the result to the session.

## Install & develop

```bash
paseo plugin install ./jev-paseo   # needs a provider configured in Paseo

npm install
npm run demo       # the queue end-to-end (user + model resolution) — no daemon needed
npm test           # vitest: contract, judge loop, JSON extraction
npm run typecheck  # tsc against the Paseo plugin SDK
```

The decision logic (`shared/contract.ts`, `server/judge.ts`, `server/card-map.ts`) is SDK-free and
unit-tested; the rest is thin SDK glue + React Native UI. Pending tasks persist to
`~/.paseo/plugin-data/jev-tasks.json` (override with `JEV_TASKS_FILE`).

## v0.7 — no hosted model, native calibration

**No dependency on TypeSafe's jev model/API** — the judge is any LLM you already have, reproducing jev's approach natively:

- **Schema-constrained typed answer** — the model can only return a declared option key / valid distribution (no out-of-enum — jev's "can't return a type error").
- **Self-consistency** (`Settings → Jev → samples`) — set `samples ≥ 3` and the judge asks the model K times and **tallies the votes** into a calibrated empirical distribution, instead of trusting one self-reported number. `samples = 1` is the fast single-shot path.

## v0.3 — fan-out & confidence bands

Informed by studying the jev ecosystem (fast-jev-compaction, winnow, Canny, jev-codex-router, json-render):

- **Fan-out (“ask all”)** — resolve every pending judge task in **one** model call (`jev.judge-all`), the way a System One model answers many independent questions over one shared state at once. Big speed/cost win vs one call per task.
- **Confidence bands** — every decision now carries a band: **high** (≥ auto-accept → act), **medium** (≥ review floor → confirm/review), **low** (escalate). STRICT gates on the high band; the band is always shown on the card so you can act on it or not (both stances from the ecosystem are supported).

## v0.4 — presets, shadow mode, calibration

- **Preset recipes** — the “＋ new” form has one-tap recipes mirroring the ecosystem’s cookbook: `✓ verify` (Canny/citation-check), `⇄ route` (codex-router/LangChain), `▲ severity` + `⚠ guardrail` (llm_guardrails), `↕ relevant` (rerank), `⌦ keep?` (compaction/winnow).
- **Shadow mode** (`Settings → Jev`) — judges + logs + shows a card but leaves the task **pending**, so the model’s call sits next to your own. Turn it off to have judging resolve as usual.
- **Calibration** — every resolution (model *and* your manual picks) is appended to `~/.paseo/plugin-data/jev-decisions.jsonl`. The panel shows a live line: total decisions, model-vs-you split, mean confidence, band spread, and **you-vs-model agreement** (the regret signal — how often you overrode a shadow judgment). This is the winnow/Canny “log every decision, measure regret before you trust the gate” pattern.

## Notes / limits

- Decision cards are daemon-appended plugin timeline rows: they survive refetch/reconnect but are
  in-memory (lost on daemon restart). The task store and the model transcript persist.
- This mirrors the jev/kev *contract* (types + confidence math), not a benchmarked classifier — a
  general LLM's calibration is only as good as the model you pick.
