# The jev decision protocol

jev is a Paseo plugin that turns a marker line in your output into a typed, calibrated decision task the user (or a model they choose) resolves. Use it to offload a small, high-stakes decision instead of guessing at one.

This file is the source of truth. The per-harness files (Claude Code skill, Codex `AGENTS.md`, Pi `APPEND_SYSTEM.md`) carry a compact copy of the same rules.

## When to use it

- A choice between a few concrete options where picking wrong is costly (which fix to ship, which branch, roll back or hotfix).
- A yes/no gate you should not decide alone (did the failing test actually pass? is this safe to run?).
- A risk or quality level on an ordered scale.

Do not use it for trivia, for anything you can verify yourself, or more than once or twice in a turn.

## How to ask

Write ONE marker on its own line, starting at the beginning of the line:

```
[jev] <type> [strict]: <question> [| option | option ...]
```

- `type` is `choice` (pick one of N options), `score` (a level on an ordered low-to-high scale), or `yn` (yes/no).
- `strict` is optional. It makes jev re-ask until confidence clears a threshold, or return "insufficient" when the evidence isn't there.
- `choice` and `score` need at least two options after the question, separated by `|`. `yn` takes no options.

### Examples

```
[jev] choice: Which fix is safer? | rollback | hotfix
[jev] yn strict: Did the failing test pass?
[jev] score: Rate this diff's risk | trivial | low | medium | high | severe
```

## What happens

The line becomes a pending decision in the Jev panel. A person taps an option, or hands it to a model, and the answer comes back as a probability with a confidence band (high, medium, low). If the host runs with `JEV_FEEDBACK=1`, the resolved verdict is sent back into this session as a `[jev] Decision on "...": ...` message.

## How to work with it

- Put the evidence in your message. jev judges from the recent session text, so state what you saw (the test output, the diff, the error) before the marker.
- Emit the marker as the last thing before you end the turn when you need the answer before continuing. jev reads markers when your turn ends.
- Then stop and wait. When the verdict arrives (feedback on), read it and continue. With feedback off, the user resolves it in the Jev panel and tells you.
