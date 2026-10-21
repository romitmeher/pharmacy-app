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

export default function AICopilotDrawer({ initialOpen = false }: { initialOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState<boolean>(initialOpen);
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
      } catch (err: unknown) {
        setMessages((prev) => [
          ...prev,
          {
            sender: "copilot",
            text: "Sorry, I encountered an issue retrieving real-time database insights: " + ((err instanceof Error ? err.message : "") || "Unknown error"),
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
          aria-label="Ask Pharmacy Copilot"
          className="aicopilotdrawer-1"

        >
          <Bot size={18} />
          <span>Ask Pharmacy Copilot</span>
        </button>
      )}

      {/* Slide-over Drawer Panel */}
      {isOpen && (
        <div
          className="aicopilotdrawer-2"
        >
          {/* Header */}
          <div
            className="aicopilotdrawer-3"
          >
            <div className="aicopilotdrawer-4">
              <div
                className="aicopilotdrawer-5"
              >
                <Bot size={16} />
              </div>
              <div>
                <h3 className="aicopilotdrawer-6">
                  Grounded AI Copilot
                </h3>
                <div className="aicopilotdrawer-7">
                  <Database size={10} className="aicopilotdrawer-8" />
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
            className="aicopilotdrawer-9"
          >
            {sampleQueries.map((sq, idx) => (
              <button
                key={idx}
                onClick={() => handleSendQuery(sq)}
                className="aicopilotdrawer-10"
              >
                {sq}
              </button>
            ))}
          </div>

          {/* Messages Stream */}
          <div
            className="aicopilotdrawer-11"
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
                      className="aicopilotdrawer-12"
                    >
                      <strong>Grounded Database Facts ({msg.data.grounded_facts.length}):</strong>
                      <ul className="aicopilotdrawer-13">
                        {msg.data.grounded_facts.slice(0, 3).map((f, fIdx) => (
                          <li key={fIdx}>{f.summary}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Copilot feedback buttons */}
                {msg.sender === "copilot" && msg.data?.interaction_id && (
                  <div className="aicopilotdrawer-14">
                    <button
                      onClick={() => handleFeedback(msg.data?.interaction_id, true)}
                      className="aicopilotdrawer-15"
                      title="Helpful"
                    >
                      <ThumbsUp size={12} />
                    </button>
                    <button
                      onClick={() => handleFeedback(msg.data?.interaction_id, false)}
                      className="aicopilotdrawer-16"
                      title="Not helpful"
                    >
                      <ThumbsDown size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {isSubmitting && (
              <div className="aicopilotdrawer-17">
                <Sparkles size={14} className="spin" />
                <span>Searching MySQL database & reasoning...</span>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div
            className="aicopilotdrawer-18"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendQuery();
              }}
              className="aicopilotdrawer-19"
            >
              <input
                type="text"
                placeholder="Ask about inventory, expiry, reorder..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                
                className="form-input aicopilotdrawer-20"
                disabled={isSubmitting}
              />
              <button
                type="submit"
                disabled={isSubmitting || !query.trim()}
                
                className="btn btn-primary aicopilotdrawer-21"
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
