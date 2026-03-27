// src/components/TroubleshootView.tsx

import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Loader2, Wrench, CheckCircle, Check, ChevronRight, Send, FileText, Zap, Globe, Unplug } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAgentChat } from "./useAgentChat";
import type { PracticeChunk, NarrationEvent, DiagnosticRecallItem } from "./useAgentChat";
import ToolLifecycleIndicator from "./ToolLifecycleIndicator";
import {
  MessageBubble,
  type Message,
  type ClarificationQuestion,
} from "./ChatComponents";
import type { EquipmentProfile } from "./EquipmentTab";
import { equipmentTypeIcon } from "./EquipmentTab";

const AGENT_API_URL = import.meta.env.VITE_AGENT_API_URL || "https://sentinela-909652673285.us-central1.run.app";

// ── Types ──

interface TroubleshootStep {
  label: string;
  status: "pending" | "active" | "done";
}

interface TroubleshootViewProps {
  equipment: EquipmentProfile;
  userId: string;
  teamId: string;
  onBack: () => void;
}

// ═══════════════════════════════════
// HITL Wizard (Human-in-the-Loop)
// ═══════════════════════════════════

interface HITLWizardProps {
  questions: ClarificationQuestion[];
  currentIndex: number;
  onAnswer: (questionId: string, answer: string) => void;
  onSkip: (questionId: string) => void;
  onComplete: () => void;
}

function HITLWizard({
  questions,
  currentIndex,
  onAnswer,
  onSkip,
  onComplete,
}: HITLWizardProps) {
  const [textAnswer, setTextAnswer] = useState("");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");

  useEffect(() => {
    setSelectedOption(null);
    setOtherText("");
    setTextAnswer("");
  }, [currentIndex]);

  if (questions.length === 0) return null;

  if (currentIndex >= questions.length) {
    return (
      <div className="dash_hitlComplete">
        <div className="dash_hitlCompleteIcon">
          <Check size={24} />
        </div>
        <p>All questions answered</p>
        <button type="button" className="dash_hitlSubmitBtn" onClick={onComplete}>
          Continue <ChevronRight size={16} />
        </button>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const progress = (currentIndex / questions.length) * 100;

  const isOtherOption = (opt: { label: string; value: string }) => {
    const lbl = opt.label.toLowerCase();
    const val = opt.value.toLowerCase();
    return val === "other" || val === "otro" || lbl.includes("otro") || lbl.includes("other");
  };

  const handleOptionSelect = (value: string, option: { label: string; value: string }) => {
    if (isOtherOption(option)) {
      setSelectedOption(value);
    } else {
      setSelectedOption(null);
      setOtherText("");
      onAnswer(currentQ.id, value);
    }
  };

  const handleOtherSubmit = () => {
    if (otherText.trim()) {
      onAnswer(currentQ.id, otherText.trim());
      setSelectedOption(null);
      setOtherText("");
    }
  };

  const handleTextSubmit = () => {
    if (textAnswer.trim()) {
      onAnswer(currentQ.id, textAnswer.trim());
      setTextAnswer("");
    }
  };

  const handleSkip = () => {
    onSkip(currentQ.id);
    setTextAnswer("");
    setSelectedOption(null);
    setOtherText("");
  };

  const hasOtherSelected = selectedOption !== null
    && currentQ.options?.some(o => isOtherOption(o) && o.value === selectedOption);

  return (
    <div className="dash_hitlWizard">
      <div className="dash_hitlCard">
        <div className="dash_hitlHeader">
          <span className="dash_hitlLabel">
            QUESTION {currentIndex + 1} OF {questions.length}
          </span>
        </div>

        <div className="dash_hitlQuestion">{currentQ.question}</div>

        <div className="dash_hitlProgress">
          <span className="dash_hitlProgressLabel">Progress</span>
          <div className="dash_hitlProgressBar">
            <div className="dash_hitlProgressFill" style={{ width: `${progress}%` }} />
          </div>
          <span className="dash_hitlProgressCount">
            {currentIndex + 1}/{questions.length}
          </span>
        </div>

        {currentQ.options && currentQ.options.length > 0 ? (
          <div className="dash_hitlOptions">
            {currentQ.options.map((option, idx) => (
              <button
                key={option.value}
                type="button"
                className={`dash_hitlOption ${idx === 0 && !selectedOption ? "dash_hitlOption--primary" : ""} ${selectedOption === option.value ? "dash_hitlOption--selected" : ""}`}
                onClick={() => handleOptionSelect(option.value, option)}
              >
                {option.label}
              </button>
            ))}

            {hasOtherSelected && (
              <div className="dash_hitlOtherInput">
                <textarea
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  placeholder="Especifica tu respuesta..."
                  className="dash_hitlTextarea"
                  rows={2}
                  autoFocus
                />
                <div className="dash_hitlTextActions">
                  <button type="button" className="dash_hitlContinueBtn" onClick={handleOtherSubmit} disabled={!otherText.trim()}>
                    Continue
                  </button>
                  <button type="button" className="dash_hitlSkipBtn" onClick={handleSkip}>
                    Skip question
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="dash_hitlTextInput">
            <textarea
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              placeholder="Type your answer here..."
              className="dash_hitlTextarea"
              rows={3}
            />
            <div className="dash_hitlTextActions">
              <button type="button" className="dash_hitlContinueBtn" onClick={handleTextSubmit} disabled={!textAnswer.trim()}>
                Continue
              </button>
              <button type="button" className="dash_hitlSkipBtn" onClick={handleSkip}>
                Skip question
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="dash_hitlLegend">Sentinela will continue after your answer</p>
    </div>
  );
}

// ═══════════════════════════════════
// Main TroubleshootView
// ═══════════════════════════════════

export default function TroubleshootView({ equipment, userId, teamId, onBack }: TroubleshootViewProps) {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<Message[]>([]);
  const [problemDesc, setProblemDesc] = useState("");
  const [started, setStarted] = useState(false);
  const [steps, setSteps] = useState<TroubleshootStep[]>([]);
  const [thinking, setThinking] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);

  // ── HITL state ──
  const [hitlQuestions, setHitlQuestions] = useState<ClarificationQuestion[]>([]);
  const [hitlCurrentIndex, setHitlCurrentIndex] = useState(0);
  const [hitlAnswers, setHitlAnswers] = useState<Record<string, string>>({});
  const [showHitlWizard, setShowHitlWizard] = useState(false);

  const msgsEndRef = useRef<HTMLDivElement>(null);
  const insertedMsgIds = useRef<Set<string>>(new Set());
  const practiceChunksRef = useRef<PracticeChunk[]>([]);
  const chunkQueueRef = useRef<PracticeChunk[]>([]);
  const processingChunksRef = useRef(false);
  const lastNarrationsRef = useRef<NarrationEvent[]>([]);

  // ── Insert message helper (dedup) ──
  const insertMessage = useCallback(async (msg: { id: string; session_id: string; sender: string; auth_user_id: string; content: string }) => {
    if (insertedMsgIds.current.has(msg.id)) return;
    insertedMsgIds.current.add(msg.id);
    const { error } = await supabase.schema("chat").from("messages").insert(msg);
    if (error) {
      console.error("[Troubleshoot] insert error:", error);
      insertedMsgIds.current.delete(msg.id);
    }
  }, []);

  // ── Chunk processing (queued with delays to simulate streaming) ──
  const handleChunk = useCallback((chunk: PracticeChunk) => {
    console.log("[Troubleshoot] chunk:", chunk.type, chunk.content?.substring(0, 80));
    practiceChunksRef.current.push(chunk);

    if (chunk.type === "partial" && chunk.content) {
      setStreamBuffer((prev) => prev + chunk.content);
      setThinking(false);
    }

    if (chunk.type === "tool_status" && chunk.tool) {
      if (chunk.status === "executing") {
        const toolLabel = chunk.tool === "search_equipment_manual"
          ? `Searching manual: ${chunk.content || chunk.tool}`
          : chunk.content || `Executing: ${chunk.tool}`;
        setSteps((prev) => [...prev, { label: toolLabel, status: "active" }]);
      }
      if (chunk.status === "completed") {
        setSteps((prev) => {
          const updated = [...prev];
          const lastActive = [...updated].reverse().find((s) => s.status === "active");
          if (lastActive) lastActive.status = "done";
          return [...updated];
        });
      }
    }

    if (chunk.type === "response" && chunk.content) {
      setThinking(false);
      setStreamBuffer("");
      // No insertar mensaje aquí — onResponse lo hace
    }
  }, [insertMessage, sessionId, userId]);

  const processNextChunk = useCallback(() => {
    if (chunkQueueRef.current.length === 0) {
      processingChunksRef.current = false;
      return;
    }
    const chunk = chunkQueueRef.current.shift()!;
    handleChunk(chunk);

    let delay = 100;
    if (chunk.type === "tool_status" && chunk.status === "executing") delay = 400;
    if (chunk.type === "tool_status" && chunk.status === "completed") delay = 200;
    if (chunk.type === "response") delay = 0;

    setTimeout(processNextChunk, delay);
  }, [handleChunk]);

  // ── Agent chat hook ──
  const { sendMessage, confirmAnswers, isStreaming, questions: agentQuestions, narrations, toolExecutions, diagnosticRecalls } = useAgentChat({
    apiUrl: AGENT_API_URL,
    userId,
    sessionId,
    interactionMode: "troubleshoot",
    equipmentId: equipment.id,
    onPracticeChunk: (chunk: PracticeChunk) => {
      chunkQueueRef.current.push(chunk);
      if (!processingChunksRef.current) {
        processingChunksRef.current = true;
        processNextChunk();
      }
    },
    onResponse: (content: string) => {
      setThinking(false);
      setStreamBuffer("");

      const msgId = crypto.randomUUID();
      const aiMsg: Message = { id: msgId, sender: "ai", text: content, createdAt: new Date().toISOString() };
      setMessages((prev) => [...prev, aiMsg]);
      insertMessage({ id: msgId, session_id: sessionId, sender: "ai", auth_user_id: userId, content });

      if (steps.length === 0) {
        const parsed = parseDiagnosticSteps(content);
        if (parsed.length > 0) setSteps(parsed);
      }
    },
    onError: (err: string) => {
      setThinking(false);
      setStreamBuffer("");
      console.error("[Troubleshoot] agent error:", err);
    },
    onStreamEnd: () => {
      setThinking(false);
      setStreamBuffer("");
    },
  });

  // ── Persist narrations so the card doesn't flicker ──
  useEffect(() => {
    if (narrations.length > 0) {
      lastNarrationsRef.current = narrations;
    }
  }, [narrations]);

  // ── Map agent questions to HITL wizard ──
  useEffect(() => {
    if (agentQuestions.length > 0) {
      const mapped: ClarificationQuestion[] = agentQuestions.map((q: any, i: number) => ({
        id: `q${i}`,
        question: typeof q === "string" ? q : (q.question || q.text || ""),
        type: (q.options && q.options.length > 0) ? "choice" as const : "text" as const,
        options: q.options?.map((opt: any) => ({
          label: typeof opt === "string" ? opt : (opt.label || opt.value || opt.id || String(opt)),
          value: typeof opt === "string" ? opt : (opt.value || opt.id || opt.label || String(opt)),
        })),
      }));
      setHitlQuestions(mapped);
      setHitlCurrentIndex(0);
      setHitlAnswers({});
      setShowHitlWizard(true);
      setThinking(false);
      setStreamBuffer("");
    }
  }, [agentQuestions]);

  // ── HITL handlers ──
  const handleHitlAnswer = (questionId: string, answer: string) => {
    setHitlAnswers(prev => ({ ...prev, [questionId]: answer }));
    setHitlCurrentIndex(prev => prev + 1);
  };

  const handleHitlSkip = (questionId: string) => {
    setHitlAnswers(prev => ({ ...prev, [questionId]: "Not answered" }));
    setHitlCurrentIndex(prev => prev + 1);
  };

  const handleHitlComplete = async () => {
    setShowHitlWizard(false);
    setThinking(true);

    const answers = hitlQuestions.map(q => ({
      question: q.question,
      answer: hitlAnswers[q.id] ?? "Not answered",
    }));

    await confirmAnswers(answers);
  };

  // ── Auto-scroll ──
  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamBuffer, narrations, toolExecutions, diagnosticRecalls, showHitlWizard]);

  // ── Start troubleshooting ──
  const handleStart = async () => {
    if (!problemDesc.trim()) return;
    setStarted(true);
    setThinking(true);
    practiceChunksRef.current = [];
    chunkQueueRef.current = [];
    processingChunksRef.current = false;
    lastNarrationsRef.current = [];

    // Create chat session in Supabase BEFORE any messages
    await supabase.schema("chat").from("sessions").insert({
      id: sessionId,
      auth_user_id: userId,
      team_id: teamId,
      title: `Troubleshoot: ${equipment.name}`,
      chat_mode: "troubleshoot",
      status: "active",
      focused_on: "troubleshooting",
    });

    // Create troubleshoot session record
    await supabase.schema("lab").from("troubleshoot_sessions").insert({
      id: crypto.randomUUID(),
      chat_session_id: sessionId,
      equipment_profile_id: equipment.id,
      problem_description: problemDesc.trim(),
      status: "planning",
      team_id: teamId,
    });

    const userMsgId = crypto.randomUUID();
    const userMsg: Message = { id: userMsgId, sender: "user", text: problemDesc, createdAt: new Date().toISOString() };
    setMessages([userMsg]);
    insertMessage({ id: userMsgId, session_id: sessionId, sender: "user", auth_user_id: userId, content: problemDesc.trim() });

    const context = [
      `Equipment: ${equipment.name}`,
      equipment.brand ? `Brand: ${equipment.brand}` : null,
      equipment.model ? `Model: ${equipment.model}` : null,
      equipment.ip_address ? `IP: ${equipment.ip_address}` : null,
      equipment.description ? `Description: ${equipment.description}` : null,
      equipment.manuals.length > 0 ? `Manuals: ${equipment.manuals.map((m) => `${m.title} (${m.pages_total} pages)`).join(", ")}` : null,
    ].filter(Boolean).join("\n");

    const fullMessage = `[Equipment Context]\n${context}\n\n[Problem]\n${problemDesc}`;

    sendMessage(fullMessage);
  };

  // ── Follow-up message ──
  const [followUp, setFollowUp] = useState("");
  const handleFollowUp = () => {
    if (!followUp.trim() || isStreaming) return;
    setThinking(true);
    practiceChunksRef.current = [];
    chunkQueueRef.current = [];
    processingChunksRef.current = false;
    lastNarrationsRef.current = [];

    const msgId = crypto.randomUUID();
    const userMsg: Message = { id: msgId, sender: "user", text: followUp, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    insertMessage({ id: msgId, session_id: sessionId, sender: "user", auth_user_id: userId, content: followUp });

    sendMessage(followUp);
    setFollowUp("");
  };

  // ── Sidebar (shared between both views) ──
  const sidebar = (
    <div className="studio__troubleshootSidebar">
      <div className="studio__practiceSidebarNav">
        <button type="button" className="studio__practiceBack" onClick={onBack}>
          <ArrowLeft size={14} /> Back to Equipment
        </button>
      </div>

      {/* Equipment info */}
      <div className="studio__troubleshootEquipInfo">
        <div className="studio__troubleshootEquipIcon">
          {equipmentTypeIcon(equipment.type, 24)}
        </div>
        <div className="studio__troubleshootEquipMeta">
          <span className="studio__troubleshootEquipName">{equipment.name}</span>
          <span className="studio__troubleshootEquipType">
            {[equipment.brand, equipment.model].filter(Boolean).join(" ") || equipment.type}
          </span>
        </div>
      </div>

      {/* Diagnostic steps (active session only) */}
      {started && steps.length > 0 && (
        <div className="studio__troubleshootSteps">
          <div className="studio__troubleshootStepsTitle">Diagnostic Plan</div>
          {steps.map((step, i) => (
            <div
              key={i}
              className={`studio__troubleshootStep studio__troubleshootStep--${step.status}`}
            >
              <div className="studio__troubleshootStepDot">
                {step.status === "done" ? (
                  <CheckCircle size={16} />
                ) : (
                  <span className="studio__troubleshootStepNum">{i + 1}</span>
                )}
              </div>
              <span className="studio__troubleshootStepLabel">{step.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Manuals section */}
      {equipment.manuals.length > 0 && (
        <div className="ts__sidebarSection">
          <div className="ts__sidebarSectionTitle">Manuals</div>
          {equipment.manuals.map((m) => (
            <div key={m.id} className="ts__sidebarItem">
              <FileText size={13} />
              <span>{m.title} ({m.pages_total}p)</span>
            </div>
          ))}
        </div>
      )}

      {/* Tools section */}
      <div className="ts__sidebarSection">
        <div className="ts__sidebarSectionTitle">Tools</div>
        <div className="ts__sidebarItem"><Zap size={13} /> RAG Manual Search</div>
        <div className="ts__sidebarItem"><Globe size={13} /> Web Search</div>
        <div className="ts__sidebarItem"><Wrench size={13} /> Ping Device</div>
      </div>

      {/* Web search toggle */}
      <div className="ts__sidebarToggle">
        <span className="ts__sidebarToggleLabel">Web Search</span>
        <button
          type="button"
          className={`ts__toggleSwitch ${webSearchEnabled ? "is-active" : ""}`}
          onClick={() => setWebSearchEnabled(!webSearchEnabled)}
          aria-label="Toggle web search"
        />
      </div>
    </div>
  );

  // ── Not started: problem description form ──
  if (!started) {
    return (
      <div className="studio__troubleshootView">
        {sidebar}
        <div className="studio__troubleshootMain">
          <div className="studio__troubleshootStartCard">
            <div className="ts__disconnectedIcon">
              <Unplug size={48} strokeWidth={1.5} />
            </div>
            <h2 className="studio__troubleshootStartTitle">
              Describe the problem with {equipment.name}
            </h2>
            <p className="studio__troubleshootStartDesc">
              The AI agent will diagnose the issue step by step
              {equipment.manuals.length > 0 ? `, using manuals: ${equipment.manuals.map((m) => m.title).join(", ")}.` : "."}
            </p>
            <div className="studio__troubleshootInputBox" style={{ width: "100%", maxWidth: "560px" }}>
              <textarea
                className="studio__troubleshootInput"
                placeholder="e.g. The robot arm is not responding to movement commands after power cycle..."
                value={problemDesc}
                onChange={(e) => setProblemDesc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleStart();
                  }
                }}
                rows={4}
                style={{ minHeight: "100px" }}
                autoFocus
              />
              <button
                type="button"
                className="studio__troubleshootSendBtn"
                onClick={handleStart}
                disabled={!problemDesc.trim()}
              >
                <Wrench size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Active troubleshooting session ──
  return (
    <div className="studio__troubleshootView">
      {sidebar}

      {/* Chat area */}
      <div className="studio__troubleshootChat">
        <div className="studio__troubleshootMsgs">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* Agent thinking card — narrations + tool lifecycle during streaming */}
          {(() => {
            const activeNarrations = narrations.length > 0 ? narrations : lastNarrationsRef.current;
            if (!isStreaming || (activeNarrations.length === 0 && toolExecutions.size === 0)) return null;
            return (
              <div
                className="my-2 w-full rounded-md border border-[var(--border-color,#333)] bg-[var(--bg-surface,#f7f7f8)] px-4 py-3 shadow-sm"
                style={{ animation: "fadeIn 0.3s ease-out" }}
              >
                <div className="flex items-start gap-3">
                  <Loader2 size={16} className="shrink-0 mt-0.5 animate-spin text-[var(--text-secondary,#888)]" />
                  <div className="min-w-0 flex-1">
                    {/* Narrations */}
                    {activeNarrations.length > 0 && (
                      <div className="space-y-1">
                        {activeNarrations.map((n: NarrationEvent, i: number) => (
                          <p
                            key={i}
                            className="text-sm text-[var(--text-primary,#333)] leading-relaxed"
                          >
                            {n.content}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Tool executions */}
                    {toolExecutions.size > 0 && (
                      <div className={activeNarrations.length > 0 ? "mt-2 pt-2 border-t border-[var(--border-color,#e5e5e5)]" : ""}>
                        <ToolLifecycleIndicator executions={toolExecutions} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Collapsed reasoning after response */}
          {!isStreaming && (narrations.length > 0 || toolExecutions.size > 0) && messages.some(m => m.sender === "ai") && (
            <details className="ml-10 mb-2">
              <summary className="text-xs text-[var(--text-secondary,#999)] opacity-50 cursor-pointer hover:opacity-80">
                Razonamiento ({narrations.length} pasos{toolExecutions.size > 0 ? `, ${toolExecutions.size} tools` : ""})
              </summary>
              <div className="space-y-1 mt-1 pl-2 border-l border-[var(--border-color,#444)]">
                {narrations.map((n: NarrationEvent, i: number) => (
                  <p key={i} className="text-xs text-[var(--text-secondary,#999)] opacity-50">{n.content}</p>
                ))}
                {toolExecutions.size > 0 && (
                  <ToolLifecycleIndicator executions={toolExecutions} />
                )}
              </div>
            </details>
          )}

          {/* Diagnostic recall hint */}
          {diagnosticRecalls.length > 0 && (
            <details className="ml-10 mb-2">
              <summary className="text-xs text-blue-400/80 cursor-pointer hover:text-blue-300 flex items-center gap-1.5">
                <span className="text-[11px]">{'\u{1f4cb}'}</span>
                {diagnosticRecalls.length} similar past diagnostic{diagnosticRecalls.length !== 1 ? "s" : ""} found
              </summary>
              <div className="mt-1.5 space-y-1.5 pl-2 border-l-2 border-blue-400/30">
                {diagnosticRecalls.map((r: DiagnosticRecallItem, i: number) => (
                  <div key={i} className="text-xs rounded px-2 py-1.5 bg-blue-500/10">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-blue-300/90 font-medium truncate">{r.query}</span>
                      <span className="text-[10px] text-[var(--text-secondary,#999)] shrink-0">
                        {new Date(r.date).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-[var(--text-secondary,#999)] leading-snug">{r.summary}</p>
                    {r.similarity != null && (
                      <span className="text-[10px] text-blue-400/60 mt-0.5 inline-block">
                        {Math.round(r.similarity * 100)}% similar
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Streaming buffer */}
          {streamBuffer && (
            <MessageBubble
              message={{ id: "stream", sender: "ai", text: streamBuffer, createdAt: new Date().toISOString() }}
            />
          )}

          {/* Thinking indicator — only when no narration card is showing */}
          {thinking && !streamBuffer && narrations.length === 0 && !showHitlWizard && (
            <div className="studio__troubleshootThinking">
              <Loader2 size={16} className="studio__practiceLoadingSpinner" />
              <span>Diagnosing...</span>
            </div>
          )}

          {/* HITL Question Wizard */}
          {showHitlWizard && <HITLWizard
            questions={hitlQuestions}
            currentIndex={hitlCurrentIndex}
            onAnswer={handleHitlAnswer}
            onSkip={handleHitlSkip}
            onComplete={handleHitlComplete}
          />}

          <div ref={msgsEndRef} />
        </div>

        {/* Follow-up input */}
        <div className="studio__troubleshootInputArea">
          <div className="studio__troubleshootInputBox">
            <textarea
              className="studio__troubleshootInput"
              placeholder="Add more details or ask a follow-up question..."
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleFollowUp();
                }
              }}
              rows={1}
              disabled={isStreaming}
            />
            <button
              type="button"
              className="studio__troubleshootSendBtn"
              onClick={handleFollowUp}
              disabled={!followUp.trim() || isStreaming}
            >
              <Send size={14} />
            </button>
          </div>
          <p className="studio__practiceDisclaimer">
            AI diagnostics are for guidance only — always verify with official documentation.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Parse diagnostic steps from AI response ──
function parseDiagnosticSteps(content: string): TroubleshootStep[] {
  const steps: TroubleshootStep[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const match = line.match(/^\s*\d+[\.\)]\s+(.+)/);
    if (match && match[1].length > 5 && match[1].length < 120) {
      steps.push({ label: match[1].trim(), status: "pending" });
    }
  }

  if (steps.length > 0) {
    steps[0].status = "active";
  }

  return steps.length >= 2 ? steps : [];
}
