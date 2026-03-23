#!/usr/bin/env bash
set -euo pipefail

# FACE — AI Agent Dashboard
# One-command installer

INSTALL_DIR="${FACE_INSTALL_DIR:-$HOME/.face}"
REPO_URL="https://github.com/anthropics/face.git"
PORT="${FACE_PORT:-3456}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[face]${NC} $1"; }
ok()    { echo -e "${GREEN}[face]${NC} $1"; }
warn()  { echo -e "${YELLOW}[face]${NC} $1"; }
err()   { echo -e "${RED}[face]${NC} $1" >&2; }

# --- Pre-checks ---

check_dep() {
  if ! command -v "$1" &>/dev/null; then
    err "$1 is required but not installed."
    echo "  Install it from: $2"
    exit 1
  fi
}

info "Checking dependencies..."
check_dep node   "https://nodejs.org"
check_dep npm    "https://nodejs.org"
check_dep git    "https://git-scm.com"

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  err "Node.js 18+ is required (found $(node -v))"
  exit 1
fi

# --- Install ---

if [ -d "$INSTALL_DIR/app" ]; then
  info "Existing installation found, updating..."
  cd "$INSTALL_DIR/app"
  git pull --ff-only 2>/dev/null || warn "Could not pull latest changes (offline or diverged)"
else
  info "Installing FACE to $INSTALL_DIR..."
  mkdir -p "$INSTALL_DIR"

  # If running from a local repo (e.g. cloned already), copy it
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ -f "$SCRIPT_DIR/package.json" ] && grep -q '"face-scaffold"' "$SCRIPT_DIR/package.json" 2>/dev/null; then
    info "Installing from local source..."
    cp -r "$SCRIPT_DIR" "$INSTALL_DIR/app"
  else
    info "Cloning repository..."
    git clone "$REPO_URL" "$INSTALL_DIR/app"
  fi

  cd "$INSTALL_DIR/app"
fi

info "Installing npm dependencies..."
npm install --no-fund --no-audit 2>&1 | tail -1

info "Building application..."
npm run build 2>&1 | tail -3

# --- Create data directory ---
mkdir -p "$INSTALL_DIR/app/data"

# --- Install CLI ---

FACE_BIN="$INSTALL_DIR/bin/face"
mkdir -p "$INSTALL_DIR/bin"

cat > "$FACE_BIN" << 'FACECLI'
#!/usr/bin/env bash
set -euo pipefail

FACE_HOME="${FACE_INSTALL_DIR:-$HOME/.face}"
APP_DIR="$FACE_HOME/app"
PID_FILE="$FACE_HOME/face.pid"
LOG_FILE="$FACE_HOME/face.log"
PORT="${FACE_PORT:-3456}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

usage() {
  echo "Usage: face <command>"
  echo ""
  echo "Commands:"
  echo "  start       Start the FACE server (port $PORT)"
  echo "  stop        Stop the FACE server"
  echo "  restart     Restart the FACE server"
  echo "  status      Check if the server is running"
  echo "  logs        Tail the server logs"
  echo "  dev         Start in development mode (foreground)"
  echo "  open        Open FACE in the browser"
  echo ""
  echo "Environment variables:"
  echo "  FACE_PORT           Server port (default: 3456)"
  echo "  FACE_INSTALL_DIR    Installation directory (default: ~/.face)"
}

is_running() {
  if [ -f "$PID_FILE" ]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      return 0
    else
      rm -f "$PID_FILE"
    fi
  fi
  return 1
}

cmd_start() {
  if is_running; then
    echo -e "${YELLOW}[face]${NC} Server already running (PID $(cat "$PID_FILE"))"
    echo -e "${BLUE}[face]${NC} http://localhost:$PORT"
    return 0
  fi

  cd "$APP_DIR"
  echo -e "${BLUE}[face]${NC} Starting FACE server on port $PORT..."
  PORT="$PORT" nohup npm run start -- -p "$PORT" > "$LOG_FILE" 2>&1 &
  local pid=$!
  echo "$pid" > "$PID_FILE"

  # Wait for server to be ready
  local attempts=0
  while [ $attempts -lt 30 ]; do
    if curl -sf "http://localhost:$PORT/api/health" > /dev/null 2>&1; then
      echo -e "${GREEN}[face]${NC} Server started (PID $pid)"
      echo -e "${BLUE}[face]${NC} http://localhost:$PORT"
      return 0
    fi
    sleep 1
    attempts=$((attempts + 1))
  done

  echo -e "${YELLOW}[face]${NC} Server starting (PID $pid) — may take a moment"
  echo -e "${BLUE}[face]${NC} http://localhost:$PORT"
}

cmd_stop() {
  if ! is_running; then
    echo -e "${YELLOW}[face]${NC} Server is not running"
    return 0
  fi

  local pid
  pid=$(cat "$PID_FILE")
  echo -e "${BLUE}[face]${NC} Stopping server (PID $pid)..."

  kill "$pid" 2>/dev/null || true

  # Wait for graceful shutdown
  local attempts=0
  while [ $attempts -lt 10 ]; do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$PID_FILE"
      echo -e "${GREEN}[face]${NC} Server stopped"
      return 0
    fi
    sleep 1
    attempts=$((attempts + 1))
  done

  # Force kill
  kill -9 "$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
  echo -e "${GREEN}[face]${NC} Server stopped (forced)"
}

cmd_restart() {
  cmd_stop
  sleep 1
  cmd_start
}

cmd_status() {
  if is_running; then
    echo -e "${GREEN}[face]${NC} Server is running (PID $(cat "$PID_FILE")) on port $PORT"
  else
    echo -e "${YELLOW}[face]${NC} Server is not running"
  fi
}

cmd_logs() {
  if [ -f "$LOG_FILE" ]; then
    tail -f "$LOG_FILE"
  else
    echo -e "${YELLOW}[face]${NC} No log file found"
  fi
}

cmd_dev() {
  cd "$APP_DIR"
  echo -e "${BLUE}[face]${NC} Starting dev server on port $PORT..."
  PORT="$PORT" exec npm run dev -- -p "$PORT"
}

cmd_open() {
  local url="http://localhost:$PORT"
  if command -v open &>/dev/null; then
    open "$url"
  elif command -v xdg-open &>/dev/null; then
    xdg-open "$url"
  else
    echo -e "${BLUE}[face]${NC} Open in browser: $url"
  fi
}

case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  status)  cmd_status ;;
  logs)    cmd_logs ;;
  dev)     cmd_dev ;;
  open)    cmd_open ;;
  -h|--help|help) usage ;;
  *)
    if [ -n "${1:-}" ]; then
      echo -e "${RED}[face]${NC} Unknown command: $1"
      echo ""
    fi
    usage
    exit 1
    ;;
esac
FACECLI

chmod +x "$FACE_BIN"

# --- Add to PATH ---

SHELL_NAME=$(basename "$SHELL")
PROFILE_FILE=""

case "$SHELL_NAME" in
  zsh)  PROFILE_FILE="$HOME/.zshrc" ;;
  bash)
    if [ -f "$HOME/.bash_profile" ]; then
      PROFILE_FILE="$HOME/.bash_profile"
    else
      PROFILE_FILE="$HOME/.bashrc"
    fi
    ;;
  *)    PROFILE_FILE="$HOME/.profile" ;;
esac

PATH_LINE="export PATH=\"$INSTALL_DIR/bin:\$PATH\""

if [ -n "$PROFILE_FILE" ] && ! grep -qF "$INSTALL_DIR/bin" "$PROFILE_FILE" 2>/dev/null; then
  echo "" >> "$PROFILE_FILE"
  echo "# FACE - AI Agent Dashboard" >> "$PROFILE_FILE"
  echo "$PATH_LINE" >> "$PROFILE_FILE"
  info "Added $INSTALL_DIR/bin to PATH in $PROFILE_FILE"
fi

# --- Done ---

echo ""
ok "Installation complete!"
echo ""
echo "  Start the server:    face start"
echo "  Open in browser:     face open"
echo "  Stop the server:     face stop"
echo "  View logs:           face logs"
echo "  Development mode:    face dev"
echo ""

if ! command -v face &>/dev/null; then
  warn "Run this to use the 'face' command now:"
  echo "  export PATH=\"$INSTALL_DIR/bin:\$PATH\""
fi
