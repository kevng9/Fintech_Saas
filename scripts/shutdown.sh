#!/usr/bin/env bash
# Stop the demo and restore the verified baseline.
#
# Stops the app first, then the simulator, waits until the leader lease expires,
# and clones the template into a new active run. Reset checks the baseline
# checksum before it switches the active run, so the next startup begins from
# the same seed, epoch, speed, and scenario-free data.
#
#   scripts/shutdown.sh

set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/demo-common.sh"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  sed -n '2,11p' "$0"
  exit 0
fi
if [[ $# -gt 0 ]]; then
  echo "Usage: scripts/shutdown.sh" >&2
  exit 1
fi

export PYTHONUNBUFFERED=1
refresh_python
ensure_runtime_dir

if [[ ! -f "$ROOT/app/.env.local" ]]; then
  echo "Missing app/.env.local, so the database cannot be reset." >&2
  echo "Stopping local demo processes anyway." >&2
  stop_all_demo_processes
  exit 1
fi

if ! "$PYTHON" -c 'import singlestoredb' >/dev/null 2>&1; then
  echo "Python dependencies are missing, so the database cannot be reset." >&2
  echo "Stopping local demo processes anyway." >&2
  stop_all_demo_processes
  exit 1
fi

echo "Stopping demo processes..."
stop_all_demo_processes

status_file="$RUNTIME_DIR/status.json"
echo "Waiting for the simulator lease to release..."
lease_state=""
for _attempt in $(seq 1 25); do
  set +e
  fintech status >"$status_file" 2>"$status_file.err"
  status_code=$?
  set -e
  if [[ "$status_code" -ne 0 ]]; then
    if grep -qi "unknown database" "$status_file" "$status_file.err"; then
      lease_state="missing"
      break
    fi
    echo "Processes are stopped, but the workspace could not be reached, so the baseline was not reset." >&2
    cat "$status_file" "$status_file.err" >&2 || true
    exit 2
  fi
  if status_is_uninitialized "$status_file"; then
    lease_state="uninitialized"
    break
  fi
  if "$PYTHON" -c 'import json,sys; data=json.loads(sys.stdin.read()); raise SystemExit(0 if data.get("leader_alive") else 1)' <"$status_file"; then
    sleep 1
    continue
  fi
  lease_state="clear"
  break
done

if [[ -z "$lease_state" ]]; then
  echo "A simulator leader is still holding the lease. The baseline was not reset." >&2
  echo "Stop that simulator, then run scripts/shutdown.sh again." >&2
  exit 1
fi

if [[ "$lease_state" == "missing" ]]; then
  echo "Demo processes are stopped. There is no demo database to reset."
  echo "scripts/startup.sh will create it."
  exit 0
fi

if [[ "$lease_state" == "uninitialized" ]]; then
  echo "Demo processes are stopped. There is no active run to reset."
  echo "scripts/startup.sh will bootstrap the verified baseline."
  exit 0
fi

echo "Resetting to the verified baseline..."
fintech reset
assert_clean_baseline

echo
echo "Demo is stopped. The next scripts/startup.sh begins from this baseline."
echo "A browser tab can still remember presentation mode and persona locally. A new tab starts Analyst in Auto."
