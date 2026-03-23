#!/usr/bin/env bash
set -euo pipefail

FACE_DIR="${FACE_DIR:-$HOME/.face}"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"

# Check prerequisites
for cmd in node npm; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: $cmd is not installed." >&2
    exit 1
  fi
done

echo "Installing FACE..."

# Install dependencies
npm install

# Build the app
npm run build

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

case "\${1:-start}" in
  start)
    if _is_running; then
      echo "FACE is already running (PID \$(cat "\$PID_FILE"))."
      echo "http://localhost:\$PORT"
      exit 0
    fi
    mkdir -p "\$FACE_DIR"
    cd "\$FACE_ROOT"
    nohup npx next start --port "\$PORT" > "\$LOG_FILE" 2>&1 &
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
    nohup npx next dev --port "\$PORT" > "\$LOG_FILE" 2>&1 &
    echo \$! > "\$PID_FILE"
    echo "FACE started in dev mode (PID \$!)."
    echo "http://localhost:\$PORT"
    echo "Logs: \$LOG_FILE"
    ;;
  stop)
    if _is_running; then
      pid=\$(cat "\$PID_FILE")
      kill "\$pid" 2>/dev/null
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
  -h|--help|help)
    echo "Usage: face [start|dev|stop|status|logs|help]"
    echo ""
    echo "  start    Start the dashboard in background (default)"
    echo "  dev      Start in development mode (background)"
    echo "  stop     Stop the running server"
    echo "  status   Check if FACE is running"
    echo "  logs     Tail the server logs"
    echo "  help     Show this help message"
    ;;
  *)
    echo "Usage: face [start|dev|stop|status|logs|help]" >&2
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

# Remind user to add BIN_DIR to PATH if needed
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo "Note: Add $BIN_DIR to your PATH:"
  echo "  export PATH=\"$BIN_DIR:\$PATH\""
  echo ""
fi
