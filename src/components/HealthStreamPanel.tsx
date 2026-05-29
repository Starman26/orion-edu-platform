// HealthStreamPanel.tsx
//
// UI for the on-demand, read-only xArm health stream. Lets the user pick the
// target xArm (device + IP), choose rate/duration, start/stop a continuous
// capture that streams over WebSocket (Supabase Realtime), watch it live, and
// download the result as CSV. xArm-exclusive by design.

import { useState } from "react";
import { Activity, Download, Play, Square, X, AlertTriangle, Loader2 } from "lucide-react";
import { useHealthStream } from "./useHealthStream";

interface ConnectedRobot {
  robot_id: string;
  connected: boolean;
}

interface HealthStreamPanelProps {
  robots: ConnectedRobot[];
  selectedRobotIds: string[];
  bridgeId?: string;
  defaultIp?: string;
}

export default function HealthStreamPanel({
  robots,
  selectedRobotIds,
  bridgeId,
  defaultIp = "192.168.1.203",
}: HealthStreamPanelProps) {
  const [open, setOpen] = useState(false);
  const [deviceId, setDeviceId] = useState<string>(selectedRobotIds[0] ?? "");
  const [ip, setIp] = useState<string>(defaultIp);
  const [rateHz, setRateHz] = useState<number>(50);
  const [durationS, setDurationS] = useState<number>(30);

  const hs = useHealthStream();

  const effectiveDevice = deviceId || selectedRobotIds[0] || robots[0]?.robot_id || "";

  const onStart = () => {
    hs.start({
      deviceId: effectiveDevice || undefined,
      ip: ip.trim() || undefined,
      bridgeId: bridgeId || undefined,
      rateHz,
      durationS,
    });
  };

  const phaseLabel: Record<string, string> = {
    idle: "Idle",
    starting: "Starting…",
    streaming: "Streaming",
    stopping: "Stopping…",
    done: "Done",
    error: "Error",
  };

  return (
    <>
      <button
        type="button"
        className="hstream__fab"
        onClick={() => setOpen((o) => !o)}
        title="xArm health stream"
      >
        <Activity size={16} />
        <span>Health Stream</span>
        {hs.isActive && <span className="hstream__fabDot" />}
      </button>

      {open && (
        <div className="hstream__drawer" role="dialog" aria-label="xArm health stream">
          <div className="hstream__header">
            <span className="hstream__title">
              <Activity size={15} /> xArm Health Stream
            </span>
            <button type="button" className="hstream__close" onClick={() => setOpen(false)}>
              <X size={15} />
            </button>
          </div>

          <p className="hstream__hint">
            Read-only continuous capture (q, dq, τ, I, temps) streamed over WebSocket.
            xArm only.
          </p>

          {/* ── config ── */}
          <div className="hstream__field">
            <label className="hstream__label">Robot</label>
            <select
              className="hstream__input"
              value={effectiveDevice}
              disabled={hs.isActive}
              onChange={(e) => setDeviceId(e.target.value)}
            >
              {robots.length === 0 && <option value="">No robots connected</option>}
              {robots.map((r) => (
                <option key={r.robot_id} value={r.robot_id}>
                  {r.robot_id}{r.connected ? "" : " (offline)"}
                </option>
              ))}
            </select>
          </div>

          <div className="hstream__field">
            <label className="hstream__label">IP address</label>
            <input
              className="hstream__input"
              type="text"
              value={ip}
              disabled={hs.isActive}
              placeholder="192.168.1.203"
              onChange={(e) => setIp(e.target.value)}
            />
          </div>

          <div className="hstream__row">
            <div className="hstream__field">
              <label className="hstream__label">Rate (Hz)</label>
              <input
                className="hstream__input"
                type="number"
                min={1}
                max={250}
                value={rateHz}
                disabled={hs.isActive}
                onChange={(e) => setRateHz(Math.max(1, Math.min(250, Number(e.target.value) || 1)))}
              />
            </div>
            <div className="hstream__field">
              <label className="hstream__label">Duration (s, 0 = until stop)</label>
              <input
                className="hstream__input"
                type="number"
                min={0}
                max={600}
                value={durationS}
                disabled={hs.isActive}
                onChange={(e) => setDurationS(Math.max(0, Math.min(600, Number(e.target.value) || 0)))}
              />
            </div>
          </div>

          {/* ── status ── */}
          <div className="hstream__status">
            <span className={`hstream__badge hstream__badge--${hs.phase}`}>
              {hs.isActive && hs.phase !== "stopping" && (
                <span className="hstream__pulse" />
              )}
              {phaseLabel[hs.phase] ?? hs.phase}
            </span>
            {(hs.isActive || hs.sampleCount > 0) && (
              <span className="hstream__metrics">
                {hs.sampleCount} samples · {hs.elapsed.toFixed(1)}s
                {hs.droppedBatches > 0 && (
                  <span className="hstream__dropped"> · {hs.droppedBatches} dropped</span>
                )}
              </span>
            )}
          </div>

          {hs.latest && (
            <div className="hstream__live">
              <div className="hstream__liveRow">
                <span>q</span>
                <code>[{hs.latest.q.map((v) => v.toFixed(1)).join(", ")}]</code>
              </div>
              <div className="hstream__liveRow">
                <span>I</span>
                <code>[{hs.latest.I.map((v) => v.toFixed(2)).join(", ")}]</code>
              </div>
            </div>
          )}

          {hs.error && (
            <div className="hstream__error">
              <AlertTriangle size={14} /> {hs.error}
            </div>
          )}

          {/* ── actions ── */}
          <div className="hstream__actions">
            {!hs.isActive ? (
              <button
                type="button"
                className="hstream__btn hstream__btn--start"
                onClick={onStart}
                disabled={!effectiveDevice}
              >
                <Play size={14} /> Start
              </button>
            ) : (
              <button
                type="button"
                className="hstream__btn hstream__btn--stop"
                onClick={hs.stop}
                disabled={hs.phase === "stopping"}
              >
                {hs.phase === "stopping" ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
                Stop
              </button>
            )}
            <button
              type="button"
              className="hstream__btn hstream__btn--download"
              onClick={hs.downloadCsv}
              disabled={hs.isActive || hs.sampleCount === 0}
            >
              <Download size={14} /> CSV
            </button>
          </div>
        </div>
      )}
    </>
  );
}
