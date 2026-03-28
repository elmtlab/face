# face

`face` is an adaptive GUI for AI agents.

The working reference point is tools like Claude Code: fast, agent-driven, terminal-native in spirit, but with a stronger visual interface for context, actions, history, and state.

## Quick Start

```bash
git clone https://github.com/anthropics/face.git
cd face
bun install
bun dev
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
| `bun install` | Install dependencies |
| `bun dev` | Start dev server ([http://localhost:3000](http://localhost:3000)) |
| `bun run build` | Production build |
| `bun start` | Start production server |
| `bun run lint` | Run linter |

## Security Scanning

Scan agent task operations for high-risk actions:

```bash
npm run security-scan                        # Scan all tasks
npm run security-scan -- --task <id>         # Scan a specific task
npm run security-scan -- --severity high     # Filter by minimum severity
npm run security-scan -- --json              # Output as JSON
```

The scanner checks every raw operation (shell commands, file edits, etc.) against 25+ security rules across 5 severity levels: critical, high, medium, low, and info. Exits with code 1 if any critical or high findings are detected.

Examples of what it catches:
- Destructive commands (`rm -rf`, `DROP TABLE`)
- Force pushes and hard resets
- Secrets/credentials access (`.env`, API keys)
- System path modifications
- CI/CD pipeline changes
- Suspicious network activity (`curl | bash`)

## How It Works

- **Agent detection**: Auto-detects locally installed AI CLIs on startup
- **Hook integration**: Configures Claude Code hooks (`UserPromptSubmit`, `PostToolUse`, `Stop`) to report task status
- **Task tracking**: Stores task state in `~/.face/tasks/` as JSON files
- **AI summaries**: Uses the local agent to generate concise task titles from user prompts
- **Security scanning**: Analyzes task operations against security rules to flag risky actions
- **Adaptive UI**: Layout adjusts based on user role and usage patterns

## Architecture

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- SQLite (better-sqlite3 + Drizzle ORM) for usage tracking
- `~/.face/tasks/*.json` for task state
- Agent plugin system via `AgentAdapter` interface
- Security scanner in `src/lib/security/`

## Principles

- Agent-first, not chatbot-first
- Outcome-focused: show what the user gets, not what tools ran
- Fast to use during real work
- Designed through prototypes, not abstract debate
