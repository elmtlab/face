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

case "\${1:-start}" in
  start)
    cd "\$FACE_ROOT"
    echo \$\$ > "\$PID_FILE"
    exec npx next start --port "\$PORT"
    ;;
  dev)
    cd "\$FACE_ROOT"
    echo \$\$ > "\$PID_FILE"
    exec npx next dev --port "\$PORT"
    ;;
  stop)
    if [ -f "\$PID_FILE" ]; then
      pid=\$(cat "\$PID_FILE")
      if kill -0 "\$pid" 2>/dev/null; then
        kill "\$pid"
      fi
      rm -f "\$PID_FILE"
    fi
    echo "FACE stopped."
    ;;
  -h|--help|help)
    echo "Usage: face [start|dev|stop|help]"
    echo ""
    echo "  start   Start the dashboard (default)"
    echo "  dev     Start in development mode"
    echo "  stop    Stop the running server"
    echo "  help    Show this help message"
    ;;
  *)
    echo "Usage: face [start|dev|stop|help]" >&2
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
