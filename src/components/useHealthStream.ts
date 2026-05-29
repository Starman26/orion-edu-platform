// useHealthStream.ts
//
// Drives the on-demand, read-only xArm "health stream" exposed by the ORION
// bridge. Control + data travel over Supabase Realtime broadcast (pure
// WebSocket) — see orion-bridge/orion_bridge/health_stream.py for the wire
// protocol. The bridge samples q / dq / tau / I / temperatures at the chosen
// rate and broadcasts batches; this hook accumulates them and builds a CSV the
// user can download client-side.

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

const CONTROL_CHANNEL = "orion-health-control";
const dataChannelName = (streamId: string) => `orion-health:${streamId}`;
const STARTED_TIMEOUT_MS = 8000;

export interface HealthSample {
  t: number;
  q: number[];
  dq: number[];
  tau: number[];
  I: number[];
  temps: number[];
  state: string;
}

export type HealthPhase =
  | "idle"
  | "starting"
  | "streaming"
  | "stopping"
  | "done"
  | "error";

export interface HealthStreamMeta {
  deviceId: string;
  ip: string;
  numJoints: number;
  rateHz: number;
  columns: string[];
}

export interface StartOptions {
  deviceId?: string;
  ip?: string;
  bridgeId?: string;
  rateHz?: number;
  durationS?: number; // 0 = until stop
  kTorque?: number;
}

export function useHealthStream() {
  const [phase, setPhase] = useState<HealthPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sampleCount, setSampleCount] = useState(0);
  const [latest, setLatest] = useState<HealthSample | null>(null);
  const [meta, setMeta] = useState<HealthStreamMeta | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [droppedBatches, setDroppedBatches] = useState(0);

  const samplesRef = useRef<HealthSample[]>([]);
  const metaRef = useRef<HealthStreamMeta | null>(null);
  const streamIdRef = useRef<string>("");
  const controlRef = useRef<RealtimeChannel | null>(null);
  const dataRef = useRef<RealtimeChannel | null>(null);
  const startedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uiTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTsRef = useRef<number>(0);
  const lastSeqRef = useRef<number>(-1);

  const cleanup = useCallback(() => {
    if (startedTimerRef.current) { clearTimeout(startedTimerRef.current); startedTimerRef.current = null; }
    if (uiTimerRef.current) { clearInterval(uiTimerRef.current); uiTimerRef.current = null; }
    if (controlRef.current) { supabase.removeChannel(controlRef.current); controlRef.current = null; }
    if (dataRef.current) { supabase.removeChannel(dataRef.current); dataRef.current = null; }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const finish = useCallback((nextPhase: HealthPhase, errMsg?: string) => {
    if (startedTimerRef.current) { clearTimeout(startedTimerRef.current); startedTimerRef.current = null; }
    if (uiTimerRef.current) { clearInterval(uiTimerRef.current); uiTimerRef.current = null; }
    // flush final counters
    setSampleCount(samplesRef.current.length);
    setLatest(samplesRef.current[samplesRef.current.length - 1] ?? null);
    if (errMsg) setError(errMsg);
    setPhase(nextPhase);
    // tear down channels but keep the captured samples for download
    if (controlRef.current) { supabase.removeChannel(controlRef.current); controlRef.current = null; }
    if (dataRef.current) { supabase.removeChannel(dataRef.current); dataRef.current = null; }
  }, []);

  const start = useCallback(async (opts: StartOptions) => {
    if (phase === "starting" || phase === "streaming") return;
    cleanup();

    const streamId =
      (crypto as any)?.randomUUID?.() ??
      `hs-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    streamIdRef.current = streamId;
    samplesRef.current = [];
    metaRef.current = null;
    lastSeqRef.current = -1;
    startTsRef.current = Date.now();

    setError(null);
    setSampleCount(0);
    setLatest(null);
    setMeta(null);
    setElapsed(0);
    setDroppedBatches(0);
    setPhase("starting");

    // ── data channel (bridge → UI) ──
    const dataCh = supabase.channel(dataChannelName(streamId), {
      config: { broadcast: { self: false } },
    });
    dataCh.on("broadcast", { event: "samples" }, ({ payload }) => {
      if (!payload || payload.stream_id !== streamId) return;
      const seq = typeof payload.seq === "number" ? payload.seq : -1;
      if (seq >= 0 && lastSeqRef.current >= 0 && seq > lastSeqRef.current + 1) {
        setDroppedBatches((d) => d + (seq - lastSeqRef.current - 1));
      }
      if (seq >= 0) lastSeqRef.current = seq;
      const batch: HealthSample[] = payload.batch || [];
      if (batch.length) samplesRef.current.push(...batch);
    });
    dataRef.current = dataCh;

    // ── control channel (both directions) ──
    const controlCh = supabase.channel(CONTROL_CHANNEL, {
      config: { broadcast: { self: false } },
    });
    controlCh.on("broadcast", { event: "started" }, ({ payload }) => {
      if (!payload || payload.stream_id !== streamId) return;
      if (startedTimerRef.current) { clearTimeout(startedTimerRef.current); startedTimerRef.current = null; }
      const m: HealthStreamMeta = {
        deviceId: payload.device_id ?? opts.deviceId ?? "",
        ip: payload.ip ?? opts.ip ?? "",
        numJoints: payload.num_joints ?? 6,
        rateHz: payload.rate_hz ?? opts.rateHz ?? 50,
        columns: payload.columns ?? [],
      };
      metaRef.current = m;
      setMeta(m);
      setPhase("streaming");
      // throttle UI updates so 50 Hz ingestion doesn't thrash React
      uiTimerRef.current = setInterval(() => {
        setSampleCount(samplesRef.current.length);
        setLatest(samplesRef.current[samplesRef.current.length - 1] ?? null);
        setElapsed((Date.now() - startTsRef.current) / 1000);
      }, 250);
    });
    controlCh.on("broadcast", { event: "error" }, ({ payload }) => {
      if (!payload || payload.stream_id !== streamId) return;
      finish("error", payload.error || "bridge reported an error");
    });
    controlCh.on("broadcast", { event: "done" }, ({ payload }) => {
      if (!payload || payload.stream_id !== streamId) return;
      finish("done");
    });
    controlRef.current = controlCh;

    // subscribe both channels, then send the start command
    await new Promise<void>((resolve) => {
      let pending = 2;
      const tick = () => { if (--pending === 0) resolve(); };
      dataCh.subscribe((status) => { if (status === "SUBSCRIBED") tick(); });
      controlCh.subscribe((status) => { if (status === "SUBSCRIBED") tick(); });
    });

    await controlCh.send({
      type: "broadcast",
      event: "start",
      payload: {
        stream_id: streamId,
        bridge_id: opts.bridgeId,
        device_id: opts.deviceId,
        ip: opts.ip,
        rate_hz: opts.rateHz ?? 50,
        duration_s: opts.durationS ?? 30,
        k_torque: opts.kTorque ?? 0.01,
      },
    });

    // if the bridge never answers, surface an error instead of hanging
    startedTimerRef.current = setTimeout(() => {
      finish("error", "No bridge responded — is the xArm bridge online?");
    }, STARTED_TIMEOUT_MS);
  }, [phase, cleanup, finish]);

  const stop = useCallback(async () => {
    if (phase !== "streaming" && phase !== "starting") return;
    setPhase("stopping");
    const streamId = streamIdRef.current;
    if (controlRef.current && streamId) {
      try {
        await controlRef.current.send({
          type: "broadcast",
          event: "stop",
          payload: { stream_id: streamId },
        });
      } catch { /* ignore */ }
    }
    // the bridge replies "done"; fall back to local finalize after a moment
    setTimeout(() => {
      setPhase((p) => (p === "stopping" ? "done" : p));
      finish("done");
    }, 1500);
  }, [phase, finish]);

  const reset = useCallback(() => {
    cleanup();
    samplesRef.current = [];
    metaRef.current = null;
    streamIdRef.current = "";
    setPhase("idle");
    setError(null);
    setSampleCount(0);
    setLatest(null);
    setMeta(null);
    setElapsed(0);
    setDroppedBatches(0);
  }, [cleanup]);

  const buildCsv = useCallback((): string => {
    const samples = samplesRef.current;
    const m = metaRef.current;
    const n =
      m?.numJoints ??
      (samples[0]?.q?.length ?? 6);
    const header =
      m?.columns?.length
        ? m.columns
        : [
            "time",
            ...Array.from({ length: n }, (_, i) => `q${i + 1}`),
            ...Array.from({ length: n }, (_, i) => `dq${i + 1}`),
            ...Array.from({ length: n }, (_, i) => `tau${i + 1}`),
            ...Array.from({ length: n }, (_, i) => `I${i + 1}`),
            ...Array.from({ length: n }, (_, i) => `temp${i + 1}`),
          ];
    const lines = [header.join(",")];
    for (const s of samples) {
      const row = [
        s.t,
        ...(s.q ?? []),
        ...(s.dq ?? []),
        ...(s.tau ?? []),
        ...(s.I ?? []),
        ...(s.temps ?? []),
      ];
      lines.push(row.join(","));
    }
    return lines.join("\n");
  }, []);

  const downloadCsv = useCallback(() => {
    if (!samplesRef.current.length) return;
    const csv = buildCsv();
    const m = metaRef.current;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fname = `xarm_health_${m?.deviceId || "device"}_${stamp}.csv`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [buildCsv]);

  return {
    phase,
    error,
    sampleCount,
    latest,
    meta,
    elapsed,
    droppedBatches,
    isActive: phase === "starting" || phase === "streaming" || phase === "stopping",
    start,
    stop,
    reset,
    downloadCsv,
  };
}
