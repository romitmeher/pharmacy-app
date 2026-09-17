"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  Search,
  RefreshCw,
  Download,
  Eye,
  ShieldCheck,
  ShieldAlert,
  X,
  FileText,
  Activity,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  Package,
  Bookmark,
  Building2,
  MapPin,
} from "lucide-react";

import ThemeToggle from "@/components/ThemeToggle";
import {
  getAuditLogs,
  getAuditSummary,
  AuditLogEntry,
  AuditSummaryMetrics,
  AuditLogFilter,
} from "@/lib/api";

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [metrics, setMetrics] = useState<AuditSummaryMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  // Filters & Pagination State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntity, setSelectedEntity] = useState<string>("ALL");
  const [selectedAction, setSelectedAction] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [, startTransition] = useTransition();

  const fetchAuditData = async (page = 1) => {
    try {
      setRefreshing(true);
      const params: AuditLogFilter = {
        page,
        per_page: 20,
      };

      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (selectedEntity !== "ALL") params.entity_type = selectedEntity;
      if (selectedAction !== "ALL") params.action = selectedAction;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const [logsRes, metricsRes] = await Promise.all([
        getAuditLogs(params),
        getAuditSummary().catch(() => null),
      ]);

      startTransition(() => {
        setLogs(logsRes.data || []);
        setCurrentPage(logsRes.pagination.page);
        setTotalPages(logsRes.pagination.total_pages);
        setTotalCount(logsRes.pagination.total_count);
        if (metricsRes) setMetrics(metricsRes);
        setLoading(false);
        setRefreshing(false);
      });
    } catch (err) {
      console.error("Failed to load audit logs:", err);
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAuditData(1);
  }, [selectedEntity, selectedAction, startDate, endDate]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAuditData(1);
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedEntity("ALL");
    setSelectedAction("ALL");
    setStartDate("");
    setEndDate("");
    fetchAuditData(1);
  };

  // Export audit logs as CSV
  const handleExportCSV = () => {
    if (logs.length === 0) return;

    const headers = [
      "Log ID",
      "Timestamp (UTC)",
      "Action",
      "Entity Type",
      "Entity ID",
      "User Name",
      "User Role",
      "IP Address",
      "Mandatory Reason",
    ];

    const rows = logs.map((l) => [
      l.id,
      `"${l.created_at}"`,
      `"${l.action}"`,
      `"${l.entity_type}"`,
      `"${l.entity_id}"`,
      `"${l.user_name}"`,
      `"${l.user_role}"`,
      `"${l.ip_address || "N/A"}"`,
      `"${l.reason.replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `SmartPharm_Audit_Trail_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Action badge pill
  const renderActionBadge = (action: string) => {
    if (action.includes("VERIFY") || action.includes("INWARD") || action.includes("COMMITTED")) {
      return (
        <span className="status-badge high">
          <span className="badge-icon"><ShieldCheck size={12} /></span>
          <span>{action}</span>
        </span>
      );
    }
    if (
      action.includes("ADJUSTMENT") ||
      action.includes("RETURN") ||
      action.includes("OVERRIDE") ||
      action.includes("WRITE_OFF")
    ) {
      return (
        <span className="status-badge med">
          <span className="badge-icon"><ShieldAlert size={12} /></span>
          <span>{action}</span>
        </span>
      );
    }
    if (action.includes("RECONCILE") || action.includes("TRANSFER")) {
      return (
        <span className="status-badge info">
          <span className="badge-icon"><Activity size={12} /></span>
          <span>{action}</span>
        </span>
      );
    }
    return (
      <span className="status-badge">
        <span className="badge-icon"><FileText size={12} /></span>
        <span>{action}</span>
      </span>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      {/* Header — 64px height seam matching sidebar */}
      <header className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h1 className="page-title">Audit Trail & Regulatory Governance</h1>
            <span className="status-badge high" style={{ fontSize: "0.6875rem", padding: "0.1rem 0.45rem" }}>
              PRD Rule 7 & 22
            </span>
          </div>
          <p className="page-subtitle">
            Immutable operational event records for Drug Control Department inspections • Store #1
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <ThemeToggle />
          <button
            onClick={handleExportCSV}
            disabled={logs.length === 0}
            className="btn btn-secondary"
            style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}
          >
            <Download size={14} />
            <span>Export Audit Log (CSV)</span>
          </button>

          <button
            onClick={() => fetchAuditData(currentPage)}
            disabled={refreshing}
            className="btn btn-secondary"
            style={{ padding: "0 0.625rem" }}
            title="Refresh logs"
          >
            <RefreshCw size={14} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="page-body" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Metric Cards Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1rem",
          }}
        >
          {/* Total Events */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Total Audit Events
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle2 size={12} /></span>
                <span>Committed</span>
              </span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {metrics?.total_audit_events ?? totalCount}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Immutable records committed to DB
            </div>
          </div>

          {/* Events Today */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Events Today
              </span>
              <span className="status-badge info">
                <span className="badge-icon"><Clock size={12} /></span>
                <span>Active Shift</span>
              </span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {metrics?.events_today ?? 0}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Operational changes logged today
            </div>
          </div>

          {/* Stock Adjustments (7d) */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Stock Adjustments (7d)
              </span>
              <span className="status-badge med">
                <span className="badge-icon"><Package size={12} /></span>
                <span>Overrides</span>
              </span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {metrics?.adjustments_last_7d ?? 0}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Physical counts & manual adjustments
            </div>
          </div>

          {/* Reconciliations (7d) */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Cycle Reconciliations (7d)
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><Activity size={12} /></span>
                <span>Reconciled</span>
              </span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {metrics?.reconciliations_last_7d ?? 0}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Shelf cycle counts authorized by staff
            </div>
          </div>
        </div>

        {/* Search & Filters Card */}
        <div className="card" style={{ padding: "1rem 1.25rem" }}>
          <form
            onSubmit={handleSearchSubmit}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              alignItems: "center",
            }}
          >
            {/* Search Query */}
            <div style={{ position: "relative", flex: "1 1 240px" }}>
              <input
                type="text"
                className="form-input"
                placeholder="Search audit reason, entity ID, or action..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: "2.125rem" }}
              />
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: "0.75rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-muted)",
                }}
              />
            </div>

            {/* Entity Filter */}
            <select
              className="form-select"
              value={selectedEntity}
              onChange={(e) => setSelectedEntity(e.target.value)}
              style={{ flex: "0 1 180px" }}
            >
              <option value="ALL">All Entity Types</option>
              <option value="inventory">Inventory & Batches</option>
              <option value="prescription">Prescriptions & Rx</option>
              <option value="sale">Sales & POS</option>
              <option value="shelf">Shelves & Planogram</option>
              <option value="purchase">Purchases & Inward</option>
              <option value="expense">Operating Expenses</option>
            </select>

            {/* Action Filter */}
            <select
              className="form-select"
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              style={{ flex: "0 1 200px" }}
            >
              <option value="ALL">All Action Codes</option>
              <option value="MANUAL_ADJUSTMENT">MANUAL_ADJUSTMENT</option>
              <option value="PRESCRIPTION_VERIFY">PRESCRIPTION_VERIFY</option>
              <option value="PRESCRIPTION_UPLOAD">PRESCRIPTION_UPLOAD</option>
              <option value="PRESCRIPTION_ACCESS">PRESCRIPTION_ACCESS</option>
              <option value="SALE_RETURN">SALE_RETURN</option>
              <option value="CYCLE_COUNT_RECONCILE">CYCLE_COUNT_RECONCILE</option>
              <option value="PRICE_OVERRIDE">PRICE_OVERRIDE</option>
            </select>

            {/* Start Date */}
            <input
              type="date"
              className="form-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ flex: "0 1 140px" }}
              title="Start Date"
            />

            {/* End Date */}
            <input
              type="date"
              className="form-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ flex: "0 1 140px" }}
              title="End Date"
            />

            {/* Filter & Reset Buttons */}
            <button type="submit" className="btn btn-primary" style={{ padding: "0 1rem" }}>
              Filter
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              className="btn btn-secondary"
              style={{ padding: "0 0.875rem" }}
            >
              Reset
            </button>
          </form>
        </div>

        {/* Audit Event Table */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "1rem 1.25rem",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Audit Event Ledger
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                Showing {logs.length} of {totalCount} records (Page {currentPage} of {totalPages})
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: "4rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
              Loading immutable audit records...
            </div>
          ) : logs.length === 0 ? (
            <div style={{ padding: "4rem", textAlign: "center" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  backgroundColor: "var(--bg-surface-elevated)",
                  margin: "0 auto 0.75rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-muted)",
                }}
              >
                <CheckCircle2 size={22} />
              </div>
              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.25rem" }}>
                No Audit Records Found
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                No events match the current search or date range filters.
              </div>
            </div>
          ) : (
            <div className="table-container" style={{ border: "none", borderRadius: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp (IST)</th>
                    <th>Action Code</th>
                    <th>Target Entity</th>
                    <th>Operational Justification / Reason</th>
                    <th>Actor</th>
                    <th>Client IP</th>
                    <th style={{ textAlign: "right" }}>State Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const formattedDate = new Date(log.created_at).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    });

                    return (
                      <tr key={log.id}>
                        <td style={{ fontFamily: "monospace", fontSize: "0.75rem", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
                          {formattedDate}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {renderActionBadge(log.action)}
                        </td>
                        <td style={{ whiteSpace: "nowrap", fontFamily: "monospace", fontSize: "0.75rem" }}>
                          <span style={{ fontSize: "0.625rem", textTransform: "uppercase", color: "var(--text-muted)", display: "block", fontFamily: "var(--font-inter)" }}>
                            {log.entity_type}
                          </span>
                          <strong style={{ color: "var(--text-primary)" }}>#{log.entity_id}</strong>
                        </td>
                        <td style={{ maxWidth: "360px", color: "var(--text-primary)", lineHeight: 1.4 }}>
                          {log.reason}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{log.user_name}</div>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                            {log.user_role}
                          </div>
                        </td>
                        <td style={{ whiteSpace: "nowrap", fontFamily: "monospace", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {log.ip_address || "Internal / System"}
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <button
                            onClick={() => setSelectedLog(log)}
                            className="btn btn-secondary"
                            style={{
                              height: "28px",
                              padding: "0 0.5rem",
                              fontSize: "0.6875rem",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                            }}
                            title="Inspect JSON state diff"
                          >
                            <Eye size={12} />
                            <span>Diff</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div
              style={{
                padding: "0.875rem 1.25rem",
                borderTop: "1px solid var(--border-subtle)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: "var(--bg-surface)",
              }}
            >
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                Page {currentPage} of {totalPages} ({totalCount} total entries)
              </span>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  disabled={currentPage <= 1}
                  onClick={() => fetchAuditData(currentPage - 1)}
                  className="btn btn-secondary"
                  style={{ height: "30px", padding: "0 0.625rem", fontSize: "0.75rem" }}
                >
                  <ChevronLeft size={13} />
                  <span>Previous</span>
                </button>

                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => fetchAuditData(currentPage + 1)}
                  className="btn btn-secondary"
                  style={{ height: "30px", padding: "0 0.625rem", fontSize: "0.75rem" }}
                >
                  <span>Next</span>
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: State Diff Inspector */}
      {selectedLog && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: "680px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <CheckCircle2 size={18} />
                <div>
                  <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Audit Log #{selectedLog.id}: {selectedLog.action}
                  </h2>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    {selectedLog.entity_type} #{selectedLog.entity_id} • Recorded {selectedLog.created_at}
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedLog(null)} className="btn-icon">
                <X size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ gap: "1rem" }}>
              {/* Context row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: "0.75rem",
                  padding: "0.75rem",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  fontSize: "0.75rem",
                }}
              >
                <div>
                  <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", display: "block" }}>Actor</span>
                  <strong style={{ color: "var(--text-primary)" }}>{selectedLog.user_name}</strong>
                  <span style={{ fontSize: "0.625rem", color: "var(--text-muted)", textTransform: "uppercase", display: "block" }}>
                    {selectedLog.user_role}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", display: "block" }}>IP Address</span>
                  <span style={{ fontFamily: "monospace", color: "var(--text-primary)" }}>{selectedLog.ip_address || "N/A"}</span>
                </div>
                <div>
                  <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", display: "block" }}>Store ID</span>
                  <strong style={{ color: "var(--text-primary)" }}>Store #{selectedLog.store_id}</strong>
                </div>
              </div>

              {/* Operational Reason Callout */}
              <div
                style={{
                  padding: "0.875rem",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                }}
              >
                <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--brand-primary)", textTransform: "uppercase" }}>
                  Mandatory Operational Justification (PRD Rule 7)
                </span>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-primary)", lineHeight: 1.4 }}>
                  {selectedLog.reason}
                </p>
              </div>

              {/* State Diff Comparison */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                {/* Previous State */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                  <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--status-low-text)", textTransform: "uppercase" }}>
                    Previous State (Before)
                  </span>
                  <pre
                    style={{
                      fontFamily: "monospace",
                      fontSize: "0.6875rem",
                      padding: "0.75rem",
                      backgroundColor: "rgba(0,0,0,0.35)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--text-secondary)",
                      overflowX: "auto",
                      maxHeight: "220px",
                    }}
                  >
                    {Object.keys(selectedLog.old_values || {}).length > 0
                      ? JSON.stringify(selectedLog.old_values, null, 2)
                      : "// No prior state (New entity created)"}
                  </pre>
                </div>

                {/* Committed State */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                  <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--status-high-text)", textTransform: "uppercase" }}>
                    Committed State (After)
                  </span>
                  <pre
                    style={{
                      fontFamily: "monospace",
                      fontSize: "0.6875rem",
                      padding: "0.75rem",
                      backgroundColor: "rgba(0,0,0,0.35)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--text-primary)",
                      overflowX: "auto",
                      maxHeight: "220px",
                    }}
                  >
                    {Object.keys(selectedLog.new_values || {}).length > 0
                      ? JSON.stringify(selectedLog.new_values, null, 2)
                      : "// No state modifications"}
                  </pre>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="btn btn-primary"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
