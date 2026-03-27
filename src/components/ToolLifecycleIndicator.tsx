// src/components/ToolLifecycleIndicator.tsx

import { useState } from "react";
import { Loader2, CheckCircle, XCircle, Clock, ShieldAlert, Search, AlertTriangle } from "lucide-react";
import type { ToolExecution, ToolLifecyclePhase } from "./useAgentChat";

// ── Tool name labels ──

const TOOL_LABELS: Record<string, string> = {
  get_lab_overview: "Reading lab overview",
  get_station_details: "Checking station details",
  get_active_errors: "Checking active errors",
  set_cobot_mode: "Setting cobot mode",
  reconnect_plc: "Reconnecting PLC",
  close_all_doors: "Closing doors",
  ping_plc: "Pinging PLC",
  health_check_station: "Running health check",
  resolve_station_errors: "Resolving errors",
  reset_lab_to_safe_state: "Resetting lab",
  search_equipment_manual: "Searching manual",
  web_search_diagnostic: "Searching online",
};

function toolLabel(name: string): string {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  return name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ── Phase icon ──

function PhaseIcon({ phase }: { phase: ToolLifecyclePhase }) {
  const cls = "shrink-0";
  switch (phase) {
    case 'planned':
    case 'validating':
      return <Loader2 size={13} className={`${cls} animate-spin text-blue-400`} />;
    case 'executing':
      return <Loader2 size={13} className={`${cls} animate-spin text-amber-400`} />;
    case 'verifying':
      return <Search size={13} className={`${cls} text-blue-400`} />;
    case 'completed':
      return <CheckCircle size={13} className={`${cls} text-emerald-400`} />;
    case 'failed':
      return <XCircle size={13} className={`${cls} text-red-400`} />;
    case 'timeout':
      return <Clock size={13} className={`${cls} text-orange-400`} />;
    case 'blocked':
    case 'safety_blocked':
      return <ShieldAlert size={13} className={`${cls} text-red-400`} />;
    case 'verification_failed':
      return <AlertTriangle size={13} className={`${cls} text-orange-400`} />;
    case 'retrying':
      return <Loader2 size={13} className={`${cls} animate-spin text-yellow-400`} />;
    default:
      return <Loader2 size={13} className={`${cls} animate-spin text-gray-400`} />;
  }
}

// ── Safety badge ──

function SafetyBadge({ level }: { level: string }) {
  if (level === 'dangerous') {
    return <span className="text-[10px] px-1 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">DANGER</span>;
  }
  if (level === 'caution') {
    return <span className="text-[10px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-medium">CAUTION</span>;
  }
  return null;
}

// ── Border color by tool type ──

function borderColor(toolType: string): string {
  switch (toolType) {
    case 'read': return 'border-l-blue-400/60';
    case 'write': return 'border-l-yellow-400/60';
    case 'actuate': return 'border-l-red-400/60';
    default: return 'border-l-gray-400/40';
  }
}

// ── Phase status text ──

function phaseText(exec: ToolExecution): string {
  switch (exec.phase) {
    case 'planned': return 'Planned';
    case 'validating': return 'Validating...';
    case 'executing':
      return exec.attempt && exec.attempt > 1 ? `Executing (attempt ${exec.attempt})...` : 'Executing...';
    case 'verifying': return 'Verifying...';
    case 'completed': {
      const parts: string[] = [];
      if (exec.durationMs != null) parts.push(`${exec.durationMs}ms`);
      if (exec.verified) parts.push('Verified');
      return parts.length > 0 ? parts.join(' \u00b7 ') : 'Done';
    }
    case 'failed': return exec.error ? `Failed: ${exec.error}` : 'Failed';
    case 'timeout': return exec.durationMs ? `Timeout after ${exec.durationMs}ms` : 'Timeout';
    case 'blocked': return 'Blocked';
    case 'safety_blocked': return 'Safety blocked';
    case 'verification_failed': return 'Verification failed';
    case 'retrying': return `Retry #${exec.attempt || 2}...`;
    default: return exec.phase;
  }
}

function isActive(phase: ToolLifecyclePhase): boolean {
  return phase === 'planned' || phase === 'validating' || phase === 'executing' || phase === 'verifying' || phase === 'retrying';
}

// ── Main component ──

interface ToolLifecycleIndicatorProps {
  executions: Map<string, ToolExecution>;
}

export default function ToolLifecycleIndicator({ executions }: ToolLifecycleIndicatorProps) {
  const [expanded, setExpanded] = useState(true);

  if (executions.size === 0) return null;

  const entries = Array.from(executions.values());
  const activeCount = entries.filter(e => isActive(e.phase)).length;
  const completedCount = entries.filter(e => e.phase === 'completed').length;
  const failedCount = entries.filter(e => e.phase === 'failed' || e.phase === 'timeout').length;

  // Collapse to summary when more than 3 tools and not expanded
  if (entries.length > 3 && !expanded) {
    const parts: string[] = [];
    if (completedCount > 0) parts.push(`${completedCount} completed`);
    if (activeCount > 0) parts.push(`${activeCount} running`);
    if (failedCount > 0) parts.push(`${failedCount} failed`);

    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 text-xs text-[var(--text-secondary,#999)] opacity-70 hover:opacity-100 ml-10 my-1 transition-opacity"
      >
        <Loader2 size={12} className={activeCount > 0 ? "animate-spin" : ""} />
        <span>{entries.length} tools: {parts.join(", ")}</span>
        <span className="underline">Show details</span>
      </button>
    );
  }

  return (
    <div className="space-y-1 my-2 ml-10">
      {entries.map((exec) => (
        <div
          key={exec.tool}
          className={`flex items-center gap-2 pl-2 border-l-2 ${borderColor(exec.toolType)} py-0.5 ${
            isActive(exec.phase) ? "animate-pulse" : ""
          }`}
        >
          <PhaseIcon phase={exec.phase} />
          <span className="text-xs text-[var(--text-primary,#ccc)] truncate">
            {toolLabel(exec.tool)}
          </span>
          <SafetyBadge level={exec.safetyLevel} />
          <span className={`text-[11px] ml-auto shrink-0 ${
            exec.phase === 'completed' ? 'text-emerald-400/70' :
            exec.phase === 'failed' || exec.phase === 'timeout' ? 'text-red-400/70' :
            'text-[var(--text-secondary,#999)] opacity-60'
          }`}>
            {phaseText(exec)}
          </span>
        </div>
      ))}
      {entries.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-[10px] text-[var(--text-secondary,#999)] opacity-50 hover:opacity-80 ml-4"
        >
          Collapse
        </button>
      )}
    </div>
  );
}
