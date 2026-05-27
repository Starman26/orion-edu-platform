// src/components/ChatComponents.tsx
// Shared chat components extracted from Dashboard.tsx for reuse in Analysis page.

import { useState, useEffect, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  ArrowUp,
  Plus,
  X,
  Square,
  ChevronRight,
  Copy,
  Search,
  BrainCircuit,
  Database,
  FileText,
  Settings,
  MessageSquare,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

export interface PastedContent {
  id: string;
  content: string;
}

export interface ImageAttachment {
  name: string;
  mediaType: string;
  dataUrl: string;
}

export interface FileAttachmentMeta {
  name: string;
  type: string;
  sizeKB: number;
}

export interface Message {
  id: string;
  text: string;
  sender: "user" | "ai";
  createdAt: string;
  pastedContents?: PastedContent[];
  images?: ImageAttachment[];
  attachments?: FileAttachmentMeta[];
}

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  messages: Message[];
}

interface QuestionOption {
  label: string;
  value: string;
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  options?: QuestionOption[];
  type: "choice" | "text";
}

export interface TimelineEvent {
  id: string;
  node: string;
  message: string;
  timestamp: string;
  isActive?: boolean;
}

export interface EventRun {
  id: string;
  userMessageId: string;
  events: TimelineEvent[];
  status: "streaming" | "done";
  isExpanded: boolean;
}

export interface FollowUpSuggestion {
  id: string;
  text: string;
}

// ============================================================================
// HELPERS
// ============================================================================

export function highlightCode(code: string, language: string): string {
  let html = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const jsKeywords = /\b(const|let|var|function|return|if|else|for|while|class|export|import|from|default|async|await|new|this|try|catch|throw|typeof|instanceof)\b/g;
  const typeKeywords = /\b(string|number|boolean|void|any|null|undefined|true|false)\b/g;

  html = html.replace(/(\/\/.*$)/gm, '<span class="code-comment">$1</span>');
  html = html.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="code-comment">$1</span>');
  html = html.replace(/("(?:[^"\\]|\\.)*")/g, '<span class="code-string">$1</span>');
  html = html.replace(/('(?:[^'\\]|\\.)*')/g, '<span class="code-string">$1</span>');
  html = html.replace(/(`(?:[^`\\]|\\.)*`)/g, '<span class="code-string">$1</span>');
  html = html.replace(/\b(\d+\.?\d*)\b/g, '<span class="code-number">$1</span>');
  html = html.replace(jsKeywords, '<span class="code-keyword">$1</span>');

  if (language === 'typescript' || language === 'ts') {
    html = html.replace(typeKeywords, '<span class="code-type">$1</span>');
    html = html.replace(/:\s*([A-Z]\w*)/g, ': <span class="code-type">$1</span>');
  }

  html = html.replace(/\b([a-zA-Z_]\w*)\s*\(/g, '<span class="code-function">$1</span>(');

  return html;
}

// ============================================================================
// INLINE EVENT RUN HOOKS
// ============================================================================

const SETUP_COUNT = 3;

export function stepIcon(index: number, node: string, size: number) {
  if (index < SETUP_COUNT) return <Database size={size} />;
  const n = node.toLowerCase();
  if (n.includes("search") || n.includes("research") || n.includes("query")) return <Search size={size} />;
  if (n.includes("analy") || n.includes("think") || n.includes("reason")) return <BrainCircuit size={size} />;
  if (n.includes("data") || n.includes("fetch") || n.includes("retriev")) return <Database size={size} />;
  if (n.includes("report") || n.includes("write") || n.includes("summar") || n.includes("doc")) return <FileText size={size} />;
  if (n.includes("config") || n.includes("tool") || n.includes("setup")) return <Settings size={size} />;
  return <BrainCircuit size={size} />;
}

const LOADING_PHRASES = [
  "Preparing for launch...",
  "Working on it!",
  "Fixing myself...",
  "Pip pip!",
  "Beep boop...",
  "Almost there...",
  "Warming up circuits...",
  "Crunching data...",
  "One moment...",
  "Connecting the dots...",
  "Consulting the oracle...",
  "Thinking hard...",
  "Feeding the hamsters...",
  "Reticulating splines...",
  "Calibrating sensors...",
  "Loading awesomeness...",
  "Brewing some magic...",
  "Hold tight...",
  "On my way!",
  "Assembling the answer...",
];

export function useRotatingPhrase(active: boolean) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * LOADING_PHRASES.length));

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setIndex(prev => {
        let next: number;
        do { next = Math.floor(Math.random() * LOADING_PHRASES.length); } while (next === prev);
        return next;
      });
    }, 2500);
    return () => clearInterval(interval);
  }, [active]);

  return LOADING_PHRASES[index];
}

export function useTypewriterLog(text: string, speed = 35) {
  const [displayed, setDisplayed] = useState("");
  const targetRef = useRef(text);

  useEffect(() => {
    targetRef.current = text;
    setDisplayed("");
    let i = 0;
    const timer = setInterval(() => {
      i++;
      if (i >= text.length) {
        setDisplayed(text);
        clearInterval(timer);
      } else {
        setDisplayed(text.slice(0, i));
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);

  return { displayed, isTyping: displayed.length < text.length };
}

// ============================================================================
// INLINE EVENT RUN
// ============================================================================

interface InlineEventRunProps {
  run: EventRun;
  onToggleExpand: (runId: string) => void;
}

function getEventIcon(message: string): JSX.Element {
  const msg = message.toLowerCase();

  if (msg.includes("base de datos") || msg.includes("database") || msg.includes("conecta") || msg.includes("connect")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5V19A9 3 0 0 0 21 19V5" />
        <path d="M3 12A9 3 0 0 0 21 12" />
      </svg>
    );
  }

  if (msg.includes("embedding") || msg.includes("vector") || msg.includes("rag")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
        <path d="M2 12h20" />
      </svg>
    );
  }

  if (msg.includes("estado") || msg.includes("inicializ") || msg.includes("state") || msg.includes("init") || msg.includes("ready")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    );
  }

  if (msg.includes("plan") || msg.includes("routing") || msg.includes("execution")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    );
  }

  if (msg.includes("detect") || msg.includes("classif") || msg.includes("analyz") || msg.includes("anali")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    );
  }

  if (msg.includes("process") || msg.includes("request") || msg.includes("working")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }

  if (msg.includes("reply") || msg.includes("respuesta") || msg.includes("quick") || msg.includes("chat") || msg.includes("conversation")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    );
  }

  if (msg.includes("evaluat") || msg.includes("eval:") || msg.includes("confidence") || msg.includes("scoring")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    );
  }

  if (msg.includes("worker") || msg.includes("output") || msg.includes("result")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
        <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
        <line x1="6" y1="6" x2="6.01" y2="6" />
        <line x1="6" y1="18" x2="6.01" y2="18" />
      </svg>
    );
  }

  if (msg.includes("combin") || msg.includes("synthe") || msg.includes("merge") || msg.includes("response synthesized")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 3 21 3 21 8" />
        <line x1="4" y1="20" x2="21" y2="3" />
        <polyline points="21 16 21 21 16 21" />
        <line x1="15" y1="15" x2="21" y2="21" />
        <line x1="4" y1="4" x2="9" y2="9" />
      </svg>
    );
  }

  if (msg.includes("llm") || msg.includes("model") || msg.includes("bypass") || msg.includes("lightweight")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      </svg>
    );
  }

  if (msg.includes("completed") || msg.includes("done") || msg.includes("finished") || msg.includes("complete")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }

  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

export function InlineEventRun({ run, onToggleExpand }: InlineEventRunProps) {
  const latestEvent = run.events[run.events.length - 1];
  const isStreaming = run.status === "streaming";
  const isDone = run.status === "done";

  if (run.events.length === 0 && !isStreaming) return null;

  return (
    <div className="dash_eventCard">
      {/* Header row — always visible */}
      <button
        type="button"
        className="dash_eventCardHeader"
        onClick={() => onToggleExpand(run.id)}
      >
        <span className="dash_eventCardIcon">
          {isStreaming ? (
            <span className="dash_logPulse" />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </span>
        <span className="dash_eventCardText">
          {isDone ? "Done" : (latestEvent?.message || "Processing...")}
          {isStreaming && <span className="dash_logCursor">|</span>}
        </span>
        <span className={`dash_eventCardChevron ${run.isExpanded ? 'dash_eventCardChevron--open' : ''}`}>
          <ChevronRight size={14} />
        </span>
      </button>

      {/* Expanded event list */}
      {run.isExpanded && run.events.length > 0 && (
        <div className="dash_eventCardBody">
          {run.events.map((evt, idx) => (
            <div
              key={evt.id}
              className="dash_eventCardItem"
              style={{ animationDelay: `${idx * 0.03}s` }}
            >
              <span className="dash_eventCardItemIcon">
                {getEventIcon(evt.message)}
              </span>
              <span className="dash_eventCardItemText">{evt.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// FOLLOW-UP SUGGESTIONS
// ============================================================================

interface SuggestionsProps {
  suggestions: FollowUpSuggestion[];
  onSelect: (suggestion: string) => void;
}

export function FollowUpSuggestions({ suggestions, onSelect }: SuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="dash_suggestions">
      <div className="dash_suggestionsList">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            type="button"
            className="dash_suggestionBtn"
            onClick={() => onSelect(suggestion.text)}
          >
            <MessageSquare size={15} className="dash_suggestionIcon" />
            <span>{suggestion.text}</span>
            <ChevronRight size={15} className="dash_suggestionArrow" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// CHAT INPUT
// ============================================================================

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (pastedContents?: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
  onStop?: () => void;
  pendingFiles?: File[];
  onAttachClick?: () => void;
  onRemoveFile?: (index: number) => void;
  onImageDrop?: (files: File[]) => void;
  equipmentList?: { id: string; name: string }[];
  onFocus?: () => void;
  onBlur?: () => void;
  onPastedCountChange?: (count: number) => void;
  selectedModel?: string;
  modelOptions?: { value: string; label: string }[];
  onModelChange?: (value: string) => void;
  selectedPersona?: string;
  personaOptions?: { value: string; label: string }[];
  onPersonaChange?: (value: string) => void;
  customPersonaValue?: string;
  onCustomPersonaChange?: (value: string) => void;
}

const SLASH_COMMANDS = [
  { id: "ping", command: "/ping", description: "Ping a device" },
  { id: "status", command: "/status", description: "Check equipment status" },
  { id: "diagnose", command: "/diagnose", description: "Run fault diagnosis" },
  { id: "connect", command: "/connect", description: "Connect to equipment" },
  { id: "restart", command: "/restart", description: "Restart a device" },
  { id: "logs", command: "/logs", description: "View recent logs" },
  { id: "config", command: "/config", description: "View/edit configuration" },
  { id: "maintenance", command: "/maintenance", description: "Schedule maintenance" },
  { id: "report", command: "/report", description: "Generate a report" },
];

export function ChatInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Try something...",
  disabled = false,
  isLoading = false,
  onStop,
  pendingFiles = [],
  onAttachClick,
  onRemoveFile,
  onImageDrop,
  equipmentList,
  onFocus,
  onBlur,
  onPastedCountChange,
  selectedModel,
  modelOptions,
  onModelChange,
  selectedPersona,
  personaOptions,
  onPersonaChange,
  customPersonaValue = "",
  onCustomPersonaChange,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [pastedContents, setPastedContents] = useState<string[]>([]);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const [personaDropdownOpen, setPersonaDropdownOpen] = useState(false);
  const personaDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modelDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [modelDropdownOpen]);

  useEffect(() => {
    if (!personaDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (personaDropdownRef.current && !personaDropdownRef.current.contains(e.target as Node)) {
        setPersonaDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [personaDropdownOpen]);
  const [showPastedModal, setShowPastedModal] = useState<number | null>(null);
  const PASTE_THRESHOLD = 100;

  useEffect(() => {
    onPastedCountChange?.(pastedContents.length);
  }, [pastedContents.length, onPastedCountChange]);

  // @ mention state
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);

  const filteredEquipment = (equipmentList || []).filter(eq =>
    eq.name.toLowerCase().includes(mentionFilter.toLowerCase())
  );

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionFilter]);

  // / slash command state
  const [showSlash, setShowSlash] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);

  const filteredCommands = SLASH_COMMANDS.filter(cmd =>
    cmd.command.toLowerCase().includes(("/" + slashFilter).toLowerCase()) ||
    cmd.description.toLowerCase().includes(slashFilter.toLowerCase())
  );

  useEffect(() => {
    setSlashIndex(0);
  }, [slashFilter]);

  const handleChange = (newValue: string) => {
    onChange(newValue);

    const textarea = textareaRef.current;
    if (!textarea) return;

    // Use setTimeout so selectionStart reflects the new value
    setTimeout(() => {
      const cursorPos = textarea.selectionStart;
      const textBeforeCursor = newValue.slice(0, cursorPos);
      const atMatch = textBeforeCursor.match(/@(\w*)$/);

      if (atMatch) {
        setShowMentions(true);
        setMentionFilter(atMatch[1]);
        setShowSlash(false);
      } else {
        setShowMentions(false);
        setMentionFilter("");
      }

      // Detect / slash command (only at start of input or after newline)
      const slashMatch = textBeforeCursor.match(/^\/(\w*)$/) || textBeforeCursor.match(/\n\/(\w*)$/);
      if (slashMatch && !atMatch) {
        setShowSlash(true);
        setSlashFilter(slashMatch[1]);
        setShowMentions(false);
      } else if (!atMatch) {
        setShowSlash(false);
        setSlashFilter("");
      }
    }, 0);
  };

  const insertSlashCommand = (command: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);

    const slashIdx = textBeforeCursor.lastIndexOf("/");
    if (slashIdx === -1) return;

    const newValue = textBeforeCursor.slice(0, slashIdx) + command + " " + textAfterCursor;
    onChange(newValue);
    setShowSlash(false);
    setSlashFilter("");

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = slashIdx + command.length + 1;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const insertMention = (equipmentName: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);

    const atIdx = textBeforeCursor.lastIndexOf("@");
    if (atIdx === -1) return;

    const newValue = textBeforeCursor.slice(0, atIdx) + "@" + equipmentName + " " + textAfterCursor;
    onChange(newValue);
    setShowMentions(false);
    setMentionFilter("");

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = atIdx + equipmentName.length + 2;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions && filteredEquipment.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % filteredEquipment.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + filteredEquipment.length) % filteredEquipment.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filteredEquipment[mentionIndex].name);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentions(false);
        return;
      }
    }

    // Slash command navigation
    if (showSlash && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex(prev => (prev + 1) % filteredCommands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertSlashCommand(filteredCommands[slashIndex].command);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowSlash(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey && !showMentions && !showSlash && (value.trim() || pastedContents.length > 0 || pendingFiles.length > 0)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const imageFiles = Array.from(e.clipboardData.items)
      .filter(item => item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((f): f is File => f !== null);

    if (imageFiles.length > 0) {
      e.preventDefault();
      onImageDrop?.(imageFiles);
      return;
    }

    const pastedText = e.clipboardData.getData('text');
    if (pastedText.length > PASTE_THRESHOLD) {
      e.preventDefault();
      setPastedContents(prev => [...prev, pastedText]);
    }
  };

  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const imageFiles = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith('image/')
    );
    if (imageFiles.length > 0) onImageDrop?.(imageFiles);
  };

  const removePasted = (index: number) => {
    setPastedContents(prev => prev.filter((_, i) => i !== index));
  };

  const updatePasted = (index: number, newContent: string) => {
    setPastedContents(prev => prev.map((c, i) => i === index ? newContent : c));
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const newHeight = Math.min(el.scrollHeight, 120);
    el.style.height = `${newHeight}px`;
  }, [value]);

  const handleSubmit = () => {
    if (!value.trim() && pastedContents.length === 0 && pendingFiles.length === 0) return;
    onSubmit(pastedContents.length > 0 ? pastedContents : undefined);
    setPastedContents([]);
  };

  return (
    <div
      className={`dash_chatInputWrapper${isDragging ? " dash_chatInputWrapper--dragging" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {showPastedModal !== null && pastedContents[showPastedModal] && (
        <div className="dash_pastedModalOverlay" onClick={() => setShowPastedModal(null)}>
          <div className="dash_pastedModal" onClick={(e) => e.stopPropagation()}>
            <div className="dash_pastedModalHeader">
              <span>Pasted content {showPastedModal + 1}</span>
              <button
                type="button"
                className="dash_pastedModalClose"
                onClick={() => setShowPastedModal(null)}
              >
                <X size={16} />
              </button>
            </div>
            <textarea
              className="dash_pastedModalContent dash_pastedModalEditable"
              value={pastedContents[showPastedModal]}
              onChange={(e) => updatePasted(showPastedModal, e.target.value)}
              spellCheck={false}
            />
          </div>
        </div>
      )}

      <div className="dash_chatInputBox">
        {/* @ Mention dropdown */}
        {showMentions && filteredEquipment.length > 0 && (
          <div className="dash_mentionDropdown">
            {filteredEquipment.map((eq, idx) => (
              <button
                key={eq.id}
                type="button"
                className={`dash_mentionItem ${idx === mentionIndex ? 'dash_mentionItem--active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(eq.name);
                }}
                onMouseEnter={() => setMentionIndex(idx)}
              >
                {eq.name}
              </button>
            ))}
          </div>
        )}

        {/* / Slash commands dropdown */}
        {showSlash && filteredCommands.length > 0 && (
          <div className="dash_slashDropdown">
            {filteredCommands.map((cmd, idx) => (
              <button
                key={cmd.id}
                type="button"
                className={`dash_slashItem ${idx === slashIndex ? 'dash_slashItem--active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertSlashCommand(cmd.command);
                }}
                onMouseEnter={() => setSlashIndex(idx)}
              >
                <span className="dash_slashCmd">{cmd.command}</span>
                <span className="dash_slashDesc">{cmd.description}</span>
              </button>
            ))}
          </div>
        )}

        {/* Attachments row — inside the input box, above textarea */}
        {(pendingFiles.length > 0 || pastedContents.length > 0) && (
          <div className="dash_inputAttachments">
            {/* Image previews — small thumbnails */}
            {pendingFiles.filter(f => f.type.startsWith('image/')).map((file, i) => (
              <div key={`img-${i}`} className="dash_inputThumb">
                <img src={URL.createObjectURL(file)} alt={file.name} className="dash_inputThumbImg" />
                <button
                  type="button"
                  className="dash_inputThumbRemove"
                  onClick={() => onRemoveFile?.(pendingFiles.indexOf(file))}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            {/* Non-image file chips */}
            {pendingFiles.filter(f => !f.type.startsWith('image/')).map((file, i) => (
              <div key={`file-${i}`} className="dash_inputFileChip">
                <span>{file.name.length > 20 ? file.name.slice(0, 17) + '...' : file.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveFile?.(pendingFiles.indexOf(file))}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            {/* Pasted content chips */}
            {pastedContents.map((_, i) => (
              <div
                key={`paste-${i}`}
                className="dash_inputPasteChip"
                onClick={() => setShowPastedModal(i)}
                style={{ cursor: 'pointer' }}
              >
                <span>PASTED</span>
                <span className="dash_inputPasteCount">{i + 1}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removePasted(i); }}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="dash_chatInputRow">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => onFocus?.()}
            onBlur={() => onBlur?.()}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="dash_chatTextarea"
          />

          <div className="dash_chatBottomBar">
            <button
              type="button"
              onClick={onAttachClick}
              disabled={disabled}
              className="dash_chatFooterBtn"
              aria-label="Attach files"
            >
              <Plus size={14} />
            </button>

            {selectedModel && modelOptions && onModelChange && (
              <div className="dash_chatModelWrap" ref={modelDropdownRef}>
                <button
                  type="button"
                  className={`dash_chatModelChip ${modelDropdownOpen ? 'dash_chatModelChip--open' : ''}`}
                  onClick={() => setModelDropdownOpen(p => !p)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2"/>
                    <line x1="8" y1="21" x2="16" y2="21"/>
                    <line x1="12" y1="17" x2="12" y2="21"/>
                  </svg>
                  <span>{modelOptions.find(o => o.value === selectedModel)?.label ?? selectedModel}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="dash_chatModelChevron">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>

                {modelDropdownOpen && (
                  <div className="dash_chatModelDropdown">
                    {modelOptions.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`dash_chatModelOption ${opt.value === selectedModel ? 'dash_chatModelOption--active' : ''}`}
                        onClick={() => { onModelChange(opt.value); setModelDropdownOpen(false); }}
                      >
                        <span>{opt.label}</span>
                        {opt.value === selectedModel && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {personaOptions && onPersonaChange && (
              <div className="dash_chatModelWrap" ref={personaDropdownRef}>
                <button
                  type="button"
                  className={`dash_chatModelChip ${personaDropdownOpen ? 'dash_chatModelChip--open' : ''}`}
                  onClick={() => setPersonaDropdownOpen(p => !p)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                  </svg>
                  <span>
                    {selectedPersona === "custom"
                      ? (customPersonaValue.trim() ? `"${customPersonaValue.slice(0, 18)}${customPersonaValue.length > 18 ? '…' : ''}"` : "Custom…")
                      : (personaOptions.find(o => o.value === selectedPersona)?.label ?? "Persona")}
                  </span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="dash_chatModelChevron">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>

                {personaDropdownOpen && (
                  <div className="dash_chatModelDropdown">
                    {selectedPersona === "custom" && (
                      <div className="dash_chatPersonaCustomWrap">
                        <input
                          className="dash_chatPersonaCustomInput"
                          type="text"
                          placeholder="Describe the persona…"
                          value={customPersonaValue}
                          onChange={e => onCustomPersonaChange?.(e.target.value)}
                          maxLength={200}
                          autoFocus
                          onClick={e => e.stopPropagation()}
                        />
                      </div>
                    )}
                    {personaOptions.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`dash_chatModelOption ${opt.value === selectedPersona ? 'dash_chatModelOption--active' : ''}`}
                        onClick={() => { onPersonaChange(opt.value); if (opt.value !== "custom") setPersonaDropdownOpen(false); }}
                      >
                        <span>{opt.label}</span>
                        {opt.value === selectedPersona && opt.value !== "custom" && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="dash_chatBottomSpacer" />

            {isLoading ? (
              <button
                type="button"
                className="dash_chatSendBtn dash_chatSendBtn--stop"
                onClick={onStop}
                aria-label="Stop generation"
              >
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                className="dash_chatSendBtn"
                onClick={handleSubmit}
                disabled={disabled || (!value.trim() && pendingFiles.length === 0 && pastedContents.length === 0)}
                aria-label="Send message"
              >
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MARKDOWN RENDERER (standalone, reusable)
// ============================================================================

function processInlineMarkdown(input: string) {
  const parts: (string | JSX.Element)[] = [];
  let remaining = input;
  let k = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);
    const codeMatch = remaining.match(/`([^`]+)`/);
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
    const highlightMatch = remaining.match(/==([+\-~?]?)(.+?)==/);

    const matches = [
      boldMatch ? { type: "bold", match: boldMatch, index: boldMatch.index! } : null,
      italicMatch ? { type: "italic", match: italicMatch, index: italicMatch.index! } : null,
      codeMatch ? { type: "code", match: codeMatch, index: codeMatch.index! } : null,
      linkMatch ? { type: "link", match: linkMatch, index: linkMatch.index! } : null,
      highlightMatch ? { type: "highlight", match: highlightMatch, index: highlightMatch.index! } : null,
    ].filter(Boolean).sort((a, b) => a!.index - b!.index);

    if (matches.length === 0) { parts.push(remaining); break; }

    const first = matches[0]!;
    if (first.index > 0) parts.push(remaining.slice(0, first.index));

    if (first.type === "bold") {
      parts.push(<strong key={k++}>{first.match[1]}</strong>);
    } else if (first.type === "italic") {
      parts.push(<em key={k++}>{first.match[1]}</em>);
    } else if (first.type === "code") {
      parts.push(<code key={k++} className="dash_mdInlineCode">{first.match[1]}</code>);
    } else if (first.type === "link") {
      parts.push(
        <a key={k++} className="dash_mdLink" href={first.match[2]} target="_blank" rel="noopener noreferrer">
          {first.match[1]}
        </a>
      );
    } else if (first.type === "highlight") {
      parts.push(
        <mark key={k++} className="dash_highlight">{first.match[2]}</mark>
      );
    }
    remaining = remaining.slice(first.index + first.match[0].length);
  }
  return parts;
}

export function renderMarkdown(text: string, hideCodeBlocks = false): JSX.Element[] | null {
  if (!text) return null;

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const elements: JSX.Element[] = [];

  let currentParagraph: string[] = [];
  let inCodeBlock = false;
  let codeContent: string[] = [];
  let codeLanguage = "";

  let listType: "ul" | "ol" | null = null;
  // Each item: { text, subItems[] }
  let listAccum: { text: string; subItems: string[] }[] = [];
  let blockquoteLines: string[] = [];

  const flushParagraph = () => {
    if (!currentParagraph.length) return;
    elements.push(
      <p key={`p-${elements.length}`} className="dash_mdParagraph">
        {processInlineMarkdown(currentParagraph.join("\n"))}
      </p>
    );
    currentParagraph = [];
  };

  const flushList = () => {
    if (!listType || listAccum.length === 0) return;
    const items = listAccum.map((item, idx) => (
      <li key={`li-${elements.length}-${idx}`} className="dash_mdLI">
        {processInlineMarkdown(item.text)}
        {item.subItems.length > 0 && (
          <ul className="dash_mdUL">
            {item.subItems.map((sub, si) => (
              <li key={`sub-${idx}-${si}`} className="dash_mdLI">{processInlineMarkdown(sub)}</li>
            ))}
          </ul>
        )}
      </li>
    ));
    elements.push(
      listType === "ul"
        ? <ul key={`ul-${elements.length}`} className="dash_mdUL">{items}</ul>
        : <ol key={`ol-${elements.length}`} className="dash_mdOL">{items}</ol>
    );
    listType = null;
    listAccum = [];
  };

  const flushBlockquote = () => {
    if (blockquoteLines.length === 0) return;
    elements.push(
      <blockquote key={`bq-${elements.length}`} className="dash_mdBlockquote">
        {blockquoteLines.map((l, i) => (
          <p key={i} className="dash_mdBlockquoteLine">{processInlineMarkdown(l)}</p>
        ))}
      </blockquote>
    );
    blockquoteLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      flushParagraph(); flushList(); flushBlockquote();
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLanguage = line.slice(3).trim();
        codeContent = [];
      } else {
        if (!hideCodeBlocks) {
          const raw = codeContent.join("\n");
          const lang = codeLanguage || "code";
          const highlighted = highlightCode(raw, lang);
          elements.push(
            <div key={`code-${elements.length}`} className="dash_mdCodeBlock">
              <div className="dash_mdCodeHeader">
                <span className="dash_mdCodeLang">{lang}</span>
                <button type="button" className="dash_mdCodeCopy" onClick={() => navigator.clipboard.writeText(raw)}>
                  <Copy size={12} />
                  <span>Copy</span>
                </button>
              </div>
              <pre className="dash_mdCodeContent">
                <code dangerouslySetInnerHTML={{ __html: highlighted }} />
              </pre>
            </div>
          );
        }
        inCodeBlock = false;
        codeLanguage = "";
        codeContent = [];
      }
      continue;
    }

    if (inCodeBlock) { codeContent.push(line); continue; }

    if (/^\s*---+\s*$/.test(line)) {
      flushParagraph(); flushList(); flushBlockquote();
      elements.push(<hr key={`hr-${elements.length}`} className="dash_mdDivider" />);
      continue;
    }

    const bqMatch = line.match(/^>\s?(.*)$/);
    if (bqMatch) {
      flushParagraph(); flushList();
      blockquoteLines.push(bqMatch[1]);
      continue;
    } else if (blockquoteLines.length > 0) {
      flushBlockquote();
    }

    if (line.startsWith("#### ")) {
      flushParagraph(); flushList();
      elements.push(<h5 key={`h4-${elements.length}`} className="dash_mdH4">{processInlineMarkdown(line.slice(5))}</h5>);
      continue;
    }
    if (line.startsWith("### ")) {
      flushParagraph(); flushList();
      elements.push(<h4 key={`h3-${elements.length}`} className="dash_mdH3">{processInlineMarkdown(line.slice(4))}</h4>);
      continue;
    }
    if (line.startsWith("## ")) {
      flushParagraph(); flushList();
      elements.push(<h3 key={`h2-${elements.length}`} className="dash_mdH2">{processInlineMarkdown(line.slice(3))}</h3>);
      continue;
    }
    if (line.startsWith("# ")) {
      flushParagraph(); flushList();
      elements.push(<h2 key={`h1-${elements.length}`} className="dash_mdH1">{processInlineMarkdown(line.slice(2))}</h2>);
      continue;
    }

    // ── Sub-item (indented by 2+ spaces) — append to last parent item ──
    const subMatch = line.match(/^(\s{2,})[-*]\s+(.+)$/) || line.match(/^(\s{2,})\d+\.\s+(.+)$/);
    if (subMatch && listType && listAccum.length > 0) {
      listAccum[listAccum.length - 1].subItems.push(subMatch[2]);
      continue;
    }

    // ── Root-level unordered list item (no leading indent) ──
    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      flushParagraph();
      if (listType !== "ul") { flushList(); listType = "ul"; }
      listAccum.push({ text: ulMatch[1], subItems: [] });
      continue;
    }

    // ── Root-level ordered list item (no leading indent) ──
    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      flushParagraph();
      if (listType !== "ol") { flushList(); listType = "ol"; }
      listAccum.push({ text: olMatch[1], subItems: [] });
      continue;
    }

    // ── Empty line ──
    if (line.trim() === "") {
      flushParagraph();
      flushBlockquote();

      // Look-ahead: don't flush list if next non-empty line continues it
      if (listType) {
        let shouldFlush = true;
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j];
          if (nextLine.trim() === "") continue;
          if (listType === "ol" && /^\d+\.\s+/.test(nextLine)) {
            shouldFlush = false;
          } else if (listType === "ul" && /^[-*]\s+/.test(nextLine)) {
            shouldFlush = false;
          }
          break;
        }
        if (shouldFlush) flushList();
      }

      continue;
    }

    flushList(); flushBlockquote();
    currentParagraph.push(line);
  }

  flushParagraph();
  flushList();
  flushBlockquote();

  return elements;
}

// ============================================================================
// RICH MARKDOWN RENDERER (ReactMarkdown-based, supports tables + LaTeX)
// ============================================================================

interface MarkdownRendererProps {
  text: string;
  hideCodeBlocks?: boolean;
}

function MarkdownRenderer({ text, hideCodeBlocks = false }: MarkdownRendererProps) {
  const components = useMemo(() => ({
    p: ({ children }: any) => <p className="dash_mdParagraph">{children}</p>,
    h1: ({ children }: any) => <h2 className="dash_mdH1">{children}</h2>,
    h2: ({ children }: any) => <h3 className="dash_mdH2">{children}</h3>,
    h3: ({ children }: any) => <h4 className="dash_mdH3">{children}</h4>,
    h4: ({ children }: any) => <h5 className="dash_mdH4">{children}</h5>,
    ul: ({ children }: any) => <ul className="dash_mdUL">{children}</ul>,
    ol: ({ children }: any) => <ol className="dash_mdOL">{children}</ol>,
    li: ({ children }: any) => <li className="dash_mdLI">{children}</li>,
    a: ({ href, children }: any) => (
      <a className="dash_mdLink" href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="dash_mdBlockquote">{children}</blockquote>
    ),
    hr: () => <hr className="dash_mdDivider" />,
    table: ({ children }: any) => (
      <div className="dash_mdTableWrap">
        <table className="dash_mdTable">{children}</table>
      </div>
    ),
    thead: ({ children }: any) => <thead>{children}</thead>,
    tbody: ({ children }: any) => <tbody>{children}</tbody>,
    tr: ({ children }: any) => <tr className="dash_mdTr">{children}</tr>,
    th: ({ children }: any) => <th className="dash_mdTh">{children}</th>,
    td: ({ children }: any) => <td className="dash_mdTd">{children}</td>,
    pre: ({ children }: any) => {
      if (hideCodeBlocks) return null;
      return <>{children}</>;
    },
    code: ({ className, children }: any) => {
      const match = /language-(\w+)/.exec(className || "");
      if (match) {
        if (hideCodeBlocks) return null;
        const raw = String(children).replace(/\n$/, "");
        const lang = match[1];
        const highlighted = highlightCode(raw, lang);
        return (
          <div className="dash_mdCodeBlock">
            <div className="dash_mdCodeHeader">
              <span className="dash_mdCodeLang">{lang}</span>
              <button
                type="button"
                className="dash_mdCodeCopy"
                onClick={() => navigator.clipboard.writeText(raw)}
              >
                <Copy size={12} />
                <span>Copy</span>
              </button>
            </div>
            <pre className="dash_mdCodeContent">
              <code dangerouslySetInnerHTML={{ __html: highlighted }} />
            </pre>
          </div>
        );
      }
      return <code className="dash_mdInlineCode">{String(children)}</code>;
    },
  }), [hideCodeBlocks]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={components}
    >
      {text}
    </ReactMarkdown>
  );
}

// ============================================================================
// MESSAGE BUBBLE with Markdown support
// ============================================================================

interface MessageBubbleProps {
  message: Message;
  hideCodeBlocks?: boolean;
  isLatestAi?: boolean;
}

export function MessageBubble({ message, hideCodeBlocks = false, isLatestAi = false }: MessageBubbleProps) {
  const isUser = message.sender === "user";
  const [showPastedModal, setShowPastedModal] = useState<number | null>(null);

  // Typewriter effect for latest AI message
  const shouldType = !isUser && isLatestAi;
  const [typedLength, setTypedLength] = useState(() => shouldType ? 0 : message.text.length);
  const hasTypedRef = useRef(!shouldType);

  useEffect(() => {
    if (isUser || !isLatestAi || hasTypedRef.current) return;

    const total = message.text.length;
    if (total === 0) { hasTypedRef.current = true; return; }

    const tickMs = 14;
    const totalTicks = Math.max(20, Math.min(60, Math.ceil(total / 8)));
    const charsPerTick = Math.ceil(total / totalTicks);

    let current = 0;
    const timer = setInterval(() => {
      current += charsPerTick;
      if (current >= total) {
        setTypedLength(total);
        hasTypedRef.current = true;
        clearInterval(timer);
      } else {
        setTypedLength(current);
      }
    }, tickMs);

    return () => clearInterval(timer);
  }, [isLatestAi, isUser, message.text]);

  const isTyping = !isUser && typedLength < message.text.length;

  let displayText = message.text;
  if (hideCodeBlocks) {
    displayText = displayText.replace(/```[\s\S]*?```/g, '').trim();
  }
  if (isTyping) {
    displayText = displayText.slice(0, typedLength);
  }

  const hasPastedContents = message.pastedContents && message.pastedContents.length > 0;

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text);
  };

  const handleLike = () => {
    console.log('Liked message:', message.id);
  };

  const handleDislike = () => {
    console.log('Disliked message:', message.id);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className={`dash_messageWrapper ${isUser ? "dash_messageWrapper--user" : "dash_messageWrapper--ai"}`}>
      <div className={`dash_messageBubble ${isUser ? "dash_messageBubble--user" : "dash_messageBubble--ai"}`}>
        {isUser && hasPastedContents && (
          <div className="dash_messagePastedChips">
            {message.pastedContents!.map((pasted, idx) => (
              <button
                key={pasted.id}
                type="button"
                className="dash_messagePastedChip"
                onClick={() => setShowPastedModal(idx)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <span>PASTED {idx + 1}</span>
              </button>
            ))}
          </div>
        )}

        {isUser && message.images && message.images.length > 0 && (
          <div className="dash_messageImages">
            {message.images.map((img, idx) => (
              <div key={idx} className="dash_messageImageThumb">
                <img
                  src={img.dataUrl}
                  alt={img.name}
                  className="dash_messageImage"
                />
                <span className="dash_messageImageName">{img.name}</span>
              </div>
            ))}
          </div>
        )}

        {isUser && message.attachments && message.attachments.length > 0 && (
          <div className="dash_messagePastedChips">
            {message.attachments.map((att, idx) => (
              <span key={idx} className="dash_messagePastedChip" title={`${att.type} — ${att.sizeKB} KB`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                </svg>
                <span>{att.name}</span>
              </span>
            ))}
          </div>
        )}

        <div className="dash_messageText">
          {isUser ? displayText : <MarkdownRenderer text={displayText} hideCodeBlocks={hideCodeBlocks} />}
          {isTyping && <span className="dash_typingCursor" />}
        </div>

        {!isUser && (
          <div className="dash_messageFooter">
            <span className="dash_messageTime">{formatTime(message.createdAt)}</span>
            <div className="dash_messageActions">
              <button
                type="button"
                className="dash_messageActionBtn"
                onClick={handleCopy}
                title="Copy to clipboard"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
              <button
                type="button"
                className="dash_messageActionBtn"
                onClick={handleLike}
                title="Good response"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                </svg>
              </button>
              <button
                type="button"
                className="dash_messageActionBtn"
                onClick={handleDislike}
                title="Bad response"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {isUser && (
        <div className="dash_messageTimeExternal">
          {formatTime(message.createdAt)}
        </div>
      )}

      {showPastedModal !== null && message.pastedContents && (
        <div className="dash_pastedModalOverlay" onClick={() => setShowPastedModal(null)}>
          <div className="dash_pastedModal" onClick={(e) => e.stopPropagation()}>
            <div className="dash_pastedModalHeader">
              <span>PASTED {showPastedModal + 1}</span>
              <button
                type="button"
                className="dash_pastedModalClose"
                onClick={() => setShowPastedModal(null)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="dash_pastedModalContent">
              {message.pastedContents[showPastedModal]?.content || ""}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
