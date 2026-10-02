"use client";

import { useState } from "react";
import { useDemoState } from "@/components/DemoStateProvider";
import { Banner } from "@/components/ui";

/**
 * Shown when the clock is not moving. Starts the simulator if it is down,
 * then resumes the stream, so a presenter does not have to open Demo controls.
 */
export function LiveUpdatesBanner({
  leaderAlive,
  streamStatus,
  label = "Live updates",
}: {
  leaderAlive: boolean;
  streamStatus: string;
  label?: string;
}) {
  const { envelope, config, busyAction, startUpdates } = useDemoState();
  const [failure, setFailure] = useState<string | null>(null);
  const leaderUp = envelope?.state.leader_alive ?? leaderAlive;
  const status = envelope?.state.stream_status ?? streamStatus;
  const live = leaderUp && status === "RUNNING";
  // A revealed scenario holds the clock on its window so the evidence stays put.
  const heldByScenario =
    leaderUp &&
    status === "PAUSED" &&
    (envelope?.executions ?? []).some((execution) => execution.status === "complete");
  if (live || heldByScenario) return null;

  const role = envelope?.role ?? config?.role;
  const canStart = role === "demo_administrator" || role === undefined;
  const starting = busyAction === "start";
  const stopped = !leaderUp;

  return (
    <Banner tone="warn">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          {stopped
            ? `${label} are stopped. Start them when you want the clock to move.`
            : `${label} are paused. Start them when you want the clock to move.`}
        </p>
        <button
          type="button"
          className="btn btn-primary shrink-0"
          disabled={!canStart || starting || busyAction !== null}
          onClick={() => {
            setFailure(null);
            void startUpdates().then((result) => {
              if (!result.ok) {
                setFailure(result.message ?? "Live updates did not start.");
              }
            });
          }}
        >
          {starting ? "Starting…" : "Start live updates"}
        </button>
      </div>
      {failure && <p className="mt-2">{failure}</p>}
      {!canStart && (
        <p className="mt-2">A demo administrator has to start live updates.</p>
      )}
    </Banner>
  );
}
