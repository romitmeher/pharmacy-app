"use client";

import React, { useState } from "react";
import Link from "next/link";
import { askCopilotQuery, getAlternativeMedicines, CopilotResponseData, AlternativeResponseData } from "@/lib/api";

const SUGGESTED_PROMPTS = [
  "Where is Crocin 650 stored?",
  "What products expire in the next 30 days?",
  "Which medicines are low in stock?",
  "What were today's sales and bills dispensed?",
  "Are there pending distributor purchases?",
];

export default function CopilotPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [copilotResponse, setCopilotResponse] = useState<CopilotResponseData | null>(null);
  const [alternativesData, setAlternativesData] = useState<AlternativeResponseData | null>(null);
  const [altLoading, setAltLoading] = useState(false);

  const handleSearch = async (textToQuery: string) => {
    if (!textToQuery.trim()) return;
    setLoading(true);
    setAlternativesData(null);
    try {
      const data = await askCopilotQuery(textToQuery);
      setCopilotResponse(data);
    } catch (err: any) {
      alert("Failed to query copilot: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchAlternatives = async (medicineId: number) => {
    setAltLoading(true);
    try {
      const data = await getAlternativeMedicines(medicineId);
      setAlternativesData(data);
    } catch (err: any) {
      alert("Failed to load alternatives: " + err.message);
    } finally {
      setAltLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-app)", display: "flex", flexDirection: "column" }}>
      {/* Navigation Header */}
      <header
        style={{
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border-subtle)",
          padding: "1rem 2.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Link href="/" style={{ fontSize: "1.75rem", textDecoration: "none" }}>
            💊
          </Link>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <h1 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-primary)" }}>
                SmartPharm AI Copilot
              </h1>
              <span
                style={{
                  fontSize: "0.7rem",
                  padding: "0.2rem 0.55rem",
                  borderRadius: "var(--radius-full)",
                  background: "var(--confidence-high-bg)",
                  color: "var(--confidence-high-accent)",
                  fontWeight: 700,
                  border: "1px solid var(--confidence-high-border)",
                }}
              >
                PRD RULE 19 GROUNDED
              </span>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Factual RAG assistant grounded strictly in physical store records, batches, and transactions
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Link
            href="/prescriptions"
            style={{
              padding: "0.45rem 1rem",
              background: "var(--bg-app)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.85rem",
              fontWeight: 600,
              color: "var(--text-primary)",
              textDecoration: "none",
            }}
          >
            📋 Prescription Scanner
          </Link>
          <Link
            href="/distributor"
            style={{
              padding: "0.45rem 1rem",
              background: "var(--bg-app)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.85rem",
              fontWeight: 600,
              color: "var(--text-primary)",
              textDecoration: "none",
            }}
          >
            🚛 Receiving
          </Link>
          <Link
            href="/"
            style={{
              padding: "0.45rem 1rem",
              background: "var(--brand-500)",
              color: "#ffffff",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.85rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Dashboard
          </Link>
        </div>
      </header>

      {/* Main Copilot Body */}
      <main
        style={{
          flex: 1,
          padding: "2rem 2.5rem",
          maxWidth: "1100px",
          margin: "0 auto",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "1.75rem",
        }}
      >
        {/* Grounding Philosophy Alert Banner */}
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "1rem 1.25rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <span style={{ fontSize: "1.25rem" }}>🛡️</span>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            <strong style={{ color: "var(--text-primary)" }}>Zero-Hallucination RAG Architecture:</strong> The LLM is{" "}
            <em>NOT</em> the source of truth for stock, pricing, or finances. All answers are deterministically verified
            against your store&apos;s live MySQL tables.
          </div>
        </div>

        {/* Search Input Box */}
        <section
          style={{
            background: "var(--bg-surface)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-sm)",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch(query);
            }}
            style={{ display: "flex", gap: "0.75rem" }}
          >
            <input
              type="text"
              placeholder="Ask anything: 'Where is Crocin 650?', 'Show low stock items', 'What expires soon?'..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                flex: 1,
                padding: "0.75rem 1rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-default)",
                background: "var(--bg-app)",
                fontSize: "0.95rem",
                color: "var(--text-primary)",
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "0.75rem 1.75rem",
                background: loading ? "var(--border-default)" : "var(--brand-500)",
                color: "#ffffff",
                borderRadius: "var(--radius-sm)",
                fontWeight: 700,
                fontSize: "0.9rem",
                cursor: loading ? "not-allowed" : "pointer",
                border: "none",
                boxShadow: "0 2px 6px var(--brand-shadow)",
              }}
            >
              {loading ? "Grounding in Database..." : "Ask Copilot"}
            </button>
          </form>

          {/* Quick Prompt Suggestions */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase" }}>
              Suggested:
            </span>
            {SUGGESTED_PROMPTS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setQuery(p);
                  handleSearch(p);
                }}
                style={{
                  fontSize: "0.8rem",
                  padding: "0.3rem 0.65rem",
                  borderRadius: "var(--radius-full)",
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </section>

        {/* Copilot Response Display */}
        {copilotResponse && (
          <section
            style={{
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "var(--shadow-sm)",
              padding: "1.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.5rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={{ fontSize: "1.5rem" }}>🤖</span>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>Copilot Response</h2>
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "0.2rem 0.55rem",
                    borderRadius: "var(--radius-sm)",
                    background: "rgba(59, 130, 246, 0.12)",
                    color: "#2563eb",
                    fontWeight: 700,
                  }}
                >
                  INTENT: {copilotResponse.intent}
                </span>
              </div>

              <span style={{ fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
                Confidence: {(copilotResponse.confidence * 100).toFixed(0)}%
              </span>
            </div>

            {/* Main Grounded Answer Text */}
            <div
              style={{
                fontSize: "1.05rem",
                lineHeight: 1.7,
                color: "var(--text-primary)",
                background: "var(--bg-app)",
                padding: "1.25rem",
                borderRadius: "var(--radius-sm)",
                borderLeft: "4px solid var(--brand-500)",
              }}
            >
              {copilotResponse.answer}
            </div>

            {/* Grounded Database Citations */}
            {copilotResponse.grounded_facts.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Verified Database Facts ({copilotResponse.grounded_facts.length} citations)
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  {copilotResponse.grounded_facts.map((fact, fIdx) => (
                    <div
                      key={fIdx}
                      style={{
                        background: "var(--bg-app)",
                        padding: "0.85rem",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-subtle)",
                        fontSize: "0.8rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.3rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: 700, color: "var(--brand-600)" }}>{fact.category}</span>
                        {fact.record_id && (
                          <span style={{ color: "var(--text-tertiary)" }}>ID #{fact.record_id}</span>
                        )}
                      </div>
                      <div style={{ color: "var(--text-primary)" }}>{fact.summary}</div>

                      {/* If fact has medicine_id, allow checking decision support alternatives */}
                      {fact.details?.medicine_id && (
                        <button
                          type="button"
                          onClick={() => handleFetchAlternatives(fact.details.medicine_id)}
                          style={{
                            alignSelf: "flex-start",
                            marginTop: "0.4rem",
                            fontSize: "0.75rem",
                            padding: "0.25rem 0.5rem",
                            borderRadius: "var(--radius-xs)",
                            background: "var(--brand-50)",
                            color: "var(--brand-600)",
                            border: "1px solid var(--border-default)",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          🔍 View Bio-equivalent Alternatives (PRD Rule 20)
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggested Follow-up Actions */}
            {copilotResponse.suggested_actions.length > 0 && (
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-tertiary)" }}>Actions:</span>
                {copilotResponse.suggested_actions.map((act, aIdx) => (
                  <button
                    key={aIdx}
                    type="button"
                    onClick={() => {
                      setQuery(act);
                      handleSearch(act);
                    }}
                    style={{
                      fontSize: "0.75rem",
                      padding: "0.25rem 0.6rem",
                      borderRadius: "var(--radius-xs)",
                      background: "var(--bg-app)",
                      border: "1px solid var(--border-default)",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    {act}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Decision Support Alternatives Drawer */}
        {alternativesData && (
          <section
            style={{
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "var(--shadow-sm)",
              padding: "1.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Clinical Decision Support: Alternatives for {alternativesData.original_medicine.brand_name}
                </h3>
                <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  Active molecule: <strong>{alternativesData.original_medicine.generic_name}</strong> • Current stock:{" "}
                  <strong>{alternativesData.original_medicine.in_stock} units</strong>
                </p>
              </div>

              <span
                style={{
                  fontSize: "0.75rem",
                  padding: "0.25rem 0.6rem",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--confidence-high-bg)",
                  color: "var(--confidence-high-accent)",
                  fontWeight: 700,
                }}
              >
                {alternativesData.available_candidates_count} Available in Stock
              </span>
            </div>

            {/* Mandatory PRD Rule 20 Disclaimer */}
            <div
              style={{
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                padding: "0.75rem 1rem",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.75rem",
                color: "#92400e",
                lineHeight: 1.5,
              }}
            >
              ⚠️ {alternativesData.disclaimer}
            </div>

            {/* Candidates Table */}
            {alternativesData.candidates.length > 0 ? (
              <div style={{ overflowX: "auto", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-app)", borderBottom: "1px solid var(--border-subtle)" }}>
                      <th style={{ padding: "0.75rem 1rem" }}>Candidate Medicine</th>
                      <th style={{ padding: "0.75rem 1rem" }}>Manufacturer</th>
                      <th style={{ padding: "0.75rem 1rem" }}>Strength / Form</th>
                      <th style={{ padding: "0.75rem 1rem" }}>Stock Status</th>
                      <th style={{ padding: "0.75rem 1rem" }}>Price (Selling)</th>
                      <th style={{ padding: "0.75rem 1rem" }}>Price Diff vs Original</th>
                      <th style={{ padding: "0.75rem 1rem" }}>Matching Criteria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alternativesData.candidates.map((cand, cIdx) => (
                      <tr key={cIdx} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td style={{ padding: "0.75rem 1rem", fontWeight: 700 }}>{cand.brand_name}</td>
                        <td style={{ padding: "0.75rem 1rem", color: "var(--text-secondary)" }}>{cand.manufacturer || "-"}</td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          {cand.strength || "-"} • {cand.dosage_form || "Tablet"}
                        </td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          {cand.is_available ? (
                            <span
                              style={{
                                fontSize: "0.75rem",
                                padding: "0.2rem 0.5rem",
                                borderRadius: "var(--radius-full)",
                                background: "var(--confidence-high-bg)",
                                color: "var(--confidence-high-accent)",
                                fontWeight: 700,
                              }}
                            >
                              ✓ {cand.units_in_stock} in stock
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: "0.75rem",
                                padding: "0.2rem 0.5rem",
                                borderRadius: "var(--radius-full)",
                                background: "var(--confidence-low-bg)",
                                color: "var(--confidence-low-accent)",
                                fontWeight: 700,
                              }}
                            >
                              0 Out of Stock
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>₹{cand.selling_price.toFixed(2)}</td>
                        <td
                          style={{
                            padding: "0.75rem 1rem",
                            fontWeight: 700,
                            color: cand.price_difference_pct < 0 ? "var(--confidence-high-accent)" : cand.price_difference_pct > 0 ? "var(--confidence-low-accent)" : "var(--text-secondary)",
                          }}
                        >
                          {cand.price_difference_pct > 0 ? `+${cand.price_difference_pct}%` : `${cand.price_difference_pct}%`}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          {cand.match_reasons.join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--text-tertiary)", fontSize: "0.85rem" }}>
                No active bio-equivalent alternatives registered in this store&apos;s catalog.
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
