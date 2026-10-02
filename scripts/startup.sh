#!/usr/bin/env bash
# Start a full fintech demo from the verified baseline.
#
# Installs local dependencies when they are missing, bootstraps the database
# the first time, clones the template into a clean active run, starts the
# simulator and the Next.js app, and resumes the stream at 1x.
#
#   scripts/startup.sh            stay attached and stream logs; Ctrl+C shuts down
#   scripts/startup.sh --detach   return to the prompt once the demo is ready
#
# Logs and pid files: .demo/
# Ctrl+C, or scripts/shutdown.sh, returns the database to this same baseline.

set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/demo-common.sh"

DETACH=0
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  sed -n '2,13p' "$0"
  exit 0
fi
if [[ "${1:-}" == "--detach" ]]; then
  DETACH=1
  shift
fi
if [[ $# -gt 0 ]]; then
  echo "Usage: scripts/startup.sh [--detach]" >&2
  echo "Optional environment: DEMO_PORT (default 3000)." >&2
  exit 1
fi

export PYTHONUNBUFFERED=1
CLEANUP_ON_ERROR=0

cleanup_on_exit() {
  local code=$?
  if [[ "$code" -ne 0 && "$CLEANUP_ON_ERROR" == 1 ]]; then
    CLEANUP_ON_ERROR=0
    echo "Startup failed. Stopping the processes this script started." >&2
    stop_recorded_processes || true
  fi
}
trap cleanup_on_exit EXIT

require_env_file() {
  if [[ ! -f "$ROOT/app/.env.local" ]]; then
    echo "Missing app/.env.local." >&2
    echo "Copy app/.env.local.example to app/.env.local and set DEMO_DB_*." >&2
    exit 1
  fi
}

ensure_local_deps() {
  if ! command -v python3 >/dev/null 2>&1; then
    echo "Python 3.11 or newer is required." >&2
    exit 1
  fi
  if [[ ! -x "$ROOT/.venv/bin/python" ]]; then
    echo "Creating .venv..."
    python3 -m venv "$ROOT/.venv"
  fi
  refresh_python
  if ! "$PYTHON" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)'; then
    echo "Python 3.11 or newer is required. Found: $("$PYTHON" -V 2>&1)" >&2
    exit 1
  fi
  if ! "$PYTHON" -c 'import singlestoredb' >/dev/null 2>&1; then
    echo "Installing simulator dependencies..."
    "$PYTHON" -m pip install -r "$ROOT/simulator/requirements.txt"
  fi
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo "Node.js 20 or newer and npm are required." >&2
    exit 1
  fi
  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  if [[ "$node_major" -lt 20 ]]; then
    echo "Node.js 20 or newer is required. Found: $(node -v)" >&2
    exit 1
  fi
  if [[ ! -d "$ROOT/app/node_modules" ]]; then
    echo "Installing app dependencies..."
    npm --prefix "$ROOT/app" install
  fi
}

refuse_if_already_running() {
  local existing
  existing="$(list_demo_processes || true)"
  if [[ -z "$existing" ]]; then
    return 0
  fi
  if http_ok "http://127.0.0.1:${DEMO_PORT}/api/health/live" && leader_is_alive; then
    echo "Demo is already running at http://127.0.0.1:${DEMO_PORT}"
    echo "Logs: .demo/simulator.log and .demo/app.log"
    echo "To restore a clean baseline, run scripts/shutdown.sh and then scripts/startup.sh."
    if [[ "$DETACH" == 0 ]]; then
      stay_attached
    fi
    exit 0
  fi
  echo "A demo process from this repository is already running, but it is not ready:" >&2
  echo "$existing" >&2
  echo "Run scripts/shutdown.sh, then scripts/startup.sh." >&2
  exit 1
}

prepare_database() {
  echo "Checking the workspace..."
  fintech doctor
  ensure_runtime_dir
  local status_file="$RUNTIME_DIR/status.json"
  local status_code
  set +e
  fintech status >"$status_file" 2>"$status_file.err"
  status_code=$?
  set -e
  if [[ "$status_code" -eq 0 ]] && status_is_uninitialized "$status_file"; then
    echo "No active run. Bootstrapping the database. This can take several minutes..."
    fintech bootstrap
    return 0
  fi
  if [[ "$status_code" -eq 0 ]]; then
    echo "Restoring the verified baseline..."
    fintech reset
    return 0
  fi
  if grep -qi "unknown database" "$status_file" "$status_file.err"; then
    echo "Database is not created yet. Bootstrapping. This can take several minutes..."
    fintech bootstrap
    return 0
  fi
  echo "Cannot read demo status, so startup did not change the database." >&2
  cat "$status_file" "$status_file.err" >&2 || true
  exit 1
}

wait_until() {
  local attempts="$1"
  local pause="$2"
  local description="$3"
  shift 3
  local _attempt
  for _attempt in $(seq 1 "$attempts"); do
    if "$@"; then
      return 0
    fi
    sleep "$pause"
  done
  echo "Timed out waiting for ${description}." >&2
  return 1
}

app_process_alive() {
  local pid
  pid="$(read_pid "$APP_PID_FILE")"
  process_alive "$pid"
}

sim_process_alive() {
  local pid
  pid="$(read_pid "$SIM_PID_FILE")"
  process_alive "$pid"
}

# Keep the terminal attached: stream both logs, report a process that exits,
# and run the normal shutdown on Ctrl+C so the database returns to baseline.
stay_attached() {
  local tail_pid=""
  local stopping=0
  on_interrupt() {
    [[ "$stopping" == 1 ]] && return
    stopping=1
    echo
    echo "Ctrl+C received. Shutting down and restoring the baseline..."
    [[ -n "$tail_pid" ]] && kill "$tail_pid" 2>/dev/null || true
    "$ROOT/scripts/shutdown.sh" || true
    exit 0
  }
  trap on_interrupt INT TERM

  echo
  echo "Streaming logs. Press Ctrl+C to stop the demo and restore the baseline."
  echo "To leave the demo running instead, close this window or run with --detach next time."
  echo
  tail -n 0 -F "$SIM_LOG" "$APP_LOG" &
  tail_pid=$!

  local sim_reported=0 app_reported=0
  while true; do
    if [[ "$sim_reported" == 0 ]] && ! sim_process_alive; then
      sim_reported=1
      echo "WARNING: the simulator has exited. See .demo/simulator.log" >&2
    fi
    if [[ "$app_reported" == 0 ]] && ! app_process_alive; then
      app_reported=1
      echo "WARNING: the app has exited. See .demo/app.log" >&2
    fi
    if [[ "$sim_reported" == 1 && "$app_reported" == 1 ]]; then
      echo "Both demo processes have stopped. Run scripts/shutdown.sh to restore the baseline." >&2
      kill "$tail_pid" 2>/dev/null || true
      exit 1
    fi
    sleep 2
  done
}

require_env_file
ensure_local_deps
ensure_runtime_dir
refuse_if_already_running

if port_in_use; then
  echo "Port ${DEMO_PORT} is already in use. Set DEMO_PORT or free the port, then retry." >&2
  exit 1
fi

prepare_database

CLEANUP_ON_ERROR=1
echo "Starting the simulator..."
spawn_detached "$SIM_PID_FILE" "$SIM_LOG" "$ROOT/simulator" "$PYTHON" -m fintech_demo run
leader_ready=0
for _attempt in $(seq 1 60); do
  if leader_is_alive; then
    leader_ready=1
    break
  fi
  sim_pid="$(read_pid "$SIM_PID_FILE")"
  if ! process_alive "$sim_pid"; then
    echo "The simulator exited during startup. See .demo/simulator.log" >&2
    exit 1
  fi
  sleep 0.5
done
if [[ "$leader_ready" -ne 1 ]]; then
  echo "Timed out waiting for the simulator leader. See .demo/simulator.log" >&2
  exit 1
fi

echo "Starting the app on port ${DEMO_PORT}..."
spawn_detached "$APP_PID_FILE" "$APP_LOG" "$ROOT/app" "$(command -v npm)" run dev -- -p "$DEMO_PORT"
app_ready=0
for _attempt in $(seq 1 180); do
  if http_ok "http://127.0.0.1:${DEMO_PORT}/api/health/live"; then
    app_ready=1
    break
  fi
  if ! app_process_alive; then
    echo "The app exited during startup. See .demo/app.log" >&2
    exit 1
  fi
  sleep 1
done
if [[ "$app_ready" -ne 1 ]]; then
  echo "Timed out waiting for the app. See .demo/app.log" >&2
  exit 1
fi

echo "Resuming the stream at 1x..."
fintech resume
wait_until 30 0.5 "the stream to start running" stream_is_running
wait_until 20 1 "demo health" core_health_ok
core_health_ok explain

CLEANUP_ON_ERROR=0
echo
echo "Demo is ready at http://127.0.0.1:${DEMO_PORT}"
echo "Logs: .demo/simulator.log and .demo/app.log"
echo "Stop and restore this baseline with scripts/shutdown.sh"

if [[ "$DETACH" == 0 ]]; then
  stay_attached
fi
