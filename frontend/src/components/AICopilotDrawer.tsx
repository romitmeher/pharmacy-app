"use client";

import React, { useState, useTransition } from "react";
import {
  Bot,
  X,
  Send,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  Database,
  CheckCircle2,
} from "lucide-react";
import { askCopilotQuery, submitCopilotFeedback, CopilotResponseData } from "@/lib/api";

export default function AICopilotDrawer() {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [query, setQuery] = useState<string>("");
  const [messages, setMessages] = useState<
    Array<{
      sender: "user" | "copilot";
      text: string;
      data?: CopilotResponseData;
    }>
  >([
    {
      sender: "copilot",
      text: "Hello! I am your SmartPharm AI Assistant. I provide real-time, database-grounded insights on stock-outs, expiry exposure, orders, and alternative medicines. How can I help your pharmacy today?",
    },
  ]);

  const [isSubmitting, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sampleQueries = [
    "What medicines are low in stock?",
    "Which products expire next month?",
    "What should I order today?",
    "Show expiry risk exposure",
  ];

  const handleSendQuery = (textToQuery?: string) => {
    const q = textToQuery || query.trim();
    if (!q) return;

    // Append user query message
    setMessages((prev) => [...prev, { sender: "user", text: q }]);
    if (!textToQuery) setQuery("");
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const res = await askCopilotQuery(q);
        setMessages((prev) => [
          ...prev,
          {
            sender: "copilot",
            text: res.answer,
            data: res,
          },
        ]);
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          {
            sender: "copilot",
            text: "Sorry, I encountered an issue retrieving real-time database insights: " + (err?.message || "Unknown error"),
          },
        ]);
      }
    });
  };

  const handleFeedback = async (interactionId: number | undefined, isHelpful: boolean) => {
    if (!interactionId) return;
    try {
      await submitCopilotFeedback(interactionId, isHelpful);
    } catch (e) {
      // Silent feedback capture
    }
  };

  return (
    <>
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            position: "fixed",
            bottom: "1.5rem",
            right: "1.5rem",
            zIndex: 900,
            display: "flex",
            alignItems: "center",
            gap: "0.625rem",
            padding: "0.75rem 1.25rem",
            borderRadius: "var(--radius-full, 9999px)",
            backgroundColor: "var(--brand-primary, #10b981)",
            color: "#ffffff",
            border: "none",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.3)",
            fontWeight: 700,
            fontSize: "0.875rem",
            cursor: "pointer",
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.04)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          <Bot size={18} />
          <span>Ask Pharmacy Copilot</span>
        </button>
      )}

      {/* Slide-over Drawer Panel */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: "420px",
            maxWidth: "100vw",
            backgroundColor: "var(--bg-card, #171717)",
            borderLeft: "1px solid var(--border-subtle, #262626)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            boxShadow: "-8px 0 32px rgba(0,0,0,0.5)",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "1rem 1.25rem",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: "var(--bg-surface-elevated)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
              <div
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "#1e3a5f",
                  border: "1px solid #1e6ee8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#87d1ff",
                }}
              >
                <Bot size={16} />
              </div>
              <div>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Grounded AI Copilot
                </h3>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <Database size={10} style={{ color: "var(--status-high-text)" }} />
                  <span>MySQL RAG Source of Truth</span>
                </div>
              </div>
            </div>

            <button onClick={() => setIsOpen(false)} className="btn-icon">
              <X size={16} />
            </button>
          </div>

          {/* Quick Sample Questions */}
          <div
            style={{
              padding: "0.625rem 1rem",
              backgroundColor: "var(--bg-app)",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              gap: "0.35rem",
              overflowX: "auto",
              scrollbarWidth: "none",
            }}
          >
            {sampleQueries.map((sq, idx) => (
              <button
                key={idx}
                onClick={() => handleSendQuery(sq)}
                style={{
                  whiteSpace: "nowrap",
                  fontSize: "0.6875rem",
                  padding: "0.25rem 0.5rem",
                  borderRadius: "var(--radius-full, 9999px)",
                  backgroundColor: "var(--bg-surface-elevated)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                {sq}
              </button>
            ))}
          </div>

          {/* Messages Stream */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: msg.sender === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "0.75rem 1rem",
                    borderRadius:
                      msg.sender === "user"
                        ? "16px 16px 4px 16px"
                        : "16px 16px 16px 4px",
                    backgroundColor:
                      msg.sender === "user"
                        ? "var(--brand-primary, #10b981)"
                        : "var(--bg-surface-elevated)",
                    color: msg.sender === "user" ? "#ffffff" : "var(--text-primary)",
                    fontSize: "0.8125rem",
                    lineHeight: 1.5,
                    border: msg.sender === "copilot" ? "1px solid var(--border-subtle)" : undefined,
                  }}
                >
                  {msg.text}

                  {/* Grounded facts badge */}
                  {msg.data?.grounded_facts && msg.data.grounded_facts.length > 0 && (
                    <div
                      style={{
                        marginTop: "0.5rem",
                        paddingTop: "0.5rem",
                        borderTop: "1px dashed var(--border-subtle)",
                        fontSize: "0.6875rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      <strong>Grounded Database Facts ({msg.data.grounded_facts.length}):</strong>
                      <ul style={{ paddingLeft: "1rem", marginTop: "0.25rem", marginBottom: 0 }}>
                        {msg.data.grounded_facts.slice(0, 3).map((f, fIdx) => (
                          <li key={fIdx}>{f.summary}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Copilot feedback buttons */}
                {msg.sender === "copilot" && msg.data?.interaction_id && (
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem", paddingLeft: "0.5rem" }}>
                    <button
                      onClick={() => handleFeedback(msg.data?.interaction_id, true)}
                      style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                      title="Helpful"
                    >
                      <ThumbsUp size={12} />
                    </button>
                    <button
                      onClick={() => handleFeedback(msg.data?.interaction_id, false)}
                      style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                      title="Not helpful"
                    >
                      <ThumbsDown size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {isSubmitting && (
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                <Sparkles size={14} className="spin" />
                <span>Searching MySQL database & reasoning...</span>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div
            style={{
              padding: "0.75rem 1rem",
              borderTop: "1px solid var(--border-subtle)",
              backgroundColor: "var(--bg-surface-elevated)",
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendQuery();
              }}
              style={{ display: "flex", gap: "0.5rem" }}
            >
              <input
                type="text"
                placeholder="Ask about inventory, expiry, reorder..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="form-input"
                style={{ height: "36px", fontSize: "0.8125rem", flex: 1 }}
                disabled={isSubmitting}
              />
              <button
                type="submit"
                disabled={isSubmitting || !query.trim()}
                className="btn btn-primary"
                style={{ height: "36px", width: "36px", padding: 0, justifyContent: "center" }}
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
