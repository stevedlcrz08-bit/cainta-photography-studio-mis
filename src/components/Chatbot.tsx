import React, { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Sparkles, ArrowRight, Camera, ExternalLink, MapPin, Calendar, Star, Printer, LayoutDashboard, LogIn } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { apiRequest, ApiError } from "../utils/apiClient.ts";

interface ChatbotProps {
  currentStudioId?: string;
  onTriggerBooking: (studioId: string) => void;
  onNavigateToServices: (studioId: string) => void;
  onNavigateToPackages: (studioId: string) => void;
  onNavigate: (page: string, params?: any) => void;
  currentUser: any | null;
}

interface Message {
  sender: "user" | "bot";
  text: string;
  timestamp: Date;
}

// Token pattern string — used to build fresh RegExp instances (never a shared /g const)
const TOKEN_PATTERN_STR = "\\[(?:book_now|view_services|view_packages|go_page|go_studio|external_link):[^\\]]+\\]";

function cleanBotText(raw: string): string {
  // Walk through the text, accumulating clean plain-text runs while
  // preserving every token exactly.  We exec a fresh RegExp each call
  // (never a shared /g const) to avoid lastIndex state bugs.

  // Build result by replacing in chunks
  let result = "";
  let cursor = 0;
  let m: RegExpExecArray | null;

  // Re-use a fresh exec loop so there's no shared lastIndex issue
  const re = new RegExp(TOKEN_PATTERN_STR, "g");
  while ((m = re.exec(raw)) !== null) {
    // Clean the plain-text chunk before this token
    if (m.index > cursor) {
      result += stripMarkdown(raw.slice(cursor, m.index));
    }
    // Append the token unchanged
    result += m[0];
    cursor = re.lastIndex;
  }
  // Clean any trailing plain text
  if (cursor < raw.length) {
    result += stripMarkdown(raw.slice(cursor));
  }

  return result.trim();
}

/** Apply markdown stripping to a plain-text segment only */
function stripMarkdown(seg: string): string {
  return seg
    .replace(/```[\s\S]*?```/g, m => m.replace(/```/g, ""))
    // Convert markdown links with real URLs → external_link tokens
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "[external_link:$2|$1]")
    // Strip other markdown links — keep label text only
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_\n]+)_{1,3}/g, "$1")
    .replace(/\n{3,}/g, "\n\n");
}

export default function Chatbot({
  currentStudioId,
  onTriggerBooking,
  onNavigateToServices,
  onNavigateToPackages,
  onNavigate,
  currentUser
}: ChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: "bot",
      text: "Hello! I am your AI Cainta Photography Guide. 🌟 How can I help you today? Ask me about operating hours, services, packages, photo booth accessories, or booking assistance!",
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userText = inputValue;
    setInputValue("");
    setMessages(prev => [...prev, { sender: "user", text: userText, timestamp: new Date() }]);
    setIsLoading(true);

    try {
      const data = await apiRequest("/api/chatbot/message", {
        method: "POST",
        body: {
          message: userText,
          studioId: currentStudioId || undefined,
          history: messages.slice(-6).map(m => ({
            role: m.sender === "user" ? "user" : "model",
            text: m.text
          }))
        }
      });
      setMessages(prev => [...prev, { sender: "bot", text: cleanBotText(data.text), timestamp: new Date() }]);
    } catch (error) {
      console.error("Chat error", error);
      setMessages(prev => [
        ...prev,
        {
          sender: "bot",
          text: "I'm having a little trouble connecting right now. You can still browse our photo packages and book instantly with any Book Now button, or try sending your question again in a moment.",
          timestamp: new Date()
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Page/action configs ──────────────────────────────────────────────────
  const PAGE_LINK_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    landing:            { label: "Go to Home",            icon: <Camera size={13} />,          color: "bg-[#2c2a29] hover:bg-[#4a4644] text-white" },
    directory:          { label: "Browse All Studios",    icon: <MapPin size={13} />,           color: "bg-[#2c2a29] hover:bg-[#4a4644] text-white" },
    login:              { label: "Log In / Sign Up",      icon: <LogIn size={13} />,            color: "bg-[#2c2a29] hover:bg-[#4a4644] text-white" },
    "customer-dashboard": { label: "My Dashboard",       icon: <LayoutDashboard size={13} />,  color: "bg-[#2c2a29] hover:bg-[#4a4644] text-white" },
    "customer-dashboard-prints": { label: "My Print Orders", icon: <Printer size={13} />,      color: "bg-[#2c2a29] hover:bg-[#4a4644] text-white" },
    "customer-dashboard-bookings": { label: "My Bookings", icon: <Calendar size={13} />,       color: "bg-[#2c2a29] hover:bg-[#4a4644] text-white" },
  };

  // Parses all token types out of a chatbot message into renderable parts
  const parseMessageText = (text: string) => {
    type Part =
      | { type: "text";      content: string }
      | { type: "action";    action: string; targetId: string; label: string }
      | { type: "page_link"; page: string;   params?: any;     label: string }
      | { type: "ext_link";  url: string;    label: string };

    const parts: Part[] = [];
    // Fresh regex each call — no shared lastIndex state
    const regex = new RegExp(`(${TOKEN_PATTERN_STR})`, "g");
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "text", content: text.substring(lastIndex, match.index) });
      }

      // match[1] is the full token e.g. "[book_now:ST-ABC]"
      const fullToken = match[1];
      // Parse tokenType and tokenValue from the full token string
      const inner = fullToken.slice(1, -1); // strip [ and ]
      const colonIdx = inner.indexOf(":");
      const tokenType  = inner.substring(0, colonIdx);
      const tokenValue = inner.substring(colonIdx + 1);

      if (tokenType === "book_now") {
        parts.push({
          type: "action", action: "book_now", targetId: tokenValue,
          label: "Book Appointment Now"
        });
      } else if (tokenType === "view_services") {
        parts.push({
          type: "action", action: "view_services", targetId: tokenValue,
          label: "Browse Services"
        });
      } else if (tokenType === "view_packages") {
        parts.push({
          type: "action", action: "view_packages", targetId: tokenValue,
          label: "View Packages"
        });
      } else if (tokenType === "go_studio") {
        // go_studio:ST-XXXX  →  navigate to profile page
        parts.push({
          type: "page_link", page: "profile", params: { id: tokenValue },
          label: `View Studio Profile`
        });
      } else if (tokenType === "go_page") {
        // go_page:directory  or  go_page:customer-dashboard
        const [page, ...rest] = tokenValue.split("|");
        const customLabel = rest.join("|").trim();
        const meta = PAGE_LINK_META[page];
        parts.push({
          type: "page_link", page,
          label: customLabel || meta?.label || `Go to ${page}`
        });
      } else if (tokenType === "external_link") {
        // external_link:https://...|Label text
        const pipeIdx = tokenValue.indexOf("|");
        const url   = pipeIdx !== -1 ? tokenValue.substring(0, pipeIdx)  : tokenValue;
        const label = pipeIdx !== -1 ? tokenValue.substring(pipeIdx + 1) : url;
        parts.push({ type: "ext_link", url, label });
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push({ type: "text", content: text.substring(lastIndex) });
    }

    return parts.length > 0 ? parts : [{ type: "text" as const, content: text }];
  };

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 50 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="bg-white border border-[#e5e1da] rounded-2xl shadow-2xl w-[calc(100vw-2rem)] sm:w-96 max-w-sm h-[420px] sm:h-[500px] max-h-[calc(100vh-160px)] flex flex-col overflow-hidden mb-4"
          >
            {/* Header */}
            <div className="bg-[#2c2a29] text-white p-4 flex items-center justify-between shadow-md">
              <div className="flex items-center gap-2">
                <div className="bg-yellow-500 text-black p-1.5 rounded-full flex items-center justify-center animate-pulse">
                  <Sparkles size={14} className="fill-current" />
                </div>
                <div>
                  <h4 className="font-display font-semibold text-sm leading-tight">Cainta Photo Guide</h4>
                  <p className="text-[10px] text-gray-300">Powered by Gemini AI • Rizal MIS</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto p-4 bg-[#faf9f6] space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs shadow-sm ${
                      m.sender === "user"
                        ? "bg-[#2c2a29] text-[#faf9f6] rounded-br-none"
                        : "bg-white text-[#2c2a29] border border-[#e5e1da] rounded-bl-none"
                    }`}
                  >
                    {m.sender === "user" ? (
                      <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>
                    ) : (
                      <div className="space-y-2">
                        {parseMessageText(m.text).map((part, pIdx) => {
                          if (part.type === "text") {
                            return (
                              <p key={pIdx} className="leading-relaxed whitespace-pre-wrap">
                                {part.content}
                              </p>
                            );
                          }

                          if (part.type === "action") {
                            return (
                              <div key={pIdx} className="pt-1">
                                <button
                                  onClick={() => {
                                    const id = part.targetId!;
                                    const isReal = id && id !== "GLOBAL" && id !== "USE_REAL_ID_FROM_LIST";
                                    if (part.action === "book_now") {
                                      setIsOpen(false);
                                      isReal ? onTriggerBooking(id) : onNavigate("directory");
                                    }
                                    if (part.action === "view_services") {
                                      setIsOpen(false);
                                      isReal ? onNavigateToServices(id) : onNavigate("directory");
                                    }
                                    if (part.action === "view_packages") {
                                      setIsOpen(false);
                                      isReal ? onNavigateToPackages(id) : onNavigate("directory");
                                    }
                                  }}
                                  className="w-full flex items-center justify-between gap-1.5 px-3 py-2 bg-yellow-500 text-black font-semibold rounded-lg hover:bg-yellow-400 active:scale-95 transition-all text-[11px] uppercase tracking-wider cursor-pointer"
                                >
                                  <span className="flex items-center gap-1.5">
                                    <Camera size={13} />
                                    {part.label}
                                  </span>
                                  <ArrowRight size={13} />
                                </button>
                              </div>
                            );
                          }

                          if (part.type === "page_link") {
                            const meta = part.page ? PAGE_LINK_META[part.page] : undefined;
                            const colorClass = meta?.color || "bg-[#2c2a29] hover:bg-[#4a4644] text-white";
                            const icon = meta?.icon || <ArrowRight size={13} />;
                            // For go_studio, guard against GLOBAL or bad IDs
                            const targetPage = part.page!;
                            const targetParams = (part as any).params;
                            const isStudioLink = targetPage === "profile";
                            const studioId = targetParams?.id;
                            const isRealStudio = studioId && studioId !== "GLOBAL" && studioId !== "USE_REAL_ID_FROM_LIST";
                            return (
                              <div key={pIdx} className="pt-1">
                                <button
                                  onClick={() => {
                                    setIsOpen(false);
                                    if (isStudioLink && !isRealStudio) {
                                      onNavigate("directory");
                                    } else {
                                      onNavigate(targetPage, targetParams);
                                    }
                                  }}
                                  className={`w-full flex items-center justify-between gap-1.5 px-3 py-2 rounded-lg font-semibold text-[11px] uppercase tracking-wider active:scale-95 transition-all cursor-pointer ${colorClass}`}
                                >
                                  <span className="flex items-center gap-1.5">
                                    {icon}
                                    {part.label}
                                  </span>
                                  <ArrowRight size={13} />
                                </button>
                              </div>
                            );
                          }

                          if (part.type === "ext_link") {
                            return (
                              <div key={pIdx} className="pt-1">
                                <a
                                  href={part.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-full flex items-center justify-between gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold text-[11px] uppercase tracking-wider active:scale-95 transition-all cursor-pointer"
                                >
                                  <span className="flex items-center gap-1.5">
                                    <ExternalLink size={13} />
                                    {part.label}
                                  </span>
                                  <ExternalLink size={11} />
                                </a>
                              </div>
                            );
                          }

                          return null;
                        })}
                      </div>
                    )}
                    <span className="block text-[8px] text-right mt-1 opacity-60">
                      {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-[#e5e1da] rounded-2xl rounded-bl-none px-4 py-3 text-xs shadow-sm flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-[#2c2a29] rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-[#2c2a29] rounded-full animate-bounce delay-75"></span>
                    <span className="w-1.5 h-1.5 bg-[#2c2a29] rounded-full animate-bounce delay-150"></span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Footer */}
            <form onSubmit={handleSend} className="p-3 border-t border-[#e5e1da] bg-white flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder="Ask your query here..."
                disabled={isLoading}
                className="flex-1 bg-[#faf9f6] border border-[#e5e1da] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#2c2a29] transition-colors"
              />
              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className="p-2 bg-[#2c2a29] hover:bg-[#4a4644] text-white rounded-xl active:scale-95 disabled:opacity-40 transition-all cursor-pointer"
              >
                <Send size={15} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Shutter Toggle Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        className="w-14 h-14 bg-[#2c2a29] text-white rounded-full flex items-center justify-center shadow-2xl relative overflow-hidden focus:outline-none cursor-pointer"
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <X size={24} />
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative flex items-center justify-center"
            >
              <MessageSquare size={24} />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
