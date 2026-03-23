#!/usr/bin/env bash
set -euo pipefail

FACE_DIR="${FACE_DIR:-$HOME/.face}"
BIN_DIR="${BIN_DIR:-/usr/local/bin}"

echo "Installing FACE..."

# Install dependencies
npm install

# Build the app
npm run build

# Create data directory
mkdir -p "$FACE_DIR/tasks"

# Create the face launcher script
cat > "$BIN_DIR/face" <<'LAUNCHER'
#!/usr/bin/env bash
set -euo pipefail

FACE_ROOT="$(cd "$(dirname "$(readlink -f "$0" 2>/dev/null || realpath "$0")")/../share/face" 2>/dev/null && pwd)"
if [ -z "$FACE_ROOT" ] || [ ! -d "$FACE_ROOT" ]; then
  FACE_ROOT="FACE_INSTALL_DIR"
fi

PORT="${PORT:-3456}"

case "${1:-start}" in
  start)
    cd "$FACE_ROOT"
    exec npx next start -p "$PORT"
    ;;
  dev)
    cd "$FACE_ROOT"
    exec npx next dev --port "$PORT"
    ;;
  stop)
    pkill -f "next start -p $PORT" 2>/dev/null || pkill -f "next dev --port $PORT" 2>/dev/null || true
    echo "FACE stopped."
    ;;
  *)
    echo "Usage: face [start|dev|stop]"
    exit 1
    ;;
esac
LAUNCHER

# Patch in the actual install directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
sed -i.bak "s|FACE_INSTALL_DIR|$SCRIPT_DIR|g" "$BIN_DIR/face"
rm -f "$BIN_DIR/face.bak"

chmod +x "$BIN_DIR/face"

echo ""
echo "FACE installed successfully!"
echo ""
echo "  face        Start the dashboard (http://localhost:3456)"
echo "  face dev    Start in development mode"
echo "  face stop   Stop the running server"
echo ""
