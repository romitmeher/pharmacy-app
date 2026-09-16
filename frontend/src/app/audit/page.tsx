"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  getAuditLogs,
  getAuditSummary,
  AuditLogEntry,
  AuditSummaryMetrics,
  AuditLogFilter,
} from "@/lib/api";

export default function AuditTrailPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [metrics, setMetrics] = useState<AuditSummaryMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [entityFilter, setEntityFilter] = useState<string>("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Active expanded item for JSON diff inspection
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  useEffect(() => {
    fetchMetrics();
    fetchLogs(1);
  }, [entityFilter, actionFilter]);

  const fetchMetrics = async () => {
    try {
      const summary = await getAuditSummary();
      setMetrics(summary);
    } catch (err: any) {
      console.error("Failed to load audit metrics:", err);
    }
  };

  const fetchLogs = async (page: number) => {
    setLoading(true);
    setError(null);
    try {
      const filter: AuditLogFilter = {
        page,
        per_page: 15,
      };
      if (entityFilter) filter.entity_type = entityFilter;
      if (actionFilter) filter.action = actionFilter;
      if (searchQuery.trim()) filter.search = searchQuery.trim();

      const res = await getAuditLogs(filter);
      setLogs(res.data);
      setCurrentPage(res.pagination.page);
      setTotalPages(res.pagination.total_pages);
      setTotalCount(res.pagination.total_count);
    } catch (err: any) {
      setError(err.message || "Failed to load audit logs. Access may require OWNER or MANAGER credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs(1);
  };

  const formatActionBadge = (action: string) => {
    if (action.includes("ADJUSTMENT")) {
      return (
        <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
          {action}
        </span>
      );
    }
    if (action.includes("RECONCILE")) {
      return (
        <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          {action}
        </span>
      );
    }
    if (action.includes("TRANSFER")) {
      return (
        <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          {action}
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-700 text-slate-300 border border-slate-600">
        {action}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 p-6 md:p-10 font-sans">
      {/* Top Header */}
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs uppercase tracking-widest font-bold text-sky-400">
                Compliance & Accountability
              </span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs text-slate-400">PRD Rule 7 & 22</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              Pharmacy Audit Trail
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800">
                Immutable Ledger
              </span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Cryptographically consistent operational history tracking manual stock write-offs, cycle reconciliations, discounts, and inter-branch movements.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                fetchMetrics();
                fetchLogs(currentPage);
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg border border-slate-700 transition flex items-center gap-2"
            >
              <span>↻</span> Refresh Audit Ledger
            </button>
            <Link
              href="/"
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg shadow-lg shadow-sky-600/20 transition"
            >
              Back to Hub
            </Link>
          </div>
        </div>

        {/* Executive Metrics Overview */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Total Audit Events</span>
              <div className="text-2xl font-bold text-white mt-1">{metrics.total_audit_events}</div>
              <span className="text-xs text-slate-500 mt-0.5 block">Lifetime recorded transactions</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Events Today</span>
              <div className="text-2xl font-bold text-sky-400 mt-1">{metrics.events_today}</div>
              <span className="text-xs text-slate-500 mt-0.5 block">Since 00:00 UTC today</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Stock Adjustments (7d)</span>
              <div className="text-2xl font-bold text-amber-400 mt-1">{metrics.adjustments_last_7d}</div>
              <span className="text-xs text-slate-500 mt-0.5 block">Manual write-offs / corrections</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Shelf Reconciliations (7d)</span>
              <div className="text-2xl font-bold text-emerald-400 mt-1">{metrics.reconciliations_last_7d}</div>
              <span className="text-xs text-slate-500 mt-0.5 block">Cycle audit approvals</span>
            </div>
          </div>
        )}

        {/* Filter Toolbar */}
        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
          <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Search audit reason, entity ID, or keyword (e.g. 'damaged', 'VIP', 'breakage')..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            <select
              value={entityFilter}
              onChange={(e) => {
                setEntityFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500"
            >
              <option value="">All Entity Types</option>
              <option value="inventory">Inventory (Stock)</option>
              <option value="shelf">Shelf / Location</option>
              <option value="stock_transfer">Stock Transfer</option>
              <option value="sale">POS Sale</option>
              <option value="purchase">Distributor Purchase</option>
            </select>

            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500"
            >
              <option value="">All Actions</option>
              <option value="MANUAL_ADJUSTMENT">Manual Adjustment</option>
              <option value="CYCLE_COUNT_RECONCILE">Cycle Count Reconcile</option>
              <option value="TRANSFER_DISPATCHED">Transfer Dispatched</option>
              <option value="TRANSFER_RECEIVED">Transfer Received</option>
              <option value="DISCOUNT_APPLIED">Discount Applied</option>
            </select>

            <button
              type="submit"
              className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold rounded-lg transition"
            >
              Filter
            </button>
          </form>
        </div>

        {/* Error Notice */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-sm">
            {error}
          </div>
        )}

        {/* Audit Log Table */}
        <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-200">
              Audit Event Records ({totalCount} entries)
            </span>
            <span className="text-xs text-slate-400">
              Showing page {currentPage} of {totalPages}
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400">
              <div className="inline-block animate-spin text-2xl mb-2">⚙</div>
              <p className="text-sm">Loading verified audit log transactions...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <p className="text-sm">No audit records found matching the specified filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950/70 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Timestamp</th>
                    <th className="px-6 py-3 font-semibold">Staff & Role</th>
                    <th className="px-6 py-3 font-semibold">Action</th>
                    <th className="px-6 py-3 font-semibold">Entity Target</th>
                    <th className="px-6 py-3 font-semibold">Operational Reason</th>
                    <th className="px-6 py-3 font-semibold text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {logs.map((log) => {
                    const isExpanded = expandedLogId === log.id;
                    const dateObj = new Date(log.created_at);
                    const formattedDate = dateObj.toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    });
                    const formattedTime = dateObj.toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    });

                    return (
                      <React.Fragment key={log.id}>
                        <tr className="hover:bg-slate-800/40 transition">
                          <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-slate-400">
                            <div>{formattedDate}</div>
                            <div className="text-slate-500">{formattedTime}</div>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-medium text-slate-100">{log.user_name}</div>
                            <span className="text-xs uppercase tracking-wider text-slate-400 font-mono">
                              {log.user_role}
                            </span>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            {formatActionBadge(log.action)}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-sky-400">
                            {log.entity_type} #{log.entity_id}
                          </td>

                          <td className="px-6 py-4 text-slate-300 max-w-xs truncate">
                            {log.reason}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <button
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className="text-xs text-sky-400 hover:text-sky-300 font-medium px-2.5 py-1 rounded bg-sky-950 border border-sky-800 transition"
                            >
                              {isExpanded ? "Hide Diff" : "View Diff"}
                            </button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-slate-950/80">
                            <td colSpan={6} className="px-6 py-4">
                              <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-3">
                                <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2">
                                  <span>
                                    Audit Entry #{log.id} • IP: {log.ip_address || "Internal App Service"}
                                  </span>
                                  <span className="font-mono text-amber-400">
                                    Reason: {log.reason}
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {/* Old State */}
                                  <div className="p-3 rounded bg-slate-950 border border-rose-950/40">
                                    <span className="text-xs font-semibold text-rose-400 block mb-2">
                                      - State Before Mutation (Old Values)
                                    </span>
                                    <pre className="text-xs font-mono text-slate-300 overflow-x-auto">
                                      {JSON.stringify(log.old_values, null, 2)}
                                    </pre>
                                  </div>

                                  {/* New State */}
                                  <div className="p-3 rounded bg-slate-950 border border-emerald-950/40">
                                    <span className="text-xs font-semibold text-emerald-400 block mb-2">
                                      + State After Mutation (New Values)
                                    </span>
                                    <pre className="text-xs font-mono text-slate-300 overflow-x-auto">
                                      {JSON.stringify(log.new_values, null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination bar */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/50">
              <button
                disabled={currentPage <= 1}
                onClick={() => fetchLogs(currentPage - 1)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium rounded text-slate-300 transition"
              >
                ← Previous
              </button>

              <span className="text-xs text-slate-400">
                Page {currentPage} of {totalPages}
              </span>

              <button
                disabled={currentPage >= totalPages}
                onClick={() => fetchLogs(currentPage + 1)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium rounded text-slate-300 transition"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
