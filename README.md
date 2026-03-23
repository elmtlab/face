# face

`face` is an exploration repo for a new GUI for AI agents.

The working reference point is tools like Claude Code: fast, agent-driven, terminal-native in spirit, but with a stronger visual interface for context, actions, history, and state.

## Purpose

This repo exists to explore what a good interface for an AI agent should feel like when the agent is doing real work:

- reading and editing code
- running commands
- tracking progress
- surfacing plans and decisions
- keeping important context visible without overwhelming the user

## Initial Direction

We are not starting from a fixed product spec. The first goal is to find the right shape of the product by building and testing concrete interaction patterns.

Questions this repo should help answer:

- What deserves a GUI, and what should stay terminal-like?
- How should an agent show progress, reasoning, and confidence?
- How should file changes, commands, and approvals be presented?
- How can the interface stay fast while supporting long-running agent workflows?

## Principles

- Agent-first, not chatbot-first
- Fast to use during real work
- Clear state and clear control
- Good defaults for both technical and non-technical users
- Designed through prototypes, not abstract debate

## Near-Term Plan

1. Define the core interaction model.
2. Sketch a few strong interface directions.
3. Build a thin prototype to test the flow end to end.
4. Iterate based on real usage instead of static mockups alone.

## Status

Early exploration. The repo currently contains the initial project framing only.
