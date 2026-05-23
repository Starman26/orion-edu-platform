import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Check, CheckCircle, Loader2, ArrowLeft, ChevronLeft, ChevronDown, Eye, RotateCcw, Info, Phone, PhoneOff, Mic, AudioLines, Unplug } from "lucide-react";
import { SparklesIcon } from "@heroicons/react/24/outline";
import { supabase } from "../lib/supabaseClient";
import { useAgentChat } from "./useAgentChat";
import type { AgentEvent, PracticeChunk } from "./useAgentChat";
import {
  MessageBubble,
  ChatInput,
  InlineEventRun,
  FollowUpSuggestions,
  type Message,
  type EventRun,
  type FollowUpSuggestion,
} from "./ChatComponents";
import type { Automation, UserProgress } from "./StudioHelpers";
import { parseSteps } from "./StudioHelpers";

const AGENT_API_URL = import.meta.env.VITE_AGENT_API_URL || 'https://sentinela-909652673285.us-central1.run.app';

/** Check if the Monterrey lab is open (9 AM – 9 PM local time) */
function isLabOpen(): boolean {
  const now = new Date();
  const mtyHour = parseInt(
    now.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Monterrey" }),
    10,
  );
  return mtyHour >= 9 && mtyHour < 21;
}

interface ConnectedRobot { robot_id: string; connected: boolean; }

/** Extended message type — adds optional `tool` field for tool-execution pills */
type PracticeMsg = Message & { tool?: string };

// ── Robot coordinate gauge ranges ──
const ROBOT_RANGES: Record<string, { min: number; max: number; unit: string }> = {
  "Joint 1": { min: -180, max: 180, unit: "°" },
  "Joint 2": { min: -180, max: 180, unit: "°" },
  "Joint 3": { min: -180, max: 180, unit: "°" },
  "Joint 4": { min: -180, max: 180, unit: "°" },
  "Joint 5": { min: -180, max: 180, unit: "°" },
  "Joint 6": { min: -180, max: 180, unit: "°" },
  "X": { min: -500, max: 500, unit: "mm" },
  "Y": { min: -500, max: 500, unit: "mm" },
  "Z": { min: 0, max: 600, unit: "mm" },
  "Roll":  { min: -180, max: 180, unit: "°" },
  "Pitch": { min: -180, max: 180, unit: "°" },
  "Yaw":   { min: -180, max: 180, unit: "°" },
};

function RobotGaugeTable({ groups }: { groups: { title: string; rows: { label: string; value: string }[] }[] }) {
  return (
    <div className="studio__robotGauge">
      {groups.map((group, gi) => (
        <div key={gi} className="studio__robotGaugeGroup">
          {group.title && <div className="studio__robotGaugeTitle">{group.title}</div>}
          {group.rows.map(({ label, value }) => {
            const numVal = parseFloat(value);
            const range = ROBOT_RANGES[label];
            const pct = range
              ? Math.max(0, Math.min(100, ((numVal - range.min) / (range.max - range.min)) * 100))
              : 50;
            const isNeg = numVal < 0;
            return (
              <div key={label} className="studio__robotGaugeRow">
                <span className="studio__robotGaugeLabel">{label}</span>
                <div className="studio__robotGaugeTrack">
                  <div className="studio__robotGaugeFill" style={{ width: `${pct}%` }} />
                </div>
                <span className={`studio__robotGaugeValue ${isNeg ? "is-neg" : ""}`}>{value}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Parse live telemetry into RobotGaugeTable groups ──
type GaugeGroups = { title: string; rows: { label: string; value: string }[] }[];

function parseTelemetry(telem: any): GaugeGroups {
  const d = telem?.data ?? telem ?? {};
  const groups: GaugeGroups = [];
  if (d.tcp) {
    const t = d.tcp;
    groups.push({ title: 'TCP', rows: [
      { label: 'X',     value: `${Number(t.x).toFixed(2)}mm` },
      { label: 'Y',     value: `${Number(t.y).toFixed(2)}mm` },
      { label: 'Z',     value: `${Number(t.z).toFixed(2)}mm` },
      { label: 'Roll',  value: `${Number(t.roll).toFixed(2)}°` },
      { label: 'Pitch', value: `${Number(t.pitch).toFixed(2)}°` },
      { label: 'Yaw',   value: `${Number(t.yaw).toFixed(2)}°` },
    ]});
  }
  const joints: number[] = d.joints_deg ?? d.joints ?? [];
  if (joints.length > 0) {
    groups.push({ title: 'Joints', rows: joints.map((v, i) => ({
      label: `Joint ${i + 1}`,
      value: `${Number(v).toFixed(2)}°`,
    })) });
  }
  return groups;
}

// ── Message segmentation: text + gauge interleaving ──
type MessageSegment =
  | { type: "text"; content: string }
  | { type: "gauge"; groups: { title: string; rows: { label: string; value: string }[] }[] };

function segmentMessage(text: string): MessageSegment[] {
  const lines = text.split('\n');
  const segments: MessageSegment[] = [];

  let textBuffer: string[] = [];
  let currentGroup: { title: string; rows: { label: string; value: string }[] } | null = null;
  let gaugeGroups: { title: string; rows: { label: string; value: string }[] }[] = [];
  // Track whether we're inside a coordinate zone (headers + rows).
  // Blank lines inside the zone are ignored; only real non-coordinate text breaks it.
  let inCoordZone = false;

  const flushText = () => {
    const t = textBuffer.join('\n').trim();
    if (t) segments.push({ type: "text", content: t });
    textBuffer = [];
  };

  const flushGauges = () => {
    if (currentGroup && currentGroup.rows.length > 0) gaugeGroups.push(currentGroup);
    currentGroup = null;
    if (gaugeGroups.length > 0) {
      segments.push({ type: "gauge", groups: [...gaugeGroups] });
      gaugeGroups = [];
    }
    inCoordZone = false;
  };

  for (const line of lines) {
    const trimmed = line.replace(/^[\s\-\*•]+/, '').trim();

    // Section header: TCP
    if (/coordenadas?\s*tcp|tcp\s*position/i.test(trimmed)) {
      flushText();
      if (currentGroup?.rows.length) gaugeGroups.push(currentGroup);
      currentGroup = { title: 'TCP', rows: [] };
      inCoordZone = true;
      continue;
    }
    // Section header: Joints
    if (/[aá]ngulos?\s*(de\s*(los\s*)?)?joints?|joint\s*angles/i.test(trimmed)) {
      flushText();
      if (currentGroup?.rows.length) gaugeGroups.push(currentGroup);
      currentGroup = { title: 'Joints', rows: [] };
      inCoordZone = true;
      continue;
    }

    // Coordinate data line
    const match = trimmed.match(/^(Joint\s*\d+|X|Y|Z|Roll|Pitch|Yaw)\s*:\s*([-+]?\d+\.?\d*)\s*(°|mm|deg)?/i);
    if (match) {
      flushText();
      if (!currentGroup) currentGroup = { title: '', rows: [] };
      currentGroup.rows.push({
        label: match[1].replace(/\s+/, ' '),
        value: match[2] + (match[3] || ''),
      });
      inCoordZone = true;
      continue;
    }

    // Blank or whitespace-only line inside coordinate zone — skip, don't break
    if (inCoordZone && trimmed === '') {
      continue;
    }

    // Real non-coordinate text — flush any accumulated gauges
    if (inCoordZone) {
      flushGauges();
    }
    textBuffer.push(line);
  }

  flushGauges();
  flushText();

  return segments;
}

interface PracticeViewProps {
  automation: Automation;
  sessionId: string;
  userId: string;
  teamId: string;
  progress: UserProgress | undefined;
  onBack: () => void;
  onProgressUpdate: (automationId: string, updates: Partial<UserProgress>) => void;
  onRestart?: (automation: Automation) => void;
  onHeaderControls?: (controls: React.ReactNode) => void;
}

const PRACTICE_THINKING_MESSAGES = [
  "Thinking...",
  "Connecting to robot...",
  "Processing request...",
  "Analyzing movement...",
  "Checking joint positions...",
  "Executing command...",
  "Reading sensors...",
  "Validating safety...",
  "Calculating trajectory...",
  "Verifying state...",
  "Synchronizing...",
  "Preparing response...",
];

function PracticeThinkingIndicator() {
  const [msgIndex, setMsgIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    setMsgIndex(Math.floor(Math.random() * PRACTICE_THINKING_MESSAGES.length));
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setMsgIndex(prev => (prev + 1) % PRACTICE_THINKING_MESSAGES.length);
        setFade(true);
      }, 200);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="studio__practiceLoading">
      <Loader2 size={16} className="studio__practiceLoadingSpinner" />
      <span className={`studio__practiceLoadingMsg ${fade ? "is-visible" : "is-hidden"}`}>
        {PRACTICE_THINKING_MESSAGES[msgIndex]}
      </span>
    </div>
  );
}

export default function PracticeView({ automation, sessionId, userId, teamId, progress, onBack, onProgressUpdate, onRestart, onHeaderControls }: PracticeViewProps) {
  const steps = parseSteps(automation.md_content);
  const [currentStep, setCurrentStep] = useState(progress?.current_step ?? 0);
  const [messages, setMessages] = useState<PracticeMsg[]>([]);
  const [chatMessage, setChatMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
const [eventRuns, setEventRuns] = useState<Record<string, EventRun>>({});
  const [suggestions, setSuggestions] = useState<FollowUpSuggestion[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastResponseRef = useRef<string>("");
  const [toolExecuting, setToolExecuting] = useState<string | null>(null);
  const [robotGaugeData, setRobotGaugeData] = useState<{ title: string; rows: { label: string; value: string }[] }[] | null>(null);
  const [sidebarView, setSidebarView] = useState<"steps" | "state">("steps");
  const practiceChunksRef = useRef<PracticeChunk[]>([]);

  // Dedup guard: prevent StrictMode double-inserts
  const insertedMsgIds = useRef<Set<string>>(new Set());
  const insertMessage = async (msg: {
    id: string;
    session_id: string;
    auth_user_id: string;
    sender: string;
    content: string;
    pasted_contents?: any[];
  }) => {
    if (insertedMsgIds.current.has(msg.id)) return;
    insertedMsgIds.current.add(msg.id);
    const { error } = await supabase.schema("chat").from("messages").insert(msg);
    if (error) {
      console.error("[PracticeView] Message insert error:", error.code, error.message);
      insertedMsgIds.current.delete(msg.id);
    }
  };

  const [robots, setRobots] = useState<ConnectedRobot[]>([]);
  const [selectedRobotIds, setSelectedRobotIds] = useState<string[]>([]);
  const [robotsLoading, setRobotsLoading] = useState(true);

  const [showNoRobotsPopup, setShowNoRobotsPopup] = useState(false);
  const [showRobotDropdown, setShowRobotDropdown] = useState(false);
  const [labOpen, setLabOpen] = useState(isLabOpen);

  // Auto-update lab open status every 60 seconds
  useEffect(() => {
    const id = setInterval(() => setLabOpen(isLabOpen()), 60_000);
    return () => clearInterval(id);
  }, []);
  const [inCall, setInCall] = useState(false);

  // ── Voice call state ──
  const [isCallActive, setIsCallActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [callTranscript, setCallTranscript] = useState("");
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  const isCallActiveRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dgKeyRef = useRef<string | null>(null);

  useEffect(() => {
    isCallActiveRef.current = isCallActive;
  }, [isCallActive]);

  const [isCompleted, setIsCompleted] = useState(progress?.status === "completed");
  const isCompletedRef = useRef(progress?.status === "completed");
  const [reviewMode, setReviewMode] = useState(false);
  const [approvalRequest, setApprovalRequest] = useState<PracticeChunk | null>(null);
  const [liveRobotState, setLiveRobotState] = useState<GaugeGroups | null>(null);

  // ── Recording state ──
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [recordCounts, setRecordCounts] = useState<{ elapsed: number } | null>(null);
  const recordPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStartTimeRef = useRef<number>(0);
  const recordSessionIdRef = useRef<string>("");
  const recordSummaryRef = useRef<any>(null);

// ── Fetch connected robots (poll every 15s) ──
  useEffect(() => {
    let cancelled = false;
    const fetchRobots = async () => {
      try {
        const res = await fetch(`${AGENT_API_URL}/api/robots`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const list: ConnectedRobot[] = data.robots || [];
        if (cancelled) return;
        setRobots(list);
        setRobotsLoading(false);

        // Auto-select all robots by default; clean disconnected from selection
        setSelectedRobotIds((prev) => {
          if (prev.length === 0 && list.length > 0) {
            return list.map((r) => r.robot_id);
          }
          return prev.filter((id) => list.some((r) => r.robot_id === id));
        });
      } catch {
        if (!cancelled) setRobotsLoading(false);
      }
    };
    fetchRobots();
    const interval = setInterval(fetchRobots, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Ensure session exists in chat.sessions, then load existing messages
  useEffect(() => {
    (async () => {
      // Ensure session row exists (may be missing if restored from progress)
      await supabase.schema("chat").from("sessions").upsert({
        id: sessionId,
        auth_user_id: userId,
        team_id: teamId,
        title: `Practice: ${automation.title}`,
        chat_mode: "practice",
      }, { onConflict: "id", ignoreDuplicates: true });

      const { data } = await supabase
        .schema("chat")
        .from("messages")
        .select("id, sender, content, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      if (data && data.length > 0) {
        setMessages(data.map((m: any) => ({
          id: m.id,
          text: m.content,
          sender: m.sender as "user" | "ai",
          createdAt: m.created_at,
        })));
      }
    })();
  }, [sessionId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Re-fetch progress from Supabase and sync local + parent state
  const refreshProgress = async () => {
    const { data } = await supabase
      .schema("lab")
      .from("user_automation_progress")
      .select("current_step, status, started_at, completed_at, session_id")
      .eq("auth_user_id", userId)
      .eq("automation_id", automation.id)
      .maybeSingle();

    if (data) {
      console.log("[PracticeView] refreshed progress:", data.current_step, data.status);
      setCurrentStep(data.current_step ?? 0);
      onProgressUpdate(automation.id, {
        current_step: data.current_step,
        status: data.status,
        completed_at: data.completed_at,
      });
      if (data.status === "completed") { isCompletedRef.current = true; setIsCompleted(true); }
    }
  };


  // ── Audio playback (progressive chunked TTS) ──
  const playNextChunk = useCallback(async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setIsSpeaking(false);
      // Resume mic
      if (isCallActiveRef.current) {
        const ws = recognitionRef.current;
        const wsOpen = ws instanceof WebSocket && ws.readyState === WebSocket.OPEN;
        if (wsOpen && mediaRecorderRef.current?.state === "paused") {
          mediaRecorderRef.current.resume();
          setIsListening(true);
        } else if (!wsOpen) {
          console.log("[Voice] WS not open after playback, waiting for reconnect...");
        }
      }
      return;
    }

    isPlayingRef.current = true;

    // Batch 3-5 chunks together for smoother playback
    const batchSize = Math.min(5, audioQueueRef.current.length);
    const chunks = audioQueueRef.current.splice(0, batchSize);

    try {
      // Decode each chunk and concatenate bytes
      let totalLength = 0;
      const decoded: Uint8Array[] = [];
      for (const chunk of chunks) {
        const binaryStr = atob(chunk);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        decoded.push(bytes);
        totalLength += bytes.length;
      }
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const d of decoded) {
        combined.set(d, offset);
        offset += d.length;
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const audioBuffer = await audioContextRef.current.decodeAudioData(combined.buffer);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => playNextChunk();
      source.start();
    } catch (err) {
      console.warn("[Voice] chunk decode error, skipping batch:", err);
      playNextChunk();
    }
  }, []);

  // ── Practice chunk handler (streaming tool execution) ──
  const handlePracticeChunk = useCallback((chunk: PracticeChunk) => {
    console.log("[DUP-DEBUG] chunk:", chunk.type, chunk.content?.substring(0, 50));

    if (chunk.type === 'approval_request') {
      setApprovalRequest(chunk);
      return;
    }

    if (isCompletedRef.current) return;

    practiceChunksRef.current.push(chunk);

    if (chunk.type === 'partial' && chunk.content) {
      const text = chunk.content;
      setMessages(prev => [...prev, {
        id: `chunk-partial-${Date.now()}`,
        text,
        sender: "ai" as const,
        createdAt: new Date().toISOString(),
      }]);
      setIsLoading(false);
    } else if (chunk.type === 'tool_status') {
      if (chunk.status === 'executing') {
        setToolExecuting(chunk.tool || null);
      } else if (chunk.status === 'completed') {
        const toolName = chunk.tool || toolExecuting || 'tool';
        setMessages(prev => [...prev, {
          id: `tool-${Date.now()}`,
          text: '',
          sender: 'ai' as const,
          createdAt: new Date().toISOString(),
          tool: toolName,
        }]);
        setToolExecuting(null);
      }
    } else if (chunk.type === 'response' && chunk.content) {
      console.log("[DEBUG] practice_chunk response received:", chunk.content?.substring(0, 50), "chunks so far:", practiceChunksRef.current.length);
      const text = chunk.content;
      // Remove partial messages that will be replaced by this final response
      setMessages(prev => {
        const filtered = prev.filter(m => !m.id?.startsWith("chunk-partial-"));
        return [...filtered, {
          id: `chunk-response-${Date.now()}`,
          text,
          sender: "ai" as const,
          createdAt: new Date().toISOString(),
        }];
      });
      setToolExecuting(null);
      setIsLoading(false);

      // Save combined chunk content as ONE message in DB
      const combined = practiceChunksRef.current
        .filter(c => (c.type === 'partial' || c.type === 'response') && c.content)
        .map(c => c.content!)
        .join('\n\n');

      if (combined) {
        const msgId = crypto.randomUUID();
        insertMessage({
          id: msgId,
          session_id: sessionId,
          auth_user_id: userId,
          sender: "ai",
          content: combined,
        });
      }

      refreshProgress();
    }
  }, [sessionId, userId]);

  // Agent chat hook
  const { sendMessage: agentSend, suggestions: agentSuggestions } = useAgentChat({
    apiUrl: AGENT_API_URL,
    userId,
    sessionId,
    interactionMode: "practice",
    mdContent: automation.md_content ?? '',
    automationId: automation.id,
    robotIds: selectedRobotIds,
    onPracticeChunk: handlePracticeChunk,
    onAudioChunk: (chunk: string) => {
      if (!isCallActiveRef.current) return;
      if (recognitionRef.current instanceof WebSocket) {
        // Pause Deepgram while TTS plays
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.pause();
        }
        setIsListening(false);
      }
      setIsSpeaking(true);
      audioQueueRef.current.push(chunk);
      if (!isPlayingRef.current) {
        playNextChunk();
      }
    },
    onAudioDone: () => {
      // Mark that no more chunks are coming
      // playNextChunk will resume mic when queue drains
      console.log("[Voice] audio_done, remaining chunks:", audioQueueRef.current.length);
    },
    onEvent: (evt: AgentEvent) => {
      if (evt.type === 'tokens') return;
      if (evt.type === 'practice_update' && evt.metadata) {
        const newStep = evt.metadata.step ?? evt.metadata.current_step;
        if (typeof newStep === 'number') {
          console.log("[PracticeView] SSE practice_update -> step", newStep);
          setCurrentStep(newStep);
          const newStatus = evt.metadata.completed ? "completed" : "in_progress";
          onProgressUpdate(automation.id, {
            current_step: newStep,
            status: newStatus,
          });
          if (newStatus === "completed") { isCompletedRef.current = true; setIsCompleted(true); }
        }
        // If chunks were already sent, refresh progress (DB save already done by chunk handler)
        if (evt.metadata.chunks_sent) {
          setIsLoading(false);
          refreshProgress();
        }
      }
    },
    onResponse: (response) => {
      setIsLoading(false);
      setToolExecuting(null);

      // If practice_chunks handled the response, skip
      if (practiceChunksRef.current.length > 0) {
        console.log("[PracticeView] onResponse: skipped, handled by practice_chunks");
        return;
      }

      // No practice_chunks arrived — this is a text-only response, add it
      if (!response || lastResponseRef.current === response) return;
      lastResponseRef.current = response;

      const msgId = crypto.randomUUID();
      setMessages(prev => [...prev, {
        id: msgId,
        text: response,
        sender: "ai" as const,
        createdAt: new Date().toISOString(),
      }]);

      // Save to DB
      insertMessage({
        id: msgId,
        session_id: sessionId,
        auth_user_id: userId,
        sender: "ai",
        content: response,
      });

      console.log("[PracticeView] onResponse: text-only response added");
    },
    onStreamEnd: () => { setIsLoading(false); },
    onError: () => { setIsLoading(false); },
  });

  useEffect(() => {
    if (agentSuggestions.length > 0) {
      setSuggestions(agentSuggestions.map((s: string) => ({ id: crypto.randomUUID(), text: s })));
    }
  }, [agentSuggestions]);

  // ── Recording helpers ──
  const stopRecordPoll = () => {
    if (recordPollRef.current) { clearInterval(recordPollRef.current); recordPollRef.current = null; }
  };

  const startRecording = async () => {
    const deviceId = selectedRobotIds[0];
    if (!deviceId) return;
    const sessionId = crypto.randomUUID();
    recordSessionIdRef.current = sessionId;
    recordSummaryRef.current = null;
    try {
      await fetch(`${AGENT_API_URL}/api/record/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, device_id: deviceId }),
      });
    } catch (e) {
      console.error("[startRecording] /api/record/start failed:", e);
    }
    recordStartTimeRef.current = Date.now();
    setIsRecording(true);
    setHasRecording(false);
    setRecordCounts({ elapsed: 0 });
    recordPollRef.current = setInterval(() => {
      setRecordCounts({ elapsed: Math.round((Date.now() - recordStartTimeRef.current) / 1000) });
    }, 1000);
  };

  const stopRecording = async () => {
    stopRecordPoll();
    setIsRecording(false);
    setHasRecording(true);
    const sessionId = recordSessionIdRef.current;
    const deviceId = selectedRobotIds[0];
    if (!sessionId || !deviceId) return;
    try {
      const res = await fetch(`${AGENT_API_URL}/api/record/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, device_id: deviceId }),
      });
      if (res.ok) {
        const data = await res.json();
        recordSummaryRef.current = {
          summary: data.summary,
          started_at: data.started_at,
          stopped_at: data.stopped_at,
          active: false,
        };
      }
    } catch (e) {
      console.error("[stopRecording] /api/record/stop failed:", e);
    }
  };

  const sendRecord = async () => {
    if (isRecording) await stopRecording();
    setHasRecording(false);
    setRecordCounts(null);
    const text = "I'm done. Here's what I did — how did I do?";
    setIsLoading(true);
    practiceChunksRef.current = [];
    setToolExecuting(null);
    agentSend(text, { studentRecording: recordSummaryRef.current ?? undefined });
  };

  // ── DEBUG: download the server-side summary that will be sent to the agent ──
  const downloadRecord = async () => {
    const sessionId = recordSessionIdRef.current;
    const deviceId = selectedRobotIds[0];
    let serverSummary: any = null;
    let httpStatus: number | null = null;
    let fetchError: string | null = null;

    if (sessionId) {
      try {
        const res = await fetch(`${AGENT_API_URL}/api/record/summary/${sessionId}`);
        httpStatus = res.status;
        if (res.ok) serverSummary = await res.json();
      } catch (e) {
        fetchError = String(e);
      }
    }

    const debugPayload = {
      _debug_meta: {
        generated_at: new Date().toISOString(),
        agent_api_url: AGENT_API_URL,
        selected_device_id: deviceId,
        session_id: sessionId,
        http_status: httpStatus,
        fetch_error: fetchError,
      },
      server_recording_summary: serverSummary,
      payload_that_would_be_sent_to_agent: recordSummaryRef.current,
    };

    const blob = new Blob([JSON.stringify(debugPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recording-debug-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Cleanup poll on unmount
  useEffect(() => () => stopRecordPoll(), []);

  // ── Live telemetry polling for State tab ──
  useEffect(() => {
    if (sidebarView !== "state" || selectedRobotIds.length === 0) {
      setLiveRobotState(null);
      return;
    }
    const robotId = selectedRobotIds[0];
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`${AGENT_API_URL}/api/telemetry/latest`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const telem = data[robotId] ?? data[Object.keys(data)[0]];
        if (telem) {
          const groups = parseTelemetry(telem);
          if (groups.length) setLiveRobotState(groups);
        }
      } catch { /* ignore network errors */ }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [sidebarView, selectedRobotIds.join(",")]);

  const downloadReview = async () => {
    const { data } = await supabase
      .schema("lab")
      .from("user_automation_progress")
      .select("agent_observations, current_step, status, completed_at")
      .eq("auth_user_id", userId)
      .eq("automation_id", automation.id)
      .maybeSingle();

    if (!data?.agent_observations) return;

    let observations: { step: number; observation: string }[] = data.agent_observations;
    if (typeof observations === 'string') {
      try { observations = JSON.parse(observations); } catch { return; }
    }
    if (!Array.isArray(observations)) return;
    const lines: string[] = [
      `Practice Review — ${automation.title}`,
      `Status: ${data.status}  |  Steps completed: ${data.current_step}`,
      `Completed: ${data.completed_at ? new Date(data.completed_at).toLocaleString() : "In progress"}`,
      "",
      ...observations.map(o =>
        `Step ${o.step}\n${"-".repeat(40)}\n${o.observation}\n`
      ),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${automation.title.replace(/\s+/g, "_")}_review.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const answerApproval = async (approved: boolean) => {
    setApprovalRequest(null);
    if (!sessionId) return;
    await fetch(`${AGENT_API_URL}/api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, approved }),
    }).catch(console.error);
  };

  const handleSend = async () => {
    const text = chatMessage.trim();
    if (!text || isLoading) return;

    const messageId = crypto.randomUUID();
    const userMsg: Message = {
      id: messageId,
      text,
      sender: "user",
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setChatMessage("");
    setIsLoading(true);
    setSuggestions([]);
    lastResponseRef.current = "";

    await insertMessage({
      id: messageId,
      session_id: sessionId,
      auth_user_id: userId,
      sender: "user",
      content: text,
      pasted_contents: [],
    });

    practiceChunksRef.current = [];
    setToolExecuting(null);
    agentSend(text);
  };

const handleStepClick = async (stepIdx: number) => {
    if (stepIdx > currentStep) return;
    await supabase.schema("lab").from("user_automation_progress").upsert({
      auth_user_id: userId,
      automation_id: automation.id,
      session_id: sessionId,
      status: stepIdx >= steps.length - 1 ? "completed" : "in_progress",
      current_step: stepIdx,
      last_active_at: new Date().toISOString(),
    }, { onConflict: "auth_user_id,automation_id" });

    setCurrentStep(stepIdx);
    onProgressUpdate(automation.id, {
      current_step: stepIdx,
      status: stepIdx >= steps.length - 1 ? "completed" : "in_progress",
    });
  };

  // ── Deepgram WebSocket connection (reusable for reconnects) ──
  const connectDeepgram = useCallback((dgKey: string, stream: MediaStream) => {
    // Close any existing WS
    if (recognitionRef.current instanceof WebSocket && recognitionRef.current.readyState === WebSocket.OPEN) {
      recognitionRef.current.close();
    }
    // Stop existing MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    const dgUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=es&smart_format=true&endpointing=300&interim_results=true&utterance_end_ms=1500`;
    const ws = new WebSocket(dgUrl, ["token", dgKey]);

    ws.onopen = () => {
      console.log("[Voice] Deepgram connected");
      setIsListening(true);

      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(event.data);
        }
      };
      mediaRecorder.start(250);
      mediaRecorderRef.current = mediaRecorder;
    };

    let interimTranscript = "";

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("[Voice] DG message:", data.type, "is_final:", data.is_final,
        "transcript:", data.channel?.alternatives?.[0]?.transcript?.substring(0, 30));

      // On utterance_end, send the accumulated text
      if (data.type === "UtteranceEnd" && interimTranscript.trim()) {
        const finalText = interimTranscript.trim();
        interimTranscript = "";
        setCallTranscript("");
        setIsListening(false);

        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.pause();
        }

        const messageId = crypto.randomUUID();
        setMessages(prev => [...prev, {
          id: messageId,
          text: finalText,
          sender: "user" as const,
          createdAt: new Date().toISOString(),
        }]);

        insertMessage({
          id: messageId,
          session_id: sessionId,
          auth_user_id: userId,
          sender: "user",
          content: finalText,
        });

        setIsLoading(true);
        setSuggestions([]);
        lastResponseRef.current = "";
        practiceChunksRef.current = [];
        setToolExecuting(null);
        agentSend(finalText, { voiceEnabled: true });
        return;
      }

      const transcript = data.channel?.alternatives?.[0]?.transcript || "";
      if (!transcript) return;

      if (data.is_final) {
        interimTranscript += (interimTranscript ? " " : "") + transcript;
        setCallTranscript(interimTranscript);
      } else {
        setCallTranscript(interimTranscript + (interimTranscript ? " " : "") + transcript);
      }
    };

    ws.onerror = (err) => {
      console.error("[Voice] Deepgram error:", err);
    };

    ws.onclose = () => {
      console.log("[Voice] Deepgram disconnected");
      if (isCallActiveRef.current && streamRef.current?.active) {
        console.log("[Voice] Reconnecting Deepgram...");
        setTimeout(() => {
          if (isCallActiveRef.current && streamRef.current?.active && dgKeyRef.current) {
            connectDeepgram(dgKeyRef.current, streamRef.current);
          }
        }, 500);
      }
    };

    recognitionRef.current = ws;
  }, [sessionId, userId, agentSend]);

  // ── Voice call: start / stop ──
  const startCall = useCallback(async () => {
    // 1. Get Deepgram token
    let dgKey: string;
    try {
      const res = await fetch(`${AGENT_API_URL}/api/deepgram-token`);
      const data = await res.json();
      if (!data.key) throw new Error(data.error || "No key");
      dgKey = data.key;
    } catch (err) {
      console.error("[Voice] Failed to get Deepgram token:", err);
      alert("No se pudo activar el modo voz. Verifica la configuración.");
      return;
    }

    // 2. Get microphone
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error("[Voice] Microphone access denied:", err);
      alert("Necesitas permitir acceso al micrófono.");
      return;
    }

    // 3. Store refs and connect
    dgKeyRef.current = dgKey;
    streamRef.current = stream;
    audioContextRef.current = new AudioContext();
    isCallActiveRef.current = true;
    setIsCallActive(true);
    setInCall(true);

    connectDeepgram(dgKey, stream);
  }, [connectDeepgram]);

  const stopCall = useCallback(() => {
    isCallActiveRef.current = false;
    dgKeyRef.current = null;
    setIsCallActive(false);
    setInCall(false);
    setIsListening(false);
    setIsSpeaking(false);
    setCallTranscript("");

    // Stop MediaRecorder
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    // Close Deepgram WebSocket
    if (recognitionRef.current) {
      if (recognitionRef.current instanceof WebSocket) {
        recognitionRef.current.close();
      }
      recognitionRef.current = null;
    }
    // Stop mic stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  }, []);

  // ── Push practice controls into the main header ──
  useEffect(() => {
    if (!onHeaderControls) return;
    onHeaderControls(
      <>
        {/* Robot status pill */}
        {robotsLoading ? (
          <span className="studio__robotPill studio__robotPill--disconnected">
            <span className="studio__robotDot studio__robotDot--disconnected" />
            Loading...
          </span>
        ) : robots.length === 0 ? (
          <span className="studio__robotPill studio__robotPill--disconnected">
            <span className="studio__robotDot studio__robotDot--disconnected" />
            No robots
            <button
              type="button"
              className="studio__robotInfoBtn"
              onClick={() => setShowNoRobotsPopup(true)}
              aria-label="Troubleshooting info"
            >
              <Info size={13} />
            </button>
          </span>
        ) : (
          <div className="studio__robotDropdownWrap">
            <button
              type="button"
              className={`studio__robotPill ${
                robots.some(r => r.connected)
                  ? labOpen ? 'studio__robotPill--connected' : 'studio__robotPill--restricted'
                  : 'studio__robotPill--disconnected'
              }`}
              onClick={() => setShowRobotDropdown(prev => !prev)}
              title={!labOpen && robots.some(r => r.connected) ? 'Lab hours: 9:00 AM – 9:00 PM (Monterrey time)' : undefined}
            >
              <span className={`studio__robotDot ${
                robots.some(r => r.connected)
                  ? labOpen ? 'studio__robotDot--connected' : 'studio__robotDot--restricted'
                  : 'studio__robotDot--disconnected'
              }`} />
              {robots.some(r => r.connected)
                ? labOpen ? `${robots.filter(r => r.connected).length} connected` : 'Restricted'
                : 'No robots'}
              {selectedRobotIds.length > 0 && (
                <span className="studio__robotSelectedCount">{selectedRobotIds.length}</span>
              )}
              <ChevronDown size={12} className={`studio__robotChevron ${showRobotDropdown ? 'is-open' : ''}`} />
            </button>
            {showRobotDropdown && (
              <>
                <div className="studio__robotDropdownBackdrop" onClick={() => setShowRobotDropdown(false)} />
                <div className="studio__robotDropdown">
                  {robots.map((r) => (
                    <label key={r.robot_id} className="studio__robotDropdownItem">
                      <input
                        type="checkbox"
                        className="studio__robotCheckbox"
                        checked={selectedRobotIds.includes(r.robot_id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRobotIds(prev => [...prev, r.robot_id]);
                          } else {
                            setSelectedRobotIds(prev => prev.filter(id => id !== r.robot_id));
                          }
                        }}
                      />
                      <span className={`studio__robotDot ${r.connected ? 'studio__robotDot--connected' : 'studio__robotDot--disconnected'}`} />
                      <span className="studio__robotDropdownName">{r.robot_id}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {selectedRobotIds.length > 0 && (
          <div className="studio__recordHeaderGroup">
            <button
              type="button"
              className={`studio__robotPill studio__robotPill--mono ${isRecording ? 'studio__robotPill--recording' : ''}`}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isCompleted}
            >
              {isRecording ? '■ Stop' : '● Rec'}
            </button>
            {isRecording && recordCounts && (
              <span className="studio__recordHeaderStatus">
                {recordCounts.elapsed}s
              </span>
            )}
            {hasRecording && (
              <button
                type="button"
                className="studio__robotPill studio__robotPill--mono studio__robotPill--send"
                onClick={sendRecord}
                disabled={isLoading}
              >
                Send rec
              </button>
            )}
            {hasRecording && (
              <button
                type="button"
                className="studio__robotPill studio__robotPill--mono"
                onClick={downloadRecord}
                title="DEBUG: download the raw payload that would be sent"
              >
                ⬇ Debug
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          className={`studio__robotPill studio__robotPill--mono ${inCall ? 'is-active' : ''}`}
          onClick={isCallActive ? stopCall : startCall}
        >
          {inCall ? <PhoneOff size={13} /> : <Phone size={13} />}
          {inCall ? 'Stop Call' : 'Take Call'}
        </button>

      </>
    );
    return () => onHeaderControls?.(null);
  }, [onHeaderControls, robotsLoading, robots, selectedRobotIds, showRobotDropdown, inCall, isCallActive, startCall, stopCall, labOpen, isRecording, hasRecording, recordCounts, isCompleted, isLoading, startRecording, stopRecording, sendRecord, downloadRecord]);

  // Cache segmentMessage per message to avoid re-parsing on every render
  const segmentedMessages = useMemo(() => {
    const map = new Map<string, MessageSegment[]>();
    let lastGauge: { title: string; rows: { label: string; value: string }[] }[] | null = null;

    for (const msg of messages) {
      if (msg.sender === "ai" && !msg.tool) {
        const segs = segmentMessage(msg.text);
        map.set(msg.id, segs);
        // Extract latest gauge data for sidebar
        for (const seg of segs) {
          if (seg.type === "gauge") {
            lastGauge = seg.groups;
          }
        }
      }
    }

    if (lastGauge) setRobotGaugeData(lastGauge);
    return map;
  }, [messages]);

  return (
    <div className="studio__practiceView">
      {/* 2-column body */}
      <div className="studio__practiceBody">
        {/* Steps sidebar */}
        <div className="studio__practiceSidebar">
          <div className="studio__practiceSidebarNav">
            <button type="button" className="studio__practiceBack" onClick={onBack}>
              <ChevronLeft size={16} />
              <span>Back</span>
            </button>
          </div>
          <div className="studio__practiceSidebarHeader">
            <h3 className="studio__practiceSidebarTitle">{automation.title}</h3>
            <span className="studio__practiceDiffBadge">
              {automation.difficulty}
            </span>
          </div>

          {steps.length > 0 && (
            <div className="studio__practiceProgress">
              <span className="studio__practiceProgressLabel">Progress</span>
              <div className="studio__practiceProgressBar">
                <div
                  className="studio__practiceProgressFill"
                  style={{ width: `${(Math.min(currentStep + 1, steps.length) / steps.length) * 100}%` }}
                />
              </div>
              <span className="studio__practiceProgressText">
                {Math.min(currentStep + 1, steps.length)} / {steps.length} steps
              </span>
            </div>
          )}

          <div className="studio__sidebarViewToggle">
            <button
              type="button"
              className={`studio__sidebarViewBtn ${sidebarView === "steps" ? "is-active" : ""}`}
              onClick={() => setSidebarView("steps")}
            >
              Steps
            </button>
            <button
              type="button"
              className={`studio__sidebarViewBtn ${sidebarView === "state" ? "is-active" : ""}`}
              onClick={() => setSidebarView("state")}
            >
              State
            </button>
          </div>

          {sidebarView === "steps" ? (
            <div className="studio__practiceSteps">
              {steps.map((step, idx) => {
                const completed = idx < currentStep;
                const active = idx === currentStep;
                const pending = idx > currentStep;
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`studio__practiceStep ${completed ? "is-completed" : ""} ${active ? "is-active" : ""} ${pending ? "is-pending" : ""}`}
                    onClick={() => handleStepClick(idx)}
                    disabled={pending}
                  >
                    <span className="studio__practiceStepDot">
                      {completed ? <Check size={12} /> : null}
                    </span>
                    <span className="studio__practiceStepName">{step || `Step ${idx + 1}`}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="studio__practiceSidebarState">
              {selectedRobotIds.length === 0 ? (
                <div className="studio__robotStateEmpty">
                  <div className="studio__robotStateEmptyIcon">
                    <Unplug size={28} />
                  </div>
                  <span>Connect to a robot to see its state</span>
                </div>
              ) : !(liveRobotState ?? robotGaugeData) ? (
                <div className="studio__practiceSidebarStateWaiting">
                  <Loader2 size={16} className="animate-spin" />
                  <span>Waiting for data...</span>
                </div>
              ) : (
                <RobotGaugeTable groups={(liveRobotState ?? robotGaugeData)!} />
              )}
            </div>
          )}

          <div className="studio__practiceSidebarFooter">
            <button type="button" className="studio__practiceDownloadBtn" onClick={downloadReview}>
              Download Review
            </button>
            <button type="button" className="studio__practiceExitBtn" onClick={onBack}>
              Exit Practice
            </button>
          </div>
        </div>

        {/* Chat area */}
        <div className="studio__practiceChat">
          <div className={`studio__practiceMsgs ${isCompleted && !reviewMode ? "is-paused" : ""} ${inCall ? "is-in-call" : ""}`}>
            {messages.length === 0 && !isLoading && (
              <div className="studio__practiceChatEmpty">
                <SparklesIcon className="w-8 h-8" style={{ color: "#d1d5db" }} />
                <p>Start the practice by sending a message.</p>
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id}>
                {msg.tool ? (
                  <div className="studio__practiceToolPill">
                    <svg className="studio__practiceToolPillIcon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>{msg.tool} executed</span>
                    <Check size={14} className="studio__practiceToolPillCheck" />
                  </div>
                ) : (
                  <>
                    {(() => {
                      const segments = segmentedMessages.get(msg.id);
                      if (segments && segments.some(s => s.type === "gauge")) {
                        return (
                          <>
                            {segments.map((seg, i) =>
                              seg.type === "text"
                                ? <MessageBubble key={i} message={{ ...msg, text: seg.content }} />
                                : null  // Gauges go to sidebar, not inline
                            )}
                          </>
                        );
                      }
                      return <MessageBubble message={msg} />;
                    })()}
                    {msg.sender === "user" && eventRuns[msg.id] && (
                      <InlineEventRun
                        run={eventRuns[msg.id]}
                        onToggleExpand={(id) => {
                          setEventRuns(prev => ({
                            ...prev,
                            [id]: { ...prev[id], isExpanded: !prev[id].isExpanded },
                          }));
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            ))}

            {!isLoading && suggestions.length > 0 && (
              <FollowUpSuggestions
                suggestions={suggestions}
                onSelect={(text) => { setChatMessage(text); }}
              />
            )}

            {toolExecuting && (
              <div className="studio__practiceToolStatus">
                <Loader2 size={16} className="animate-spin" />
                <span>Executing {toolExecuting}...</span>
              </div>
            )}

            {isLoading && !toolExecuting && <PracticeThinkingIndicator />}
            <div ref={messagesEndRef} />
          </div>

{isCompleted && !reviewMode && (
            <div className="studio__practicePausedOverlay">
              <div className="studio__practiceCompletedCard">
                <CheckCircle size={32} className="studio__practiceCompletedIcon" />
                <span className="studio__practiceCompletedTitle">Practice completed!</span>
                <span className="studio__practiceCompletedDesc">You finished {automation.title}</span>
                <div className="studio__practiceCompletedActions">
                  <button type="button" className="studio__practiceCompletedPrimaryBtn" onClick={onBack}>
                    <ArrowLeft size={14} />
                    Back to Studio
                  </button>
                  <button type="button" className="studio__practiceCompletedSecondaryBtn" onClick={() => setReviewMode(true)}>
                    <Eye size={14} />
                    Review conversation
                  </button>
                  {onRestart && (
                    <button type="button" className="studio__practiceCompletedSecondaryBtn" onClick={() => onRestart(automation)}>
                      <RotateCcw size={14} />
                      Restart practice
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {inCall && (
            <div className="studio__practiceCallOverlay">
              <div className="studio__practiceCallCard">
                <Phone size={20} />
                <span className="studio__practiceCallTitle">Call in progress</span>

                <div className="studio__practiceCallStatus">
                  {isListening && (
                    <span className="studio__practiceCallIndicator studio__practiceCallIndicator--listening">
                      <Mic size={14} className="studio__practiceCallPulse" />
                      Listening...
                    </span>
                  )}
                  {isLoading && !isSpeaking && (
                    <span className="studio__practiceCallIndicator studio__practiceCallIndicator--thinking">
                      <Loader2 size={14} className="animate-spin" />
                      Thinking...
                    </span>
                  )}
                  {isSpeaking && (
                    <span className="studio__practiceCallIndicator studio__practiceCallIndicator--speaking">
                      <AudioLines size={14} />
                      Speaking...
                    </span>
                  )}
                  {!isListening && !isLoading && !isSpeaking && (
                    <span className="studio__practiceCallIndicator">
                      Connecting...
                    </span>
                  )}
                </div>

                {callTranscript && (
                  <span className="studio__practiceCallTranscript">"{callTranscript}"</span>
                )}

                <button type="button" className="studio__practiceCallStopBtn" onClick={stopCall}>
                  <PhoneOff size={14} />
                  Stop Call
                </button>
              </div>
            </div>
          )}

          {showNoRobotsPopup && (
            <div className="studio__practiceCallOverlay" onClick={() => setShowNoRobotsPopup(false)}>
              <div className="studio__practiceNoRobotsCard" onClick={(e) => e.stopPropagation()}>
                <Info size={20} />
                <span className="studio__practiceCallTitle">No functioning robots</span>
                <span className="studio__practiceCallDesc">No robots are currently connected. Want to do troubleshooting?</span>
                <div className="studio__practiceNoRobotsActions">
                  <button type="button" className="studio__practiceCallStopBtn" onClick={() => setShowNoRobotsPopup(false)}>
                    Troubleshoot
                  </button>
                  <button type="button" className="studio__practiceNoRobotsDismiss" onClick={() => setShowNoRobotsPopup(false)}>
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {approvalRequest && (
            <div className="studio__approvalOuter">
              <div className="studio__approvalStrip">
                <span className="studio__approvalStripLabel">
                  ⚠ {approvalRequest.content ?? `Joint ${approvalRequest.joint_id} → ${approvalRequest.angle}°`}
                </span>
                <div className="studio__approvalStripBtns">
                  <button onClick={() => answerApproval(true)}>Approve</button>
                  <button onClick={() => answerApproval(false)}>Reject</button>
                </div>
              </div>
            </div>
          )}

          <div className={`studio__practiceChatInput ${isCompleted ? "is-paused" : ""}`}>
            <ChatInput
              value={chatMessage}
              onChange={setChatMessage}
              onSubmit={handleSend}
              placeholder={isCompleted ? "Practice completed" : "Ask about this practice..."}
              disabled={isLoading || isCompleted}
              isLoading={isLoading}
              onStop={() => setIsLoading(false)}
              pendingFiles={[]}
              onAttachClick={() => {}}
              onRemoveFile={() => {}}
            />
            <p className="studio__practiceDisclaimer">
              ORION Labs operates real equipment — verify all movements before execution.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
