#!/usr/bin/env bash
# Install the jev decision protocol for the coding agents that run in Paseo.
# Teaches each harness (Claude Code, Codex, Pi) to emit [jev] markers, which the jev plugin's
# turn_ended hook turns into decision tasks. Idempotent: re-running updates the block in place.
#
# Windows: run from Git Bash: `bash integrations/install.sh ...`.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
snippet="$here/snippet.md"

target="$PWD"
global=0
memory=0
harnesses=()

# frontmatter for the generated Claude Code skill; the body comes from snippet.md (single source)
skill_frontmatter='---
name: jev-decision
description: Offload a small, high-stakes typed decision to the jev Paseo plugin by emitting a [jev] marker line. Use when a choice, a yes/no gate, or a risk level should be decided by the user (or a model they pick) rather than guessed.
---
'

usage() {
  cat <<'USAGE'
Install the jev decision protocol for agents running in Paseo.

Usage: bash install.sh [options] [claude|codex|pi|all ...]

  --target DIR   project directory to install into (default: current directory)
  --global       Claude Code: install the skill under ~/.claude/skills (all projects)
  --memory       Claude Code: append to CLAUDE.md instead of installing the skill
  -h, --help     show this help

No harness given installs all three. Re-running is safe (updates in place).

Examples:
  bash install.sh                       # all three, into ./
  bash install.sh --target ../myproj codex pi
  bash install.sh --global claude       # skill for every Claude Code project
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --target) target="$2"; shift 2 ;;
    --global) global=1; shift ;;
    --memory) memory=1; shift ;;
    -h|--help) usage; exit 0 ;;
    claude|codex|pi|all) harnesses+=("$1"); shift ;;
    *) echo "unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done
[ ${#harnesses[@]} -eq 0 ] && harnesses=(all)
case " ${harnesses[*]} " in *" all "*) harnesses=(claude codex pi) ;; esac

[ -f "$snippet" ] || { echo "missing $snippet" >&2; exit 1; }

# Append (or replace) the jev block, fenced by sentinels, in a markdown file. Creates it if absent.
append_block() {
  local file="$1"
  mkdir -p "$(dirname "$file")"
  [ -f "$file" ] || : > "$file"
  local tmp; tmp="$(mktemp)"
  # drop any previous jev block (between the sentinels, inclusive)
  awk '/<!-- jev:begin -->/{skip=1} skip==0{print} /<!-- jev:end -->/{skip=0}' "$file" > "$tmp"
  { cat "$tmp"; printf '\n<!-- jev:begin -->\n'; cat "$snippet"; printf '<!-- jev:end -->\n'; } > "$file"
  rm -f "$tmp"
  echo "  updated $file"
}

for h in "${harnesses[@]}"; do
  case "$h" in
    codex) echo "codex:"; append_block "$target/AGENTS.md" ;;
    pi)    echo "pi:"; append_block "$target/APPEND_SYSTEM.md" ;;
    claude)
      echo "claude:"
      if [ "$memory" -eq 1 ]; then
        append_block "$target/CLAUDE.md"
      else
        local_dest="$target/.claude/skills/jev/SKILL.md"
        [ "$global" -eq 1 ] && local_dest="$HOME/.claude/skills/jev/SKILL.md"
        mkdir -p "$(dirname "$local_dest")"
        { printf '%s\n' "$skill_frontmatter"; cat "$snippet"; } > "$local_dest"
        echo "  installed $local_dest"
      fi
      ;;
  esac
done

cat <<'NOTE'

Done. Reload the jev plugin / restart the agents to pick up the instructions.

Optional daemon env flags (set on the Paseo daemon, not per project):
  JEV_HOOK_INSTRUCT=1   inject the marker convention into every agent (no per-project files needed)
  JEV_HOOK_AUTOJUDGE=1  auto-judge marker tasks (+ JEV_HOOK_MODEL / JEV_HOOK_SAMPLES)
  JEV_FEEDBACK=1        send a resolved verdict back into the agent's session
NOTE
