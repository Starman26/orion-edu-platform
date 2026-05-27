import { useState, useEffect, useRef, useCallback } from "react";
import { Check, Loader2, ChevronLeft, ChevronDown, Info, Phone, PhoneOff, Mic, AudioLines, SlidersHorizontal, X, Pencil, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAgentChat } from "./useAgentChat";
import type { AgentEvent, ChatImage } from "./useAgentChat";
import {
  MessageBubble,
  ChatInput,
  FollowUpSuggestions,
  type Message,
  type FollowUpSuggestion,
  type ImageAttachment,
  type PastedContent,
} from "./ChatComponents";
import { SparklesIcon } from "@heroicons/react/24/outline";
import type { Automation } from "./StudioHelpers";

const AGENT_API_URL = import.meta.env.VITE_AGENT_API_URL || 'https://sentinela-909652673285.us-central1.run.app';

const MODEL_OPTIONS = [
  { value: "gemini-flash",  label: "Gemini 2.0 Flash" },
  { value: "gpt-4o-mini",   label: "GPT-4o mini" },
  { value: "gpt-4o",        label: "GPT-4o" },
  { value: "claude-haiku",  label: "Claude Haiku" },
  { value: "claude-sonnet", label: "Claude Sonnet" },
  { value: "claude-opus",   label: "Claude Opus" },
];

const PERSONA_OPTIONS = [
  { value: "",         label: "Default" },
  { value: "newton",   label: "Isaac Newton" },
  { value: "turing",   label: "Alan Turing" },
  { value: "tesla",    label: "Nikola Tesla" },
  { value: "ada",      label: "Ada Lovelace" },
  { value: "davinci",  label: "Leonardo da Vinci" },
  { value: "asimov",   label: "Isaac Asimov" },
  { value: "executor", label: "Executor" },
  { value: "custom",   label: "Custom…" },
];

function isLabOpen(): boolean {
  const now = new Date();
  const mtyHour = parseInt(
    now.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Monterrey" }),
    10,
  );
  return mtyHour >= 9 && mtyHour < 21;
}

interface ConnectedRobot { robot_id: string; connected: boolean; }

type AutomationMsg = Message & { tool?: string };

// ── Virtual Tracker ──────────────────────────────────────────────────────────
interface VirtualTracker {
  shape: "box" | "cylinder" | "sphere";
  width: number;
  height: number;
  depth: number;
  radius: number;
  unit: "mm" | "cm" | "m";
}

const TRACKER_DEFAULTS: VirtualTracker = {
  shape: "box", width: 100, height: 100, depth: 100, radius: 50, unit: "mm",
};

function BoxWireframe({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.85} viewBox="0 0 110 94" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
      <rect x="5" y="27" width="68" height="62" />
      <rect x="32" y="5" width="68" height="62" />
      <line x1="5" y1="27" x2="32" y2="5" />
      <line x1="73" y1="27" x2="100" y2="5" />
      <line x1="73" y1="89" x2="100" y2="67" />
      <line x1="5" y1="89" x2="32" y2="67" />
    </svg>
  );
}

function CylinderWireframe({ size = 110 }: { size?: number }) {
  return (
    <svg width={size * 0.82} height={size} viewBox="0 0 90 110" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <ellipse cx="45" cy="22" rx="38" ry="14" />
      <ellipse cx="45" cy="88" rx="38" ry="14" />
      <line x1="7" y1="22" x2="7" y2="88" />
      <line x1="83" y1="22" x2="83" y2="88" />
    </svg>
  );
}

function SphereWireframe({ size = 110 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 110 110" fill="none"
      stroke="currentColor" strokeWidth="1.5">
      <circle cx="55" cy="55" r="48" />
      <ellipse cx="55" cy="55" rx="48" ry="16" />
      <ellipse cx="55" cy="55" rx="16" ry="48" />
    </svg>
  );
}

const THINKING_MESSAGES = [
  "Thinking...",
  "Connecting to robot...",
  "Processing request...",
  "Executing command...",
  "Reading sensors...",
  "Validating safety...",
  "Calculating trajectory...",
  "Verifying state...",
  "Synchronizing...",
  "Preparing response...",
];

function ThinkingIndicator() {
  const [msgIndex, setMsgIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    setMsgIndex(Math.floor(Math.random() * THINKING_MESSAGES.length));
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setMsgIndex(prev => (prev + 1) % THINKING_MESSAGES.length);
        setFade(true);
      }, 200);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="studio__practiceLoading">
      <Loader2 size={16} className="studio__practiceLoadingSpinner" />
      <span className={`studio__practiceLoadingMsg ${fade ? "is-visible" : "is-hidden"}`}>
        {THINKING_MESSAGES[msgIndex]}
      </span>
    </div>
  );
}

export interface AutomationViewProps {
  automation: Automation;
  sessionId: string;
  userId: string;
  teamId: string;
  userName?: string;
  onBack: () => void;
  onHeaderControls?: (controls: React.ReactNode) => void;
}

export default function AutomationView({
  automation,
  sessionId,
  userId,
  teamId,
  userName = "",
  onBack,
  onHeaderControls,
}: AutomationViewProps) {
  const [messages, setMessages] = useState<AutomationMsg[]>([]);
  const [chatMessage, setChatMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<FollowUpSuggestion[]>([]);
  const [toolExecuting, setToolExecuting] = useState<string | null>(null);
  const [approvalRequest, setApprovalRequest] = useState<{
    joint_id: number;
    joint_name: string;
    angle: number;
    joint_desc?: string;
    joint_number?: number;
    total_joints?: number;
    content?: string;
  } | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showEnvPanel, setShowEnvPanel] = useState(false);
  const [virtualTracker, setVirtualTracker] = useState<VirtualTracker | null>(null);
  const [showTrackerModal, setShowTrackerModal] = useState(false);
  const [trackerDraft, setTrackerDraft] = useState<VirtualTracker>(TRACKER_DEFAULTS);
  const [isRecording, setIsRecording] = useState(false);
  const recordStartIndexRef = useRef<number | null>(null);
  const [hasRecording, setHasRecording] = useState(false);
  const [llmModel, setLlmModel] = useState("gemini-flash");
  const [agentPersona, setAgentPersona] = useState("");
  const [customPersona, setCustomPersona] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastResponseRef = useRef<string>("");

  // Dedup guard
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
      console.error("[AutomationView] Message insert error:", error.code, error.message);
      insertedMsgIds.current.delete(msg.id);
    }
  };

  // ── Robot selector ──
  const [robots, setRobots] = useState<ConnectedRobot[]>([]);
  const [selectedRobotIds, setSelectedRobotIds] = useState<string[]>([]);
  const [robotsLoading, setRobotsLoading] = useState(true);
  const [showNoRobotsPopup, setShowNoRobotsPopup] = useState(false);
  const [showRobotDropdown, setShowRobotDropdown] = useState(false);
  const [labOpen, setLabOpen] = useState(isLabOpen);

  useEffect(() => {
    const id = setInterval(() => setLabOpen(isLabOpen()), 60_000);
    return () => clearInterval(id);
  }, []);

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
        setSelectedRobotIds((prev) => {
          if (prev.length === 0 && list.length > 0) return list.map((r) => r.robot_id);
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

  // ── Voice call state ──
  const [inCall, setInCall] = useState(false);
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

  useEffect(() => { isCallActiveRef.current = isCallActive; }, [isCallActive]);

  // ── Session upsert + load existing messages ──
  useEffect(() => {
    (async () => {
      await supabase.schema("chat").from("sessions").upsert({
        id: sessionId,
        auth_user_id: userId,
        team_id: teamId,
        title: `Automation: ${automation.title}`,
        chat_mode: "automation",
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
      } else {
        const first = userName ? userName.split(" ")[0] : "";
        const greeting = first
          ? `Hola ${first} — ¿comenzamos el pick and place?`
          : "Hola — ¿comenzamos el pick and place?";
        setMessages([{
          id: crypto.randomUUID(),
          text: greeting,
          sender: "ai" as const,
          createdAt: new Date().toISOString(),
        }]);
      }
    })();
  }, [sessionId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ── Audio playback ──
  const playNextChunk = useCallback(async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setIsSpeaking(false);
      if (isCallActiveRef.current) {
        const ws = recognitionRef.current;
        const wsOpen = ws instanceof WebSocket && ws.readyState === WebSocket.OPEN;
        if (wsOpen && mediaRecorderRef.current?.state === "paused") {
          mediaRecorderRef.current.resume();
          setIsListening(true);
        }
      }
      return;
    }
    isPlayingRef.current = true;
    const batchSize = Math.min(5, audioQueueRef.current.length);
    const chunks = audioQueueRef.current.splice(0, batchSize);
    try {
      let totalLength = 0;
      const decoded: Uint8Array[] = [];
      for (const chunk of chunks) {
        const binaryStr = atob(chunk);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        decoded.push(bytes);
        totalLength += bytes.length;
      }
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const d of decoded) { combined.set(d, offset); offset += d.length; }
      if (!audioContextRef.current) audioContextRef.current = new AudioContext();
      const audioBuffer = await audioContextRef.current.decodeAudioData(combined.buffer);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => playNextChunk();
      source.start();
    } catch (err) {
      console.warn("[Voice] chunk decode error:", err);
      playNextChunk();
    }
  }, []);

  // ── Agent hook ──
  const effectivePersona = agentPersona === "custom" ? customPersona.trim() : agentPersona;

  const { sendMessage: agentSend, suggestions: agentSuggestions } = useAgentChat({
    apiUrl: AGENT_API_URL,
    userId,
    sessionId,
    interactionMode: "automation",
    automationId: automation.id,
    robotIds: selectedRobotIds,
    llmModel,
    agentPersona: effectivePersona,
    onAudioChunk: (chunk: string) => {
      if (!isCallActiveRef.current) return;
      if (recognitionRef.current instanceof WebSocket) {
        if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.pause();
        setIsListening(false);
      }
      setIsSpeaking(true);
      audioQueueRef.current.push(chunk);
      if (!isPlayingRef.current) playNextChunk();
    },
    onAudioDone: () => {},
    onEvent: (evt: AgentEvent) => {
      if (evt.type === 'tokens') return;
    },
    onPracticeChunk: (data: any) => {
      if (data?.type === "approval_request") {
        setApprovalRequest(data);
      }
    },
    onResponse: (response) => {
      setIsLoading(false);
      setToolExecuting(null);
      if (!response || lastResponseRef.current === response) return;
      lastResponseRef.current = response;
      const msgId = crypto.randomUUID();
      setMessages(prev => [...prev, {
        id: msgId,
        text: response,
        sender: "ai" as const,
        createdAt: new Date().toISOString(),
      }]);
      insertMessage({ id: msgId, session_id: sessionId, auth_user_id: userId, sender: "ai", content: response });
    },
    onStreamEnd: () => { setIsLoading(false); },
    onError: () => { setIsLoading(false); },
  });

  useEffect(() => {
    if (agentSuggestions.length > 0) {
      setSuggestions(agentSuggestions.map((s: string) => ({ id: crypto.randomUUID(), text: s })));
    }
  }, [agentSuggestions]);

  const answerApproval = async (approved: boolean) => {
    setApprovalRequest(null);
    if (!sessionId) return;
    await fetch(`${AGENT_API_URL}/api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, approved }),
    }).catch(console.error);
  };

  const startRecording = () => {
    recordStartIndexRef.current = messages.length;
    setIsRecording(true);
    setHasRecording(false);
  };

  const stopRecording = () => {
    setIsRecording(false);
    setHasRecording((recordStartIndexRef.current ?? 0) < messages.length);
  };

  const downloadRecording = () => {
    const start = recordStartIndexRef.current ?? 0;
    const slice = messages.slice(start).map(m => ({
      timestamp: m.createdAt,
      role: m.sender,
      content: m.text,
    }));
    const blob = new Blob([JSON.stringify(slice, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `robot-record-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSend = async (pastedContents?: string[]) => {
    const text = chatMessage.trim();
    const hasPasted = pastedContents && pastedContents.length > 0;
    if ((!text && pendingFiles.length === 0 && !hasPasted) || isLoading) return;

    // Build display-ready image attachments (blob URLs valid for this session)
    const imageAttachments: ImageAttachment[] = pendingFiles
      .filter(f => f.type.startsWith("image/"))
      .map(f => ({ name: f.name, mediaType: f.type, dataUrl: URL.createObjectURL(f) }));

    // Build display-ready pasted content items
    const pastedItems: PastedContent[] = (pastedContents || []).map(c => ({
      id: crypto.randomUUID(),
      content: c,
    }));

    const messageId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: messageId,
      text,
      sender: "user" as const,
      createdAt: new Date().toISOString(),
      images: imageAttachments.length > 0 ? imageAttachments : undefined,
      pastedContents: pastedItems.length > 0 ? pastedItems : undefined,
    }]);
    setChatMessage("");
    const filesToSend = pendingFiles;
    setPendingFiles([]);
    setIsLoading(true);
    setSuggestions([]);
    setApprovalRequest(null);
    lastResponseRef.current = "";
    await insertMessage({ id: messageId, session_id: sessionId, auth_user_id: userId, sender: "user", content: text || "imagen", pasted_contents: pastedItems });
    setToolExecuting(null);

    if (filesToSend.length > 0) {
      const images: ChatImage[] = await Promise.all(
        filesToSend.map(file => new Promise<ChatImage>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            resolve({ mediaType: file.type, base64: dataUrl.split(',')[1] });
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        }))
      );
      agentSend(text, { images });
    } else {
      agentSend(text);
    }
  };

  // ── Deepgram ──
  const connectDeepgram = useCallback((dgKey: string, stream: MediaStream) => {
    if (recognitionRef.current instanceof WebSocket && recognitionRef.current.readyState === WebSocket.OPEN) {
      recognitionRef.current.close();
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    const ws = new WebSocket(
      `wss://api.deepgram.com/v1/listen?model=nova-2&language=es&smart_format=true&endpointing=300&interim_results=true&utterance_end_ms=1500`,
      ["token", dgKey],
    );
    ws.onopen = () => {
      setIsListening(true);
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(event.data);
      };
      mediaRecorder.start(250);
      mediaRecorderRef.current = mediaRecorder;
    };
    let interimTranscript = "";
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "UtteranceEnd" && interimTranscript.trim()) {
        const finalText = interimTranscript.trim();
        interimTranscript = "";
        setCallTranscript("");
        setIsListening(false);
        if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.pause();
        const messageId = crypto.randomUUID();
        setMessages(prev => [...prev, { id: messageId, text: finalText, sender: "user" as const, createdAt: new Date().toISOString() }]);
        insertMessage({ id: messageId, session_id: sessionId, auth_user_id: userId, sender: "user", content: finalText });
        setIsLoading(true);
        setSuggestions([]);
        setApprovalRequest(null);
        lastResponseRef.current = "";
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
    ws.onerror = (err) => console.error("[Voice] Deepgram error:", err);
    ws.onclose = () => {
      if (isCallActiveRef.current && streamRef.current?.active) {
        setTimeout(() => {
          if (isCallActiveRef.current && streamRef.current?.active && dgKeyRef.current) {
            connectDeepgram(dgKeyRef.current, streamRef.current);
          }
        }, 500);
      }
    };
    recognitionRef.current = ws;
  }, [sessionId, userId, agentSend]);

  const startCall = useCallback(async () => {
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
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert("Necesitas permitir acceso al micrófono.");
      return;
    }
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
    if (mediaRecorderRef.current) { mediaRecorderRef.current.stop(); mediaRecorderRef.current = null; }
    if (recognitionRef.current instanceof WebSocket) recognitionRef.current.close();
    recognitionRef.current = null;
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  }, []);

  // ── Header controls ──
  useEffect(() => {
    if (!onHeaderControls) return;
    onHeaderControls(
      <>
        <button type="button" className="studio__automationBackBtn" onClick={onBack}>
          <ChevronLeft size={16} />
          <span>{automation.title}</span>
        </button>

        {robotsLoading ? (
          <span className="studio__robotPill studio__robotPill--disconnected">
            <span className="studio__robotDot studio__robotDot--disconnected" />
            Loading...
          </span>
        ) : robots.length === 0 ? (
          <span className="studio__robotPill studio__robotPill--disconnected">
            <span className="studio__robotDot studio__robotDot--disconnected" />
            No robots
            <button type="button" className="studio__robotInfoBtn" onClick={() => setShowNoRobotsPopup(true)} aria-label="Troubleshooting info">
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
                          if (e.target.checked) setSelectedRobotIds(prev => [...prev, r.robot_id]);
                          else setSelectedRobotIds(prev => prev.filter(id => id !== r.robot_id));
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

        <button
          type="button"
          className={`studio__robotPill studio__robotPill--mono ${showEnvPanel ? 'is-active' : ''}`}
          onClick={() => setShowEnvPanel(p => !p)}
        >
          <SlidersHorizontal size={13} />
          Set Env
        </button>

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
  }, [onHeaderControls, onBack, automation.title, robotsLoading, robots, selectedRobotIds, showRobotDropdown, inCall, isCallActive, startCall, stopCall, labOpen, showEnvPanel, setShowEnvPanel]);

  // ── Render ──
  return (
    <div className={`studio__automationView${showEnvPanel ? " is-env-open" : ""}`}>
      {showEnvPanel && (
        <aside className="studio__envPanel">
          {/* ── Equipment Status ── */}
          <div className="studio__envSection">
            <div className="studio__envSectionHeader">
              <span className="studio__envSectionTitle">Equipment Status</span>
              <span className={`studio__envStatusDot ${robots.some(r => r.connected) && labOpen ? "is-online" : "is-offline"}`} />
            </div>
            <div className="studio__envStatusBody">
              <p className="studio__envStatusEmpty">Real-time metrics will appear here.</p>
            </div>
          </div>

          {/* ── Recording ── */}
          <div className="studio__envSection">
            <div className="studio__envSectionHeader">
              <span className="studio__envSectionTitle">Recording</span>
              {isRecording && <span className="studio__envRecBadge">● REC</span>}
            </div>
            <button
              type="button"
              className={`studio__envBtn${isRecording ? " studio__envBtn--danger" : ""}`}
              onClick={isRecording ? stopRecording : startRecording}
            >
              {isRecording ? "■ Stop Recording" : "● Start Recording"}
            </button>
            <button
              type="button"
              className="studio__envBtn"
              disabled={!hasRecording}
              onClick={downloadRecording}
            >
              ↓ Download Recording
            </button>
          </div>

          {/* ── Virtual Tracker ── */}
          <div className="studio__envSection studio__envSection--last">
            {virtualTracker ? (
              <>
                <div className="studio__envSectionHeader">
                  <span className="studio__envSectionTitle">Virtual Tracker</span>
                  <div className="studio__envIconBtns">
                    <button
                      type="button"
                      className="studio__envIconBtn"
                      title="Edit tracker"
                      onClick={() => { setTrackerDraft({ ...virtualTracker }); setShowTrackerModal(true); }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      className="studio__envIconBtn studio__envIconBtn--danger"
                      title="Remove tracker"
                      onClick={() => setVirtualTracker(null)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <div className="studio__envTrackerPreview">
                  {virtualTracker.shape === "box"      && <BoxWireframe size={120} />}
                  {virtualTracker.shape === "cylinder" && <CylinderWireframe size={110} />}
                  {virtualTracker.shape === "sphere"   && <SphereWireframe size={110} />}
                </div>
                <div className="studio__envTrackerMeta">
                  <span className="studio__envTrackerShape">
                    {virtualTracker.shape === "box" ? "Box" : virtualTracker.shape === "cylinder" ? "Cylinder" : "Sphere"}
                  </span>
                  <span className="studio__envTrackerDims">
                    {virtualTracker.shape === "box" &&
                      `${virtualTracker.width} × ${virtualTracker.height} × ${virtualTracker.depth} ${virtualTracker.unit}`}
                    {virtualTracker.shape === "cylinder" &&
                      `r=${virtualTracker.radius}, h=${virtualTracker.height} ${virtualTracker.unit}`}
                    {virtualTracker.shape === "sphere" &&
                      `r=${virtualTracker.radius} ${virtualTracker.unit}`}
                  </span>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="studio__envBtn studio__envBtn--add"
                onClick={() => { setTrackerDraft(TRACKER_DEFAULTS); setShowTrackerModal(true); }}
              >
                + Add Virtual Tracker
              </button>
            )}
          </div>
        </aside>
      )}
      <div className="studio__automationChatArea">
      <div className={`studio__practiceMsgs ${inCall ? "is-in-call" : ""}`}>
        {messages.length === 0 && !isLoading && (
          <div className="studio__practiceChatEmpty">
            <SparklesIcon className="w-8 h-8" style={{ color: "#d1d5db" }} />
            <p>Send a command to control the robot.</p>
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
              <MessageBubble message={msg} />
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

        {isLoading && !toolExecuting && <ThinkingIndicator />}
        <div ref={messagesEndRef} />
      </div>

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
                <span className="studio__practiceCallIndicator">Connecting...</span>
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
            <span className="studio__practiceCallDesc">No robots are currently connected.</span>
            <div className="studio__practiceNoRobotsActions">
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

      <div className="studio__practiceChatInput">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={e => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) setPendingFiles(prev => [...prev, ...files]);
            e.target.value = "";
          }}
        />
        <ChatInput
          value={chatMessage}
          onChange={setChatMessage}
          onSubmit={handleSend}
          placeholder="Send a command to the robot..."
          disabled={isLoading}
          isLoading={isLoading}
          onStop={() => setIsLoading(false)}
          pendingFiles={pendingFiles}
          onAttachClick={() => fileInputRef.current?.click()}
          onRemoveFile={i => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))}
          onImageDrop={files => setPendingFiles(prev => [...prev, ...files])}
          selectedModel={llmModel}
          modelOptions={MODEL_OPTIONS}
          onModelChange={setLlmModel}
          selectedPersona={agentPersona}
          personaOptions={PERSONA_OPTIONS}
          onPersonaChange={setAgentPersona}
          customPersonaValue={customPersona}
          onCustomPersonaChange={setCustomPersona}
        />
        <p className="studio__practiceDisclaimer">
          ORION operates real equipment — verify all movements before execution.
        </p>
      </div>
      </div>

      {/* ── Virtual Tracker modal ── */}
      {showTrackerModal && (
        <div className="studio__trackerOverlay" onClick={() => setShowTrackerModal(false)}>
          <div className="studio__trackerModal" onClick={e => e.stopPropagation()}>
            <div className="studio__trackerModalHeader">
              <span className="studio__trackerModalTitle">Configure Virtual Tracker</span>
              <button type="button" className="studio__trackerModalClose" onClick={() => setShowTrackerModal(false)}>
                <X size={15} />
              </button>
            </div>

            {/* Shape selector */}
            <div className="studio__trackerModalSection">
              <p className="studio__trackerModalLabel">Shape</p>
              <div className="studio__trackerShapeGrid">
                {(["box", "cylinder", "sphere"] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    className={`studio__trackerShapeOption${trackerDraft.shape === s ? " is-selected" : ""}`}
                    onClick={() => setTrackerDraft(d => ({ ...d, shape: s }))}
                  >
                    <div className="studio__trackerShapeIcon">
                      {s === "box"      && <BoxWireframe size={52} />}
                      {s === "cylinder" && <CylinderWireframe size={48} />}
                      {s === "sphere"   && <SphereWireframe size={48} />}
                    </div>
                    <span>{s === "box" ? "Box" : s === "cylinder" ? "Cylinder" : "Sphere"}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Dimensions */}
            <div className="studio__trackerModalSection">
              <div className="studio__trackerModalLabelRow">
                <p className="studio__trackerModalLabel">Dimensions</p>
                <select
                  className="studio__trackerUnitSelect"
                  value={trackerDraft.unit}
                  onChange={e => setTrackerDraft(d => ({ ...d, unit: e.target.value as VirtualTracker["unit"] }))}
                >
                  <option value="mm">mm</option>
                  <option value="cm">cm</option>
                  <option value="m">m</option>
                </select>
              </div>
              <div className="studio__trackerDimGrid">
                {trackerDraft.shape === "box" && (
                  <>
                    <label className="studio__trackerDimLabel">Width</label>
                    <input className="studio__trackerInput" type="number" min="1" value={trackerDraft.width}
                      onChange={e => setTrackerDraft(d => ({ ...d, width: +e.target.value }))} />
                    <label className="studio__trackerDimLabel">Height</label>
                    <input className="studio__trackerInput" type="number" min="1" value={trackerDraft.height}
                      onChange={e => setTrackerDraft(d => ({ ...d, height: +e.target.value }))} />
                    <label className="studio__trackerDimLabel">Depth</label>
                    <input className="studio__trackerInput" type="number" min="1" value={trackerDraft.depth}
                      onChange={e => setTrackerDraft(d => ({ ...d, depth: +e.target.value }))} />
                  </>
                )}
                {trackerDraft.shape === "cylinder" && (
                  <>
                    <label className="studio__trackerDimLabel">Radius</label>
                    <input className="studio__trackerInput" type="number" min="1" value={trackerDraft.radius}
                      onChange={e => setTrackerDraft(d => ({ ...d, radius: +e.target.value }))} />
                    <label className="studio__trackerDimLabel">Height</label>
                    <input className="studio__trackerInput" type="number" min="1" value={trackerDraft.height}
                      onChange={e => setTrackerDraft(d => ({ ...d, height: +e.target.value }))} />
                  </>
                )}
                {trackerDraft.shape === "sphere" && (
                  <>
                    <label className="studio__trackerDimLabel">Radius</label>
                    <input className="studio__trackerInput" type="number" min="1" value={trackerDraft.radius}
                      onChange={e => setTrackerDraft(d => ({ ...d, radius: +e.target.value }))} />
                  </>
                )}
              </div>
            </div>

            <div className="studio__trackerModalFooter">
              <button type="button" className="studio__trackerCancelBtn" onClick={() => setShowTrackerModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="studio__trackerSaveBtn"
                onClick={() => { setVirtualTracker({ ...trackerDraft }); setShowTrackerModal(false); }}
              >
                Save Tracker
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
