# Teaching the coding agents about jev

jev talks to whatever agent runs in Paseo through one channel: a `[jev]` marker line in the agent's output. An `agent.turn_ended` hook parses those lines the same way for every provider, so `claude`, `codex`, and `pi` all interact with jev identically. The only per-harness difference is which instruction file the agent reads. These integrations drop the same protocol into the right file for each.

`snippet.md` is the block that gets installed. `jev-protocol.md` is the fuller reference.

## Install (automated)

Run the installer from Git Bash (it works on macOS/Linux too):

```bash
# all three harnesses, into the current project
bash integrations/install.sh

# a specific project and specific harnesses
bash integrations/install.sh --target ../my-project codex pi

# a Claude Code skill for every project (not just this one)
bash integrations/install.sh --global claude
```

What it writes, per harness:

| Harness | File | How the harness loads it |
| --- | --- | --- |
| Claude Code | `.claude/skills/jev/SKILL.md` (or `~/.claude/skills/...` with `--global`) | a skill; use `--memory` to append to `CLAUDE.md` instead |
| Codex CLI | `AGENTS.md` (repo root) | project instructions |
| Pi | `APPEND_SYSTEM.md` (repo root) | Pi auto-discovers it in the cwd and composes it into the system prompt |

Re-running is safe. The block is fenced with `<!-- jev:begin -->` / `<!-- jev:end -->`, so a second run updates it in place and never duplicates or touches your other content. `bash install.sh --help` lists the flags.

## Install (manual)

If you would rather not run the script, paste the contents of `snippet.md` into the file for your harness:

- **Claude Code**: copy `claude-code/skills/jev/SKILL.md` to `.claude/skills/jev/SKILL.md`, or append `snippet.md` to `CLAUDE.md`.
- **Codex CLI**: append `snippet.md` to your `AGENTS.md`.
- **Pi**: append `snippet.md` to `APPEND_SYSTEM.md` at the project root.

## Zero-config alternative

Run the plugin's daemon with `JEV_HOOK_INSTRUCT=1`. jev's `before("agent.create")` hook appends the protocol to every new agent's system prompt for every provider, so there's nothing to install per project. Use the files above when you want the instruction version-controlled with a project or surfaced as a Claude skill.

## How the loop runs

1. The agent hits a decision it should not guess and writes a marker, e.g. `[jev] yn strict: Did the failing test pass?`, then ends its turn.
2. jev's hook turns the line into a pending task (de-duped) tagged as agent-pushed.
3. You resolve it in the Jev panel (tap an option) or hand it to a model. The verdict lands as a card with a confidence band.
4. With `JEV_FEEDBACK=1` on the daemon, jev sends the verdict back into that session as a `[jev] Decision on "...": ...` message and the agent continues. Without it, you tell the agent the outcome.

Related daemon flags: `JEV_HOOK_AUTOJUDGE=1` (auto-judge marker tasks, with `JEV_HOOK_MODEL` / `JEV_HOOK_SAMPLES`) and `JEV_FEEDBACK=1`. See the top-level README's knobs table.

## Check it works

With markers enabled, give the agent a task that gates on a result, for example: "run the tests, then ask jev whether they passed before you continue." When its turn ends, open the **Jev** tab or the composer pill; the question should be waiting there.
