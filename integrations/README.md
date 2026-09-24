# Teaching the coding agents about jev

jev talks to whatever agent runs in Paseo through one channel: a `[jev]` marker line in the agent's output. An `agent.turn_ended` hook parses those lines the same way for every provider, so `claude`, `codex`, and `pi` all interact with jev identically. The only per-harness difference is how you hand the agent the instruction that teaches it to write markers.

Each harness reads project instructions from its own file. These integrations drop the jev protocol into the right one.

## Pick one path

### Zero-config, every harness

Run the plugin's daemon with `JEV_HOOK_INSTRUCT=1`. jev's `before("agent.create")` hook appends the marker protocol to every new agent's system prompt, regardless of provider. Nothing to install per project. Turn it off by unsetting the flag.

Use the per-harness files below instead when you want the instruction version-controlled with a project, editable, or (for Claude Code) surfaced as a skill.

### Claude Code

A skill (preferred) or a memory snippet.

```bash
# skill: copy into the project (or ~/.claude/skills for all projects)
mkdir -p .claude/skills/jev
cp integrations/claude-code/skills/jev/SKILL.md .claude/skills/jev/SKILL.md
```

Or append `integrations/claude-code/CLAUDE.md`'s `## jev decisions` section to your project `CLAUDE.md`.

### Codex CLI

Codex reads `AGENTS.md` at the repo root. Append the `## jev decisions` section from `integrations/codex/AGENTS.md` to your project's `AGENTS.md`.

### Pi

Pi auto-discovers `APPEND_SYSTEM.md` in the working directory and composes it into the system prompt (Paseo appends to it rather than replacing it). Copy `integrations/pi/APPEND_SYSTEM.md` to your project root, or merge its section into an existing one.

```bash
cp integrations/pi/APPEND_SYSTEM.md ./APPEND_SYSTEM.md
```

## How the loop runs

1. The agent hits a decision it should not guess and writes a marker, e.g. `[jev] yn strict: Did the failing test pass?`, then ends its turn.
2. jev's hook turns the line into a pending task (de-duped) tagged as agent-pushed.
3. You resolve it in the Jev panel (tap an option) or hand it to a model. The verdict lands as a card with a confidence band.
4. With `JEV_FEEDBACK=1` set on the daemon, jev sends the verdict back into that session as a `[jev] Decision on "...": ...` message, and the agent continues. Without it, you tell the agent the outcome.

Optional daemon flags: `JEV_HOOK_AUTOJUDGE=1` (auto-judge marker tasks with `JEV_HOOK_MODEL` / `JEV_HOOK_SAMPLES`), `JEV_FEEDBACK=1` (send the verdict back). See the top-level README's knobs table.

## The protocol

`integrations/jev-protocol.md` is the full reference. The short version:

```
[jev] <choice|score|yn> [strict]: <question> [| option | option ...]
```

`choice` and `score` need at least two `|`-separated options; `yn` takes none. `strict` re-asks until confidence clears the threshold.

## Check it works

With markers enabled, ask the agent to run something and gate on the result, for example: "run the tests, then ask jev whether they passed before you continue." When its turn ends, open the **Jev** tab or the composer pill; the question should be waiting there.
