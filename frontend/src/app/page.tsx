"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import './operations.css';
import { Button, StatCard, StatusBadge, Skeleton, EmptyState } from '@/components/ui/primitives';

import { CountUp } from "@/components/ui/CountUp";
import ThemeToggle from "@/components/ThemeToggle";
import {
  getSales,
  getBatches,
  getExpiryReport,
  getPurchases,
  getStockOutRisks,
  getReorderRecommendations,
  createReorderDraftPO,
  StockOutPredictionItem,
  ReorderRecommendationItem,
  SaleReceipt,
} from "@/lib/api";

export default function DashboardPage() {
  const currentDate = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // Real Database Metrics State
  const [todaySalesCount, setTodaySalesCount] = useState<number>(0);
  const [lowStockCount, setLowStockCount] = useState<number>(0);
  const [criticalExpiryCount, setCriticalExpiryCount] = useState<number>(0);
  const [pendingDraftsCount, setPendingDraftsCount] = useState<number>(0);
  const [loadingMetrics, setLoadingMetrics] = useState<boolean>(true);
  const [recentSales, setRecentSales] = useState<SaleReceipt[]>([]);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  // ML Intelligence State (PRD Phase 5 & Rules 17 & 18)
  const [stockOutRisks, setStockOutRisks] = useState<StockOutPredictionItem[]>([]);
  const [reorderRecs, setReorderRecs] = useState<ReorderRecommendationItem[]>([]);
  const [loadingMl, setLoadingMl] = useState<boolean>(true);

  const [isSubmitting, startTransition] = useTransition();
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadDashboardData = async () => {
    setLoadingMetrics(true);
    setLoadingMl(true);
    setDashboardError(null);
    try {
      const [salesRes, batchRes, expiryRes, purchaseRes, stockOutRes, reorderRes] =
        await Promise.all([
          getSales({ per_page: 50 }),
          getBatches({ has_stock: true }),
          getExpiryReport({ days: 30 }),
          getPurchases({ status: "draft" }),
          getStockOutRisks(10),
          getReorderRecommendations(10),
        ]);

      setRecentSales(salesRes.items || []);
      setTodaySalesCount(salesRes.total || (salesRes.items || []).length);
      setPendingDraftsCount(purchaseRes.total || (purchaseRes.items || []).length);
      setCriticalExpiryCount((expiryRes.summary?.critical || 0) + (expiryRes.summary?.expired || 0));

      // Low stock = batches with total_available <= 10
      const lowStockBatches = (batchRes.batches || []).filter(
        (b) => b.total_available <= 10
      );
      setLowStockCount(lowStockBatches.length);

      // ML Insights
      setStockOutRisks(stockOutRes.predictions || []);
      setReorderRecs(reorderRes.recommendations || []);
    } catch (err: unknown) {
      setDashboardError(err instanceof Error ? err.message : "Dashboard data could not load.");
    } finally {
      setLoadingMetrics(false);
      setLoadingMl(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => loadDashboardData());
  }, []);

  // 1-Click ML Reorder Draft Order Generation (Reorder planning)
  const handleGenerateMlReorderPo = (rec: ReorderRecommendationItem) => {
    if (!rec.preferred_supplier_id) {
      alert("No preferred supplier configured for this medicine.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await createReorderDraftPO(
          rec.preferred_supplier_id!,
          [
            {
              medicine_id: rec.medicine_id,
              quantity: rec.recommended_order_quantity,
              purchase_rate: rec.estimated_purchase_rate || 50,
            },
          ],
          `Auto ML Reorder Recommendation: ${rec.explanation}`
        );

        setActionSuccess(
          `Draft PO #${res.invoice_number} created for ${rec.brand_name}! Pending physical verification.`
        );
        setTimeout(() => setActionSuccess(null), 4000);
      } catch (err: unknown) {
        alert((err instanceof Error ? err.message : "") || "Failed to generate reorder draft PO.");
      }
    });
  };

  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const activity = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - (6 - index));
    return { label: day.toLocaleDateString('en-IN', { weekday: 'short' }), date: day.toLocaleDateString('en-IN'), count: recentSales.filter(sale => {
      // Backend datetimes are stored in UTC; an offset-free ISO string is not local time.
      const stamp = /(?:Z|[+-]\d{2}:\d{2})$/i.test(sale.sale_date) ? sale.sale_date : `${sale.sale_date}Z`;
      return sameDay(new Date(stamp), day);
    }).length };
  });
  const maximum = Math.max(1, ...activity.map(day => day.count));
  return (
    <div className="ops-page dashboard-page">
      <header className="page-header ops-header editorial-dashboard-header"><div><p className="ops-eyebrow">THE DAILY OVERVIEW</p><h1 className="page-title">Your pharmacy,<br /><span>at a glance.</span></h1><p className="page-subtitle">{currentDate}</p></div><div className="ops-actions dashboard-hero-actions"><ThemeToggle /><Button variant="secondary" onClick={loadDashboardData} disabled={loadingMetrics}>Refresh metrics</Button><Link href="/prescriptions" className="ui-button ui-button--secondary">Prescription Scan</Link><Link href="/pos" className="ui-button">Open POS Terminal</Link></div></header>
      <div className="page-body ops-body">
        {dashboardError && <div role="alert" className="ops-alert"><strong>Dashboard data could not load.</strong><p>{dashboardError}</p><Button variant="secondary" onClick={loadDashboardData}>Retry</Button></div>}
        {actionSuccess && <div role="status" className="ops-success">{actionSuccess}</div>}
        <div className="ops-stats"><StatCard label="Sales Invoices" value={loadingMetrics || dashboardError ? '—' : <CountUp value={todaySalesCount} />} detail="Invoice total from the current sales request" /><StatCard label="Low Stock Threshold" value={loadingMetrics || dashboardError ? '—' : <CountUp value={lowStockCount} />} detail="Batches with ≤ 10 units available" /><StatCard label="Expiry in ≤ 30 Days" value={loadingMetrics || dashboardError ? '—' : <CountUp value={criticalExpiryCount} />} detail="Batches requiring supplier return" /><StatCard label="Pending Purchase Drafts" value={loadingMetrics || dashboardError ? '—' : <CountUp value={pendingDraftsCount} />} detail="Draft invoices awaiting inward check" /></div>
        <div className="dashboard-desk"><section className="ui-card ops-activity" aria-label="Recent invoice activity"><div className="ops-section-heading"><div><h2>Recent invoice activity</h2><p className="ui-hint">Last 7 days, from up to 50 most recent loaded invoices. This is not a complete sales report.</p></div><Link href="/pos" className="ops-text-link">Open billing</Link></div>{loadingMetrics ? <Skeleton label="Loading invoice activity" rows={3} /> : dashboardError ? <p className="ui-hint">Activity unavailable. Retry loading the dashboard.</p> : <><div className="ops-chart" role="img" aria-label={`Loaded invoices over the last seven days: ${activity.map(day => `${day.date}: ${day.count}`).join(', ')}`}>{activity.map(day => <div className="ops-chart-column" key={day.date} title={`${day.date}: ${day.count} loaded invoices`}><span className="ops-number">{day.count}</span><div className="ops-chart-track"><div className="ops-chart-bar" style={{ transform: `scaleY(${day.count / maximum})` }} /></div><span>{day.label}</span></div>)}</div><details className="ops-chart-data"><summary>View activity as a table</summary><table><caption>Loaded invoices only</caption><thead><tr><th scope="col">Date</th><th scope="col">Invoices</th></tr></thead><tbody>{activity.map(day => <tr key={day.date}><th scope="row">{day.date}</th><td>{day.count}</td></tr>)}</tbody></table></details></>}</section>
        <div className="ops-dashboard-columns">
          <section className="ui-card ops-panel"><div className="ops-section-heading"><h2>Stock-Out Probability Predictions</h2><StatusBadge tone="warning">Demand estimate</StatusBadge></div><p className="ui-hint">Estimates availability using stock, recent demand and supplier lead time.</p>{loadingMl ? <Skeleton label="Calculating stock-out risk probabilities" /> : dashboardError ? <p className="ui-hint">Predictions unavailable.</p> : stockOutRisks.length === 0 ? <EmptyState title="No stock-out alerts" description="All inventory items have healthy stock runways." /> : <ul className="ops-insight-list">{stockOutRisks.map(item => <li key={item.medicine_id}><div><strong>{item.brand_name}</strong><p>Stock: {item.current_stock} units • Runway: {item.runway_days} days</p></div><StatusBadge tone={item.risk_level === 'CRITICAL' || item.risk_level === 'HIGH_RISK' ? 'danger' : 'warning'}>{(item.stockout_probability_7d * 100).toFixed(0)}% Risk</StatusBadge></li>)}</ul>}</section>
          <section className="ui-card ops-panel"><div className="ops-section-heading"><h2>Smart Reorder Recommendations</h2><StatusBadge tone="success">Reorder planning</StatusBadge></div><p className="ui-hint">Forecasted Demand + Safety Stock + Lead Time - Current Inventory - Open POs.</p>{loadingMl ? <Skeleton label="Computing reorder deficit models" /> : dashboardError ? <p className="ui-hint">Recommendations unavailable.</p> : reorderRecs.length === 0 ? <EmptyState title="No urgent reorders" description="No urgent supplier reorders required right now." /> : <ul className="ops-insight-list">{reorderRecs.map(rec => <li key={rec.medicine_id}><div><strong>{rec.brand_name}</strong><p>Stock: {rec.current_stock} | Rec Order: <strong>{rec.recommended_order_quantity} units</strong></p></div><Button disabled={isSubmitting} onClick={() => handleGenerateMlReorderPo(rec)}>Draft PO</Button></li>)}</ul>}</section>
        </div>
        </div><section className="ui-card ops-panel dashboard-workflows"><div className="ops-section-heading"><h2>Daily workflows</h2><span className="ui-hint">Receiving, stock and dispensing</span></div><div className="ops-workflow-grid">{[{ href: '/inventory', title: 'Batch Inventory', description: 'FEFO tracking, locations, physical units' }, { href: '/purchases', title: 'Invoices & Verification', description: 'Distributor drafts & physical verification' }, { href: '/expiry', title: 'Expiry Protocol', description: 'Near-expiry alerts & supplier returns' }, { href: '/returns', title: 'Sales Returns', description: 'Customer credit refunds & restocking audit' }].map(link => <Link className="ops-workflow" key={link.href} href={link.href}><strong>{link.title}<span aria-hidden="true">↗</span></strong><span>{link.description}</span></Link>)}</div></section>
        <section className="ops-compliance" aria-label="Pharmacy AI & Compliance"><StatusBadge tone="neutral">Human Verification Boundary</StatusBadge><p>AI recommendations and camera scans require explicit pharmacist verification before altering database inventory.</p><p>Use the floating Copilot button to query real-time database stock, expiring batches, and alternative medicines.</p></section>
      </div>
    </div>
  );
}
