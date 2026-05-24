import { useState, useEffect, useRef, useCallback } from "react";
import { Check, Loader2, ChevronLeft, ChevronDown, Info, Phone, PhoneOff, Mic, AudioLines } from "lucide-react";
import { SparklesIcon } from "@heroicons/react/24/outline";
import { supabase } from "../lib/supabaseClient";
import { useAgentChat } from "./useAgentChat";
import type { AgentEvent, ChatImage } from "./useAgentChat";
import {
  MessageBubble,
  ChatInput,
  FollowUpSuggestions,
  type Message,
  type FollowUpSuggestion,
} from "./ChatComponents";
import type { Automation } from "./StudioHelpers";

const AGENT_API_URL = import.meta.env.VITE_AGENT_API_URL || 'https://sentinela-909652673285.us-central1.run.app';

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
  onBack: () => void;
  onHeaderControls?: (controls: React.ReactNode) => void;
}

export default function AutomationView({
  automation,
  sessionId,
  userId,
  teamId,
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
  const [llmModel, setLlmModel] = useState("gemini-flash");
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
  const { sendMessage: agentSend, suggestions: agentSuggestions } = useAgentChat({
    apiUrl: AGENT_API_URL,
    userId,
    sessionId,
    interactionMode: "automation",
    automationId: automation.id,
    robotIds: selectedRobotIds,
    llmModel,
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

  const handleSend = async () => {
    const text = chatMessage.trim();
    if (!text && pendingFiles.length === 0 || isLoading) return;
    const messageId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: messageId, text: text || "📎 imagen", sender: "user", createdAt: new Date().toISOString() }]);
    setChatMessage("");
    const filesToSend = pendingFiles;
    setPendingFiles([]);
    setIsLoading(true);
    setSuggestions([]);
    setApprovalRequest(null);
    lastResponseRef.current = "";
    await insertMessage({ id: messageId, session_id: sessionId, auth_user_id: userId, sender: "user", content: text || "imagen", pasted_contents: [] });
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
          className={`studio__robotPill studio__robotPill--mono ${inCall ? 'is-active' : ''}`}
          onClick={isCallActive ? stopCall : startCall}
        >
          {inCall ? <PhoneOff size={13} /> : <Phone size={13} />}
          {inCall ? 'Stop Call' : 'Take Call'}
        </button>
      </>
    );
    return () => onHeaderControls?.(null);
  }, [onHeaderControls, onBack, automation.title, robotsLoading, robots, selectedRobotIds, showRobotDropdown, inCall, isCallActive, startCall, stopCall, labOpen]);

  // ── Render ──
  return (
    <div className="studio__automationView">
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
        <div className="studio__llmBar">
          <span className="studio__llmBarLabel">Model</span>
          <select
            className="studio__llmSelect"
            value={llmModel}
            onChange={e => setLlmModel(e.target.value)}
          >
            <optgroup label="Google">
              <option value="gemini-flash">Gemini 2.0 Flash</option>
            </optgroup>
            <optgroup label="OpenAI">
              <option value="gpt-4o-mini">GPT-4o mini</option>
              <option value="gpt-4o">GPT-4o</option>
            </optgroup>
            <optgroup label="Anthropic">
              <option value="claude-haiku">Claude Haiku</option>
              <option value="claude-sonnet">Claude Sonnet</option>
              <option value="claude-opus">Claude Opus</option>
            </optgroup>
          </select>
        </div>
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
        />
        <p className="studio__practiceDisclaimer">
          ORION operates real equipment — verify all movements before execution.
        </p>
      </div>
    </div>
  );
}
