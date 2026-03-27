// src/components/useMonitorHealth.ts
// Polls /api/monitor/tick to detect lab anomalies.

import { useState, useEffect, useRef, useCallback } from "react";

export interface Anomaly {
  id: string;
  station?: string;
  severity: "warning" | "critical";
  message: string;
  timestamp: string;
  metric?: string;
  value?: number;
  threshold?: number;
}

export interface MonitorTickResponse {
  healthy: boolean;
  anomalies: Anomaly[];
  checked_at: string;
}

interface UseMonitorHealthOptions {
  apiUrl?: string;
  /** Polling interval in ms (default 30000) */
  intervalMs?: number;
  enabled?: boolean;
}

interface UseMonitorHealthReturn {
  healthy: boolean;
  anomalies: Anomaly[];
  lastChecked: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useMonitorHealth(options: UseMonitorHealthOptions = {}): UseMonitorHealthReturn {
  const {
    apiUrl = import.meta.env.VITE_AGENT_API_URL || "https://sentinela-909652673285.us-central1.run.app",
    intervalMs = 30_000,
    enabled = true,
  } = options;

  const [healthy, setHealthy] = useState(true);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tick = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${apiUrl}/api/monitor/tick`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data: MonitorTickResponse = await res.json();
      setHealthy(data.healthy);
      setAnomalies(data.anomalies || []);
      setLastChecked(data.checked_at || new Date().toISOString());
    } catch (err: any) {
      // Don't overwrite anomalies on network error — keep last known state
      setError(err.message || "Monitor unreachable");
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    if (!enabled) return;

    // Initial fetch
    tick();

    // Set up polling
    intervalRef.current = setInterval(tick, intervalMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, intervalMs, tick]);

  return { healthy, anomalies, lastChecked, loading, error, refresh: tick };
}
