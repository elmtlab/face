#!/usr/bin/env bash
set -euo pipefail

FACE_DIR="${FACE_DIR:-$HOME/.face}"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"

# Check prerequisites
for cmd in node bun; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: $cmd is not installed." >&2
    exit 1
  fi
done

echo "Installing FACE..."

# Install dependencies
bun install

# Build the app
bun run build

# Create data directory
mkdir -p "$FACE_DIR" "$BIN_DIR"

# Create the face launcher script
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cat > "$BIN_DIR/face" <<LAUNCHER
#!/usr/bin/env bash
set -euo pipefail

FACE_ROOT="$SCRIPT_DIR"
FACE_DIR="\${FACE_DIR:-\$HOME/.face}"
PORT="\${PORT:-3456}"
PID_FILE="\$FACE_DIR/face.pid"

LOG_FILE="\$FACE_DIR/face.log"

_is_running() {
  [ -f "\$PID_FILE" ] && kill -0 "\$(cat "\$PID_FILE")" 2>/dev/null
}

_setup_hooks_directly() {
  # Register hooks directly into ~/.claude/settings.json without the server
  local SETTINGS_DIR="\$HOME/.claude"
  local SETTINGS_FILE="\$SETTINGS_DIR/settings.json"
  mkdir -p "\$SETTINGS_DIR"

  if ! command -v jq &>/dev/null; then
    echo "Error: jq is required for direct hook setup. Install jq and re-run 'face setup'." >&2
    return 1
  fi

  # Start with existing settings or empty object
  local SETTINGS='{}'
  if [ -f "\$SETTINGS_FILE" ]; then
    SETTINGS=\$(cat "\$SETTINGS_FILE")
  fi

  local HOOK_TAG="# face-hook"
  local BASE_URL="http://localhost:\$PORT"
  local TASK_URL="\$BASE_URL/api/hooks/task-update"
  local APPROVAL_URL="\$BASE_URL/api/hooks/tool-approval"
  local UNREVIEWED_URL="\$BASE_URL/api/hooks/tool-approval/unreviewed"

  # Build the hooks object with jq, removing any existing face hooks first
  SETTINGS=\$(echo "\$SETTINGS" | jq --arg tag "\$HOOK_TAG" --arg task_url "\$TASK_URL" --arg approval_url "\$APPROVAL_URL" --arg unreviewed_url "\$UNREVIEWED_URL" '
    # Remove existing face hooks
    (.hooks // {}) as \$h |
    (\$h | to_entries | map(
      .value = (.value | map(select(
        (.hooks // [] | all(.command // "" | contains(\$tag) | not)) and
        (.hooks // [] | all(.url // "" | contains("/api/hooks/") | not))
      )))
    ) | from_entries) as \$cleaned |

    .hooks = (\$cleaned + {
      UserPromptSubmit: ((\$cleaned.UserPromptSubmit // []) + [{
        hooks: [{
          type: "command",
          command: (\$tag + "\n[ -n \"$FACE_INTERNAL\" ] && exit 0\ncurl -s -X POST " + \$task_url + " -H '\''Content-Type: application/json'\'' -d \"$(cat | jq -c '\''{hook_type: \"UserPromptSubmit\", session_id: .session_id, prompt: .prompt}'\'')\" > /dev/null 2>&1 || true")
        }]
      }]),
      PostToolUse: ((\$cleaned.PostToolUse // []) + [{
        hooks: [{
          type: "command",
          command: (\$tag + "\n[ -n \"$FACE_INTERNAL\" ] && exit 0\ncurl -s -X POST " + \$task_url + " -H '\''Content-Type: application/json'\'' -d \"$(cat | jq -c '\''{hook_type: \"PostToolUse\", session_id: .session_id, tool_name: .tool_name, tool_input: .tool_input, tool_result: (.tool_result // \"\" | tostring | .[0:500])}'\'')\" > /dev/null 2>&1 || true")
        }]
      }]),
      PreToolUse: ((\$cleaned.PreToolUse // []) + [{
        hooks: [{
          type: "command",
          command: (\$tag + "\n[ -n \"$FACE_INTERNAL\" ] && exit 0\nINPUT=$(cat)\nPAYLOAD=$(echo \"$INPUT\" | jq -c '\''{session_id: .session_id, tool_name: .tool_name, tool_input: .tool_input, cwd: .cwd}'\'')\nRESP=$(curl -s --connect-timeout 10 --max-time 130 -X POST " + \$approval_url + " -H '\''Content-Type: application/json'\'' -d \"$PAYLOAD\" 2>/dev/null)\nRC=$?\nif [ $RC -ne 0 ] || [ -z \"$RESP\" ]; then\n  curl -s --connect-timeout 2 -X POST " + \$unreviewed_url + " -H '\''Content-Type: application/json'\'' -d \"$PAYLOAD\" > /dev/null 2>&1 || true\n  FACE_DIR=\"${HOME}/.face\"\n  mkdir -p \"$FACE_DIR\"\n  echo \"$(date -u +%Y-%m-%dT%H:%M:%SZ) AUTO_APPROVED tool=$(echo \"$INPUT\" | jq -r .tool_name) reason=server_unreachable\" >> \"$FACE_DIR/unreviewed.log\"\n  echo '\''{\"decision\":\"approve\",\"reason\":\"server_unreachable\"}'\''\n  exit 0\nfi\nDECISION=$(echo \"$RESP\" | jq -r '\''.decision // \"approve\"'\'')\nREASON=$(echo \"$RESP\" | jq -r '\''.reason // empty'\'')\nif [ \"$DECISION\" = \"reject\" ]; then\n  if [ -n \"$REASON\" ]; then\n    echo \"{\\\"decision\\\":\\\"block\\\",\\\"reason\\\":\\\"$REASON\\\"}\"\n  else\n    echo '\''{\"decision\":\"block\",\"reason\":\"Rejected by FACE\"}'\''\n  fi\n  exit 2\nfi\necho '\''{\"decision\":\"approve\"}'\''\nexit 0")
        }]
      }]),
      Stop: ((\$cleaned.Stop // []) + [{
        hooks: [{
          type: "command",
          command: (\$tag + "\n[ -n \"$FACE_INTERNAL\" ] && exit 0\ncurl -s -X POST " + \$task_url + " -H '\''Content-Type: application/json'\'' -d \"$(cat | jq -c '\''{hook_type: \"Stop\", session_id: .session_id, stop_reason: .stop_reason, last_assistant_message: (.last_assistant_message // \"\" | tostring | .[0:2000])}'\'')\" > /dev/null 2>&1 || true")
        }]
      }])
    })
  ')

  echo "\$SETTINGS" > "\$SETTINGS_FILE"
  echo "Hooks written to \$SETTINGS_FILE"
}

case "\${1:-start}" in
  start)
    if _is_running; then
      echo "FACE is already running (PID \$(cat "\$PID_FILE"))."
      echo "http://localhost:\$PORT"
      exit 0
    fi
    mkdir -p "\$FACE_DIR"
    cd "\$FACE_ROOT"
    nohup bunx next start --port "\$PORT" >> "\$LOG_FILE" 2>&1 &
    echo \$! > "\$PID_FILE"
    echo "FACE started in background (PID \$!)."
    echo "http://localhost:\$PORT"
    echo "Logs: \$LOG_FILE"
    ;;
  dev)
    if _is_running; then
      echo "FACE is already running (PID \$(cat "\$PID_FILE"))."
      echo "http://localhost:\$PORT"
      exit 0
    fi
    mkdir -p "\$FACE_DIR"
    cd "\$FACE_ROOT"
    nohup bunx next dev --port "\$PORT" >> "\$LOG_FILE" 2>&1 &
    echo \$! > "\$PID_FILE"
    echo "FACE started in dev mode (PID \$!)."
    echo "http://localhost:\$PORT"
    echo "Logs: \$LOG_FILE"
    ;;
  stop)
    if _is_running; then
      pid=\$(cat "\$PID_FILE")
      pkill -P "\$pid" 2>/dev/null; kill "\$pid" 2>/dev/null
      rm -f "\$PID_FILE"
      echo "FACE stopped (PID \$pid)."
    else
      rm -f "\$PID_FILE"
      echo "FACE is not running."
    fi
    ;;
  status)
    if _is_running; then
      echo "FACE is running (PID \$(cat "\$PID_FILE"))."
      echo "http://localhost:\$PORT"
    else
      echo "FACE is not running."
    fi
    ;;
  logs)
    if [ -f "\$LOG_FILE" ]; then
      tail -f "\$LOG_FILE"
    else
      echo "No log file found."
    fi
    ;;
  setup)
    echo "Registering Claude Code hooks..."
    # Call the FACE setup API if the server is running
    if _is_running; then
      RESP=\$(curl -s --connect-timeout 5 -X POST "http://localhost:\$PORT/api/setup/configure" \
        -H 'Content-Type: application/json' \
        -d '{"agentId":"claude-code"}' 2>/dev/null)
      if echo "\$RESP" | grep -q '"success":true'; then
        echo "Claude Code hooks registered successfully."
      else
        echo "Warning: Hook registration via API failed. Response: \$RESP" >&2
        echo "Falling back to direct settings update..."
        _setup_hooks_directly
      fi
    else
      echo "FACE server is not running. Configuring hooks directly..."
      _setup_hooks_directly
    fi
    ;;
  -h|--help|help)
    echo "Usage: face [start|dev|stop|status|logs|setup|help]"
    echo ""
    echo "  start    Start the dashboard in background (default)"
    echo "  dev      Start in development mode (background)"
    echo "  stop     Stop the running server"
    echo "  status   Check if FACE is running"
    echo "  logs     Tail the server logs"
    echo "  setup    Register Claude Code hooks (re-run after reinstalling Claude Code)"
    echo "  help     Show this help message"
    ;;
  *)
    echo "Usage: face [start|dev|stop|status|logs|setup|help]" >&2
    exit 1
    ;;
esac
LAUNCHER

chmod +x "$BIN_DIR/face"

echo ""
echo "FACE installed successfully!"
echo ""
echo "  face        Start the dashboard (http://localhost:3456)"
echo "  face dev    Start in development mode"
echo "  face stop   Stop the running server"
echo ""

# Auto-register Claude Code hooks
if command -v jq &>/dev/null; then
  echo "Registering Claude Code hooks..."
  "$BIN_DIR/face" setup
else
  echo "Note: Install jq to enable automatic Claude Code hook registration."
  echo "  Then run: face setup"
  echo ""
fi

# Remind user to add BIN_DIR to PATH if needed
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo "Note: Add $BIN_DIR to your PATH:"
  echo "  export PATH=\"$BIN_DIR:\$PATH\""
  echo ""
fi
