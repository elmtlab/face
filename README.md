# face

`face` is an adaptive GUI for AI agents.

The working reference point is tools like Claude Code: fast, agent-driven, terminal-native in spirit, but with a stronger visual interface for context, actions, history, and state.

## Quick Start

```bash
git clone https://github.com/anthropics/face.git
cd face
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Install (Production CLI)

```bash
./install.sh
```

This installs dependencies, builds the app, and adds a `face` command to `~/.local/bin`. Override the install location with `BIN_DIR=/your/path ./install.sh`.

## Usage

```bash
face          # Start the dashboard in background (http://localhost:3456)
face dev      # Start in dev mode (background)
face stop     # Stop the running server
face status   # Check if FACE is running
face logs     # Tail the server logs
```

On first launch, FACE detects installed AI agents (Claude Code, Codex) and configures hooks to track task progress.

## Development

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run dev` | Start dev server ([http://localhost:3000](http://localhost:3000)) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run linter |

## How It Works

- **Agent detection**: Auto-detects locally installed AI CLIs on startup
- **Hook integration**: Configures Claude Code hooks (`UserPromptSubmit`, `PostToolUse`, `Stop`) to report task status
- **Task tracking**: Stores task state in `~/.face/tasks/` as JSON files
- **AI summaries**: Uses the local agent to generate concise task titles from user prompts
- **Adaptive UI**: Layout adjusts based on user role and usage patterns

## Architecture

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- SQLite (better-sqlite3 + Drizzle ORM) for usage tracking
- `~/.face/tasks/*.json` for task state
- Agent plugin system via `AgentAdapter` interface

## Principles

- Agent-first, not chatbot-first
- Outcome-focused: show what the user gets, not what tools ran
- Fast to use during real work
- Designed through prototypes, not abstract debate
