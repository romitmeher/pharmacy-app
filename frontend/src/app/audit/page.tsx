"use client";
import "./presentation.css";
import { VirtualTableBody } from "@/components/ui/VirtualTableBody";

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
    void Promise.resolve().then(() => fetchAuditData(1));
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
    <div className="audit-1">
      {/* Header — 64px height seam matching sidebar */}
      <header className="page-header">
        <div>
          <div className="audit-2">
            <h1 className="page-title">Audit Trail & Regulatory Governance</h1>
            <span  className="status-badge high audit-3">
              PRD Rule 7 & 22
            </span>
          </div>
          <p className="page-subtitle">
            Immutable operational event records for Drug Control Department inspections • Store #1
          </p>
        </div>

        <div className="audit-4">
          <ThemeToggle />
          <button
            onClick={handleExportCSV}
            disabled={logs.length === 0}
            
            className="btn btn-secondary audit-5"
          >
            <Download size={14} />
            <span>Export visible logs (CSV)</span>
          </button>

          <button
            onClick={() => fetchAuditData(currentPage)}
            disabled={refreshing}
            
            className="btn btn-secondary audit-6"
            title="Refresh logs" aria-label="Refresh"
          >
            <RefreshCw size={14} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div  className="page-body audit-7">
        {/* Metric Cards Grid */}
        <div
          className="audit-8"
        >
          {/* Total Events */}
          <div  className="card audit-9">
            <div className="audit-10">
              <span className="audit-11">
                Total Audit Events
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle2 size={12} /></span>
                <span>Committed</span>
              </span>
            </div>
            <div className="audit-12">
              {metrics?.total_audit_events ?? totalCount}
            </div>
            <div className="audit-13">
              Immutable records committed to DB
            </div>
          </div>

          {/* Events Today */}
          <div  className="card audit-14">
            <div className="audit-15">
              <span className="audit-16">
                Events Today
              </span>
              <span className="status-badge info">
                <span className="badge-icon"><Clock size={12} /></span>
                <span>Active Shift</span>
              </span>
            </div>
            <div className="audit-17">
              {metrics?.events_today ?? 0}
            </div>
            <div className="audit-18">
              Operational changes logged today
            </div>
          </div>

          {/* Stock Adjustments (7d) */}
          <div  className="card audit-19">
            <div className="audit-20">
              <span className="audit-21">
                Stock Adjustments (7d)
              </span>
              <span className="status-badge med">
                <span className="badge-icon"><Package size={12} /></span>
                <span>Overrides</span>
              </span>
            </div>
            <div className="audit-22">
              {metrics?.adjustments_last_7d ?? 0}
            </div>
            <div className="audit-23">
              Physical counts & manual adjustments
            </div>
          </div>

          {/* Reconciliations (7d) */}
          <div  className="card audit-24">
            <div className="audit-25">
              <span className="audit-26">
                Cycle Reconciliations (7d)
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><Activity size={12} /></span>
                <span>Reconciled</span>
              </span>
            </div>
            <div className="audit-27">
              {metrics?.reconciliations_last_7d ?? 0}
            </div>
            <div className="audit-28">
              Shelf cycle counts authorized by staff
            </div>
          </div>
        </div>

        {/* Search & Filters Card */}
        <div  className="card audit-29">
          <form
            onSubmit={handleSearchSubmit}
            className="audit-30"
          >
            {/* Search Query */}
            <div className="audit-31">
              <input
                type="text"
                
                placeholder="Search audit reason, entity ID, or action..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="form-input audit-32"
              />
              <Search
                size={14}
                className="audit-33"
              />
            </div>

            {/* Entity Filter */}
            <select
              
              value={selectedEntity}
              onChange={(e) => setSelectedEntity(e.target.value)}
              className="form-select audit-34"
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
              
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="form-select audit-35"
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
              
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="form-input audit-36"
              title="Start Date"
            />

            {/* End Date */}
            <input
              type="date"
              
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="form-input audit-37"
              title="End Date"
            />

            {/* Filter & Reset Buttons */}
            <button type="submit"  className="btn btn-primary audit-38">
              Filter
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              
              className="btn btn-secondary audit-39"
            >
              Reset
            </button>
          </form>
        </div>

        {/* Audit Event Table */}
        <div  className="card audit-40">
          <div
            className="audit-41"
          >
            <div>
              <div className="audit-42">
                Audit Event Ledger
              </div>
              <div className="audit-43">
                Showing {logs.length} of {totalCount} records (Page {currentPage} of {totalPages})
              </div>
            </div>
          </div>

          {loading ? (
            <div className="audit-44">
              Loading immutable audit records...
            </div>
          ) : logs.length === 0 ? (
            <div className="audit-45">
              <div
                className="audit-46"
              >
                <CheckCircle2 size={22} />
              </div>
              <div className="audit-47">
                No Audit Records Found
              </div>
              <div className="audit-48">
                No events match the current search or date range filters.
              </div>
            </div>
          ) : (
            <div  className="table-container audit-49">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp (IST)</th>
                    <th>Action Code</th>
                    <th>Target Entity</th>
                    <th>Operational Justification / Reason</th>
                    <th>Actor</th>
                    <th>Client IP</th>
                    <th className="audit-50">State Diff</th>
                  </tr>
                </thead>
                <VirtualTableBody>
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
                        <td className="audit-51">
                          {formattedDate}
                        </td>
                        <td className="audit-52">
                          {renderActionBadge(log.action)}
                        </td>
                        <td className="audit-53">
                          <span className="audit-54">
                            {log.entity_type}
                          </span>
                          <strong className="audit-55">#{log.entity_id}</strong>
                        </td>
                        <td className="audit-56">
                          {log.reason}
                        </td>
                        <td className="audit-57">
                          <div className="audit-58">{log.user_name}</div>
                          <div className="audit-59">
                            {log.user_role}
                          </div>
                        </td>
                        <td className="audit-60">
                          {log.ip_address || "Internal / System"}
                        </td>
                        <td className="audit-61">
                          <button
                            onClick={() => setSelectedLog(log)}
                            
                            className="btn btn-secondary audit-62"
                            title="Inspect JSON state diff"
                          >
                            <Eye size={12} />
                            <span>Diff</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </VirtualTableBody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div
              className="audit-63"
            >
              <span className="audit-64">
                Page {currentPage} of {totalPages} ({totalCount} total entries)
              </span>

              <div className="audit-65">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => fetchAuditData(currentPage - 1)}
                  
                  className="btn btn-secondary audit-66"
                >
                  <ChevronLeft size={13} />
                  <span>Previous</span>
                </button>

                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => fetchAuditData(currentPage + 1)}
                  
                  className="btn btn-secondary audit-67"
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
          <div  className="modal-content audit-68">
            <div className="modal-header">
              <div className="audit-69">
                <CheckCircle2 size={18} />
                <div>
                  <h2 className="audit-70">
                    Audit Log #{selectedLog.id}: {selectedLog.action}
                  </h2>
                  <div className="audit-71">
                    {selectedLog.entity_type} #{selectedLog.entity_id} • Recorded {selectedLog.created_at}
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedLog(null)} className="btn-icon" aria-label="Close dialog">
                <X size={16} />
              </button>
            </div>

            <div  className="modal-body audit-72">
              {/* Context row */}
              <div
                className="audit-73"
              >
                <div>
                  <span className="audit-74">Actor</span>
                  <strong className="audit-75">{selectedLog.user_name}</strong>
                  <span className="audit-76">
                    {selectedLog.user_role}
                  </span>
                </div>
                <div>
                  <span className="audit-77">IP Address</span>
                  <span className="audit-78">{selectedLog.ip_address || "N/A"}</span>
                </div>
                <div>
                  <span className="audit-79">Store ID</span>
                  <strong className="audit-80">Store #{selectedLog.store_id}</strong>
                </div>
              </div>

              {/* Operational Reason Callout */}
              <div
                className="audit-81"
              >
                <span className="audit-82">
                  Mandatory Operational Justification (PRD Rule 7)
                </span>
                <p className="audit-83">
                  {selectedLog.reason}
                </p>
              </div>

              {/* State Diff Comparison */}
              <div className="audit-84">
                {/* Previous State */}
                <div className="audit-85">
                  <span className="audit-86">
                    Previous State (Before)
                  </span>
                  <pre
                    className="audit-87"
                  >
                    {Object.keys(selectedLog.old_values || {}).length > 0
                      ? JSON.stringify(selectedLog.old_values, null, 2)
                      : "// No prior state (New entity created)"}
                  </pre>
                </div>

                {/* Committed State */}
                <div className="audit-88">
                  <span className="audit-89">
                    Committed State (After)
                  </span>
                  <pre
                    className="audit-90"
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
