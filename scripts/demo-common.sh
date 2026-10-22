# Shared helpers for scripts/startup.sh and scripts/shutdown.sh.
# Source this file. Do not execute it.

_DEMO_COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$_DEMO_COMMON_DIR/.." && pwd)"
RUNTIME_DIR="$ROOT/.demo"
SIM_PID_FILE="$RUNTIME_DIR/simulator.pid"
APP_PID_FILE="$RUNTIME_DIR/app.pid"
SIM_LOG="$RUNTIME_DIR/simulator.log"
APP_LOG="$RUNTIME_DIR/app.log"
DEMO_PORT="${DEMO_PORT:-3000}"
PYTHON=""

demo_python() {
  if [[ -x "$ROOT/.venv/bin/python" ]]; then
    printf '%s\n' "$ROOT/.venv/bin/python"
  else
    printf '%s\n' "python3"
  fi
}

refresh_python() {
  PYTHON="$(demo_python)"
}

fintech() {
  (cd "$ROOT/simulator" && "$PYTHON" -m fintech_demo "$@")
}

ensure_runtime_dir() {
  mkdir -p "$RUNTIME_DIR"
}

# Start a command in its own session. The pid file holds the session leader,
# so a later SIGINT to that process group stops the command and its children.
spawn_detached() {
  local pid_file="$1"
  local log_file="$2"
  local workdir="$3"
  shift 3
  "$PYTHON" - "$pid_file" "$log_file" "$workdir" "$@" <<'PY'
import os
import sys

pid_file, log_file, workdir = sys.argv[1:4]
argv = sys.argv[4:]
pid = os.fork()
if pid != 0:
    with open(pid_file, "w", encoding="utf-8") as handle:
        handle.write(str(pid))
    raise SystemExit(0)
os.setsid()
os.chdir(workdir)
fd = os.open(log_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
os.dup2(fd, 1)
os.dup2(fd, 2)
if fd > 2:
    os.close(fd)
os.execvp(argv[0], argv)
PY
}

process_alive() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    tr -d '[:space:]' <"$pid_file"
  fi
}

stop_pid() {
  local pid="$1"
  local name="$2"
  if ! process_alive "$pid"; then
    return 0
  fi
  echo "Stopping ${name} (pid ${pid})..."
  kill -INT -"$pid" 2>/dev/null || kill -INT "$pid" 2>/dev/null || true
  local _attempt
  for _attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    process_alive "$pid" || return 0
    sleep 1
  done
  echo "${name} did not exit after interrupt. Sending terminate."
  kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  sleep 2
  if process_alive "$pid"; then
    kill -KILL -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
  fi
}

# Demo processes whose working directory is inside this repository.
# Prints "<kind> <pid>" lines. Kind is "app" or "simulator".
list_demo_processes() {
  "$PYTHON" - "$ROOT" <<'PY'
import os
import subprocess
import sys

root = os.path.realpath(sys.argv[1])
listing = subprocess.check_output(["ps", "-ax", "-o", "pid=,command="], text=True)
for line in listing.splitlines():
    stripped = line.strip()
    if not stripped:
        continue
    pid_text, _, command = stripped.partition(" ")
    try:
        pid = int(pid_text)
    except ValueError:
        continue
    if pid == os.getpid():
        continue
    is_simulator = "fintech_demo" in command and " run" in command
    is_app = (
        "next dev" in command
        or "next/dist/server" in command
        or ("npm" in command and "run dev" in command)
    )
    if not (is_simulator or is_app):
        continue
    try:
        cwd_listing = subprocess.check_output(
            ["lsof", "-a", "-p", str(pid), "-d", "cwd", "-Fn"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        continue
    cwd = ""
    for item in cwd_listing.splitlines():
        if item.startswith("n"):
            cwd = item[1:]
    if not cwd:
        continue
    cwd = os.path.realpath(cwd)
    if cwd != root and not cwd.startswith(root + os.sep):
        continue
    kind = "simulator" if is_simulator else "app"
    print(f"{kind} {pid}")
PY
}

stop_recorded_processes() {
  local app_pid sim_pid
  app_pid="$(read_pid "$APP_PID_FILE")"
  sim_pid="$(read_pid "$SIM_PID_FILE")"
  if [[ -n "$app_pid" ]]; then
    stop_pid "$app_pid" "app"
  fi
  if [[ -n "$sim_pid" ]]; then
    stop_pid "$sim_pid" "simulator"
  fi
  rm -f "$APP_PID_FILE" "$SIM_PID_FILE"
}

stop_all_demo_processes() {
  stop_recorded_processes
  local kind pid
  # A second pass catches a dev server that npm re-parented, and a simulator
  # started by hand in this repository.
  while read -r kind pid; do
    [[ -n "${pid:-}" ]] || continue
    stop_pid "$pid" "$kind"
  done < <(list_demo_processes || true)
  while read -r kind pid; do
    [[ -n "${pid:-}" ]] || continue
    stop_pid "$pid" "$kind"
  done < <(list_demo_processes || true)
}

port_in_use() {
  "$PYTHON" -c '
import socket, sys
port = int(sys.argv[1])
probe = socket.socket()
probe.settimeout(0.5)
try:
    raise SystemExit(0 if probe.connect_ex(("127.0.0.1", port)) == 0 else 1)
finally:
    probe.close()
' "$DEMO_PORT"
}

http_ok() {
  local url="$1"
  "$PYTHON" -c '
import sys
import urllib.request
try:
    with urllib.request.urlopen(sys.argv[1], timeout=3) as response:
        raise SystemExit(0 if response.status == 200 else 1)
except Exception:
    raise SystemExit(1)
' "$url"
}

capture_status() {
  local dest="$1"
  set +e
  fintech status >"$dest" 2>"$dest.err"
  local code=$?
  set -e
  return "$code"
}

leader_is_alive() {
  local dest="$RUNTIME_DIR/status.json"
  ensure_runtime_dir
  if ! capture_status "$dest"; then
    return 1
  fi
  "$PYTHON" -c '
import json, sys
data = json.loads(sys.stdin.read())
raise SystemExit(0 if data.get("leader_alive") else 1)
' <"$dest"
}

stream_is_running() {
  local dest="$RUNTIME_DIR/status.json"
  ensure_runtime_dir
  if ! capture_status "$dest"; then
    return 1
  fi
  "$PYTHON" -c '
import json, sys
data = json.loads(sys.stdin.read())
active = data.get("active") or {}
raise SystemExit(0 if str(active.get("stream_status") or "") == "RUNNING" else 1)
' <"$dest"
}

status_is_uninitialized() {
  local dest="$1"
  "$PYTHON" -c '
import json, sys
data = json.loads(sys.stdin.read())
raise SystemExit(0 if data.get("status") == "uninitialized" else 1)
' <"$dest"
}

assert_clean_baseline() {
  local dest="$RUNTIME_DIR/status.json"
  ensure_runtime_dir
  if ! capture_status "$dest"; then
    echo "Could not read demo status after reset." >&2
    cat "$dest.err" >&2 || true
    return 1
  fi
  "$PYTHON" -c '
import json, sys
data = json.loads(sys.stdin.read())
active = data.get("active") or {}
run = data.get("run") or {}
executions = data.get("scenario_executions") or []
problems = []
stream_status = str(active.get("stream_status") or "")
run_id = active.get("run_id")
speed_text = active.get("speed_multiplier")
if data.get("leader_alive"):
    problems.append("a simulator leader is still alive")
if stream_status != "PAUSED":
    problems.append(f"stream is {stream_status}, expected PAUSED")
try:
    speed = float(speed_text)
except (TypeError, ValueError):
    speed = None
if speed != 1.0:
    problems.append(f"speed is {speed_text}, expected 1")
if executions:
    count = len(executions)
    problems.append(f"{count} scenario execution(s) are still on the active run")
checksum = str(run.get("baseline_checksum") or "")
if not checksum:
    problems.append("the active run has no baseline checksum")
if problems:
    print("Reset finished, but the demo is not back at a clean baseline:", file=sys.stderr)
    for problem in problems:
        print(f"  - {problem}", file=sys.stderr)
    raise SystemExit(1)
epoch = active.get("logical_time")
prefix = checksum[:12]
print(f"Active run {run_id} is paused at {epoch}, speed 1x, checksum {prefix}, no scenarios injected.")
' <"$dest"
}

# Exit 0 when the presenter-facing checks pass. Pass "explain" to print failures
# and the live-domain note. Fixture and auto mode can present without every
# Domain key, so an unkeyed Domain is reported and does not fail the check.
core_health_ok() {
  local mode="${1:-quiet}"
  "$PYTHON" -c '
import json, sys, urllib.error, urllib.request
url = sys.argv[1]
explain = sys.argv[2] == "explain"
try:
    with urllib.request.urlopen(url, timeout=5) as response:
        payload = json.load(response)
        http_status = response.status
except urllib.error.HTTPError as error:
    payload = json.load(error)
    http_status = error.code
except Exception as error:
    if explain:
        print(f"Demo health check failed: {error}", file=sys.stderr)
    raise SystemExit(1)
required = {
    "database",
    "active_run",
    "simulator_leader",
    "baseline_checksum_recorded",
    "fixtures_present_for_available_anchors",
}
checks = {item["id"]: item for item in payload.get("checks") or []}
missing = sorted(required - set(checks))
failed = [item["id"] for item in checks.values() if item["id"] in required and not item.get("ok")]
state = payload.get("state") or {}
if str(state.get("stream_status") or "") != "RUNNING":
    failed.append("stream_status")
if int(payload.get("scenario_executions") or 0) != 0:
    failed.append("scenario_executions")
if missing or failed or http_status not in (200, 503):
    if explain:
        print("Demo is not ready.", file=sys.stderr)
        for item_id in missing:
            print(f"  - missing check {item_id}", file=sys.stderr)
        for item_id in failed:
            detail = (checks.get(item_id) or {}).get("detail", "")
            print(f"  - {item_id} {detail}".rstrip(), file=sys.stderr)
    raise SystemExit(1)
live = checks.get("all_live_domains") or {}
if explain and not live.get("ok"):
    print("Live Analyst domains are not all keyed. Auto mode can still present with reviewed answers.")
' "http://127.0.0.1:${DEMO_PORT}/api/health/demo" "$mode"
}
