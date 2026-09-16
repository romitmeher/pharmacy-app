"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  recordExpense,
  getExpenses,
  getStorePnLSummary,
  ExpenseRecord,
  PnLSummaryData,
  RecordExpensePayload,
} from "@/lib/api";

const EXPENSE_CATEGORIES = [
  { value: "rent", label: "🏢 Rent & Lease", desc: "Retail shop floor & warehouse lease" },
  { value: "utilities_power", label: "⚡ Power & Utilities", desc: "Electricity, backup generator & water" },
  { value: "cold_chain_maintenance", label: "❄️ Cold Chain Maintenance", desc: "Refrigerator calibration & power" },
  { value: "staff_salary", label: "👥 Staff Salaries", desc: "Pharmacist, cashier & staff compensation" },
  { value: "licensing_regulatory", label: "📜 Licensing & Legal", desc: "State Pharmacy Council, GST & drug licenses" },
  { value: "logistics_packaging", label: "📦 Packaging & Delivery", desc: "Tamper-evident bags & dispatch courier" },
  { value: "marketing_promotion", label: "📢 Marketing & Local Ads", desc: "Store flyers & health camp events" },
  { value: "miscellaneous", label: "🔧 Maintenance & Misc", desc: "Shop repairs, IT supplies & sanitation" },
];

export default function ExpensesWorkstationPage() {
  const [activeTab, setActiveTab] = useState<"pnl" | "record" | "history">("pnl");

  // P&L State
  const [pnlData, setPnlData] = useState<PnLSummaryData | null>(null);
  const [pnlLoading, setPnlLoading] = useState(true);

  // Record Form State
  const [category, setCategory] = useState("rent");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [vendorRecipient, setVendorRecipient] = useState("");
  const [receiptReference, setReceiptReference] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recordSuccess, setRecordSuccess] = useState<string | null>(null);

  // History State
  const [expensesList, setExpensesList] = useState<ExpenseRecord[]>([]);
  const [filterCategory, setFilterCategory] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [summaryTotal, setSummaryTotal] = useState(0);

  useEffect(() => {
    loadPnL();
    loadHistory();
  }, []);

  const loadPnL = async () => {
    setPnlLoading(true);
    try {
      const data = await getStorePnLSummary();
      setPnlData(data);
    } catch (err: any) {
      console.error("Failed to load P&L summary:", err);
    } finally {
      setPnlLoading(false);
    }
  };

  const loadHistory = async (cat?: string) => {
    setHistoryLoading(true);
    try {
      const res = await getExpenses(1, 50, cat !== undefined ? cat : filterCategory || undefined);
      setExpensesList(res.items || []);
      setSummaryTotal(res.summary?.total_amount || 0);
    } catch (err: any) {
      console.error("Failed to load expense history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      alert("Please enter a valid expense amount.");
      return;
    }

    setIsSubmitting(true);
    setRecordSuccess(null);
    try {
      const payload: RecordExpensePayload = {
        category,
        amount: parseFloat(amount),
        payment_method: paymentMethod,
        vendor_recipient: vendorRecipient || undefined,
        receipt_reference: receiptReference || undefined,
        notes: notes || undefined,
      };
      const res = await recordExpense(payload);
      setRecordSuccess(`✓ Expense #${res.expense_number} recorded successfully! Audit trail updated.`);
      setAmount("");
      setVendorRecipient("");
      setReceiptReference("");
      setNotes("");
      loadPnL();
      loadHistory();
    } catch (err: any) {
      alert("Failed to record expense: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-app)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
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
                Operating Expenses & Store P&L Ledger
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
                PRD RULES 7, 22, 29, 30
              </span>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Overheads • Rent & Cold Chain • Cost of Goods Sold • Real-time Net Operating Profit
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {/* Tab Switcher */}
          <div
            style={{
              display: "flex",
              background: "var(--bg-app)",
              padding: "0.25rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab("pnl")}
              style={{
                padding: "0.45rem 1rem",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.85rem",
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                background: activeTab === "pnl" ? "var(--brand-500)" : "transparent",
                color: activeTab === "pnl" ? "#ffffff" : "var(--text-secondary)",
              }}
            >
              📊 P&L Statement
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("record")}
              style={{
                padding: "0.45rem 1rem",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.85rem",
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                background: activeTab === "record" ? "var(--brand-500)" : "transparent",
                color: activeTab === "record" ? "#ffffff" : "var(--text-secondary)",
              }}
            >
              ➕ Record Expense
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              style={{
                padding: "0.45rem 1rem",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.85rem",
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                background: activeTab === "history" ? "var(--brand-500)" : "transparent",
                color: activeTab === "history" ? "#ffffff" : "var(--text-secondary)",
              }}
            >
              📁 Expenses Ledger
            </button>
          </div>

          <Link
            href="/audit"
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
            🛡️ Audit Ledger
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

      {/* Main Container */}
      <main
        style={{
          flex: 1,
          maxWidth: "1400px",
          width: "100%",
          margin: "0 auto",
          padding: "2rem 2.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "2rem",
        }}
      >
        {/* TAB 1: P&L Statement */}
        {activeTab === "pnl" && (
          <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Top Cards: Financial Executive KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "1.25rem" }}>
              {/* Gross Revenue */}
              <div
                style={{
                  background: "var(--bg-surface)",
                  padding: "1.25rem",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                  GROSS REVENUE
                </span>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "0.35rem" }}>
                  ₹{(pnlData?.revenue.net_revenue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "0.25rem" }}>
                  {pnlData?.revenue.total_bills || 0} Bills • ₹{(pnlData?.revenue.refunds || 0).toFixed(2)} Refunds
                </div>
              </div>

              {/* COGS */}
              <div
                style={{
                  background: "var(--bg-surface)",
                  padding: "1.25rem",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                  COST OF GOODS (COGS)
                </span>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "0.35rem" }}>
                  ₹{(pnlData?.cogs.total_cogs || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "0.25rem" }}>
                  Batch purchase cost basis
                </div>
              </div>

              {/* Gross Profit */}
              <div
                style={{
                  background: "var(--bg-surface)",
                  padding: "1.25rem",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                  GROSS PROFIT
                </span>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--brand-600)", marginTop: "0.35rem" }}>
                  ₹{(pnlData?.cogs.gross_profit || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--brand-500)", fontWeight: 600, marginTop: "0.25rem" }}>
                  {pnlData?.cogs.gross_margin_percentage || 0}% Gross Margin
                </div>
              </div>

              {/* Operating Expenses */}
              <div
                style={{
                  background: "var(--bg-surface)",
                  padding: "1.25rem",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                  OPERATING OVERHEADS
                </span>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--confidence-low-accent)", marginTop: "0.35rem" }}>
                  ₹{(pnlData?.operating_expenses.total_expenses || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "0.25rem" }}>
                  Rent, power, salaries, logistics
                </div>
              </div>

              {/* Net Operating Profit */}
              <div
                style={{
                  background: pnlData?.net_performance.is_profitable ? "var(--confidence-high-bg)" : "var(--confidence-low-bg)",
                  border: `1px solid ${pnlData?.net_performance.is_profitable ? "var(--confidence-high-border)" : "var(--confidence-low-border)"}`,
                  padding: "1.25rem",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    color: pnlData?.net_performance.is_profitable ? "var(--confidence-high-accent)" : "var(--confidence-low-accent)",
                  }}
                >
                  NET OPERATING PROFIT
                </span>
                <div
                  style={{
                    fontSize: "1.5rem",
                    fontWeight: 800,
                    color: pnlData?.net_performance.is_profitable ? "var(--confidence-high-accent)" : "var(--confidence-low-accent)",
                    marginTop: "0.35rem",
                  }}
                >
                  ₹{(pnlData?.net_performance.net_operating_profit || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: pnlData?.net_performance.is_profitable ? "var(--confidence-high-accent)" : "var(--confidence-low-accent)",
                    marginTop: "0.25rem",
                  }}
                >
                  {pnlData?.net_performance.net_margin_percentage || 0}% Net Margin
                </div>
              </div>
            </div>

            {/* Operating Overheads Breakdown */}
            <div
              style={{
                background: "var(--bg-surface)",
                padding: "1.75rem",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)",
                boxShadow: "var(--shadow-sm)",
                display: "flex",
                flexDirection: "column",
                gap: "1.25rem",
              }}
            >
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)" }}>
                Operating Expenditures by Category
              </h2>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
                {EXPENSE_CATEGORIES.map((cat) => {
                  const catAmount = pnlData?.operating_expenses.by_category[cat.value] || 0;
                  const totalExp = pnlData?.operating_expenses.total_expenses || 1;
                  const pct = totalExp > 0 ? (catAmount / totalExp) * 100 : 0;

                  return (
                    <div
                      key={cat.value}
                      style={{
                        background: "var(--bg-app)",
                        padding: "1rem",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-default)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.35rem",
                      }}
                    >
                      <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        {cat.label}
                      </div>
                      <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-primary)" }}>
                        ₹{catAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                        {pct.toFixed(1)}% of total overheads
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* TAB 2: Record Operating Expense */}
        {activeTab === "record" && (
          <section
            style={{
              background: "var(--bg-surface)",
              padding: "2rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "var(--shadow-sm)",
              maxWidth: "800px",
              margin: "0 auto",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "1.5rem",
            }}
          >
            <div>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)" }}>
                Record Pharmacy Operating Expenditure
              </h2>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                Every recorded expense is timestamped, attributed to your user session, and preserved in the audit log.
              </p>
            </div>

            <form onSubmit={handleSubmitExpense} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
                {/* Category */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                    Expense Category *
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={{
                      padding: "0.6rem 0.75rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-default)",
                      background: "var(--bg-app)",
                      color: "var(--text-primary)",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                    }}
                  >
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Amount */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                    Expenditure Amount (INR ₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="e.g. 45000.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    style={{
                      padding: "0.6rem 0.75rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-default)",
                      background: "var(--bg-app)",
                      color: "var(--text-primary)",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
                {/* Tender Method */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                    Payment Tender Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    style={{
                      padding: "0.6rem 0.75rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-default)",
                      background: "var(--bg-app)",
                      color: "var(--text-primary)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <option value="bank_transfer">Direct Bank Transfer / NEFT</option>
                    <option value="upi">UPI / Instant Digital Payment</option>
                    <option value="cash">Cash / Petty Cash Register</option>
                    <option value="cheque">Bank Cheque</option>
                    <option value="credit">Distributor / Vendor Credit</option>
                  </select>
                </div>

                {/* Vendor / Payee */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                    Vendor / Payee Recipient
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. DLF Properties, Tata Power, Staff Name"
                    value={vendorRecipient}
                    onChange={(e) => setVendorRecipient(e.target.value)}
                    style={{
                      padding: "0.6rem 0.75rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-default)",
                      background: "var(--bg-app)",
                      color: "var(--text-primary)",
                      fontSize: "0.85rem",
                    }}
                  />
                </div>
              </div>

              {/* Receipt Reference */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                  Receipt / Invoice Reference Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. INV-98124, RENT-SEP-2026"
                  value={receiptReference}
                  onChange={(e) => setReceiptReference(e.target.value)}
                  style={{
                    padding: "0.6rem 0.75rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-default)",
                    background: "var(--bg-app)",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                  }}
                />
              </div>

              {/* Notes */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                  Operational Justification & Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Provide context for audit review..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{
                    padding: "0.6rem 0.75rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-default)",
                    background: "var(--bg-app)",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    padding: "0.75rem 2rem",
                    background: "var(--brand-500)",
                    color: "#ffffff",
                    borderRadius: "var(--radius-sm)",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    border: "none",
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    boxShadow: "0 2px 6px var(--brand-shadow)",
                  }}
                >
                  {isSubmitting ? "Recording Expenditure..." : "Commit Expense to Financial Ledger"}
                </button>
              </div>

              {recordSuccess && (
                <div
                  style={{
                    background: "var(--confidence-high-bg)",
                    border: "1px solid var(--confidence-high-border)",
                    color: "var(--confidence-high-accent)",
                    padding: "0.85rem 1.25rem",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  {recordSuccess}
                </div>
              )}
            </form>
          </section>
        )}

        {/* TAB 3: Expenses Ledger History */}
        {activeTab === "history" && (
          <section
            style={{
              background: "var(--bg-surface)",
              padding: "1.75rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "var(--shadow-sm)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-primary)" }}>
                  Operating Expenses Audit Ledger
                </h2>
                <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                  Total Recorded Expenditures: ₹{summaryTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </p>
              </div>

              {/* Filter */}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <select
                  value={filterCategory}
                  onChange={(e) => {
                    setFilterCategory(e.target.value);
                    loadHistory(e.target.value);
                  }}
                  style={{
                    padding: "0.4rem 0.75rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-default)",
                    background: "var(--bg-app)",
                    color: "var(--text-primary)",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                  }}
                >
                  <option value="">All Categories</option>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {historyLoading ? (
              <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>
                Loading expenses history...
              </div>
            ) : expensesList.length === 0 ? (
              <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-tertiary)" }}>
                No expenses recorded in this period.
              </div>
            ) : (
              <div style={{ overflowX: "auto", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-app)", borderBottom: "1px solid var(--border-subtle)" }}>
                      <th style={{ padding: "0.75rem 1rem" }}>Expense #</th>
                      <th style={{ padding: "0.75rem 1rem" }}>Date</th>
                      <th style={{ padding: "0.75rem 1rem" }}>Category</th>
                      <th style={{ padding: "0.75rem 1rem" }}>Vendor / Payee</th>
                      <th style={{ padding: "0.75rem 1rem" }}>Tender</th>
                      <th style={{ padding: "0.75rem 1rem" }}>Recorded By</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expensesList.map((exp) => (
                      <tr key={exp.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td style={{ padding: "0.75rem 1rem", fontWeight: 700, color: "var(--brand-600)" }}>
                          {exp.expense_number}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                          {exp.expense_date}
                        </td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              padding: "0.2rem 0.5rem",
                              borderRadius: "var(--radius-full)",
                              background: "var(--bg-app)",
                              border: "1px solid var(--border-default)",
                              fontWeight: 700,
                            }}
                          >
                            {exp.category.replace("_", " ").toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem 1rem" }}>{exp.vendor_recipient || "—"}</td>
                        <td style={{ padding: "0.75rem 1rem", fontSize: "0.8rem", textTransform: "capitalize" }}>
                          {exp.payment_method.replace("_", " ")}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
                          {exp.user_name || `User #${exp.user_id}`}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", fontWeight: 800, textAlign: "right" }}>
                          ₹{exp.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
