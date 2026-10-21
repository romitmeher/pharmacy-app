"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Wallet, RefreshCw, Plus, X } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "@/context/AuthContext";
import { getExpenses, getStorePnLSummary, recordExpense, type ExpenseRecord, type PnLSummaryData } from "@/lib/api";

const categories = [
  ["rent", "Rent"], ["utilities_power", "Utilities & power"],
  ["cold_chain_maintenance", "Cold chain maintenance"], ["staff_salary", "Staff salaries"],
  ["licensing_regulatory", "Licensing & regulatory"], ["logistics_packaging", "Logistics & packaging"],
  ["marketing_promotion", "Marketing & promotion"], ["miscellaneous", "Miscellaneous"],
] as const;
const methods = ["cash", "bank_transfer", "upi", "cheque", "credit"];
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value);
const label = (value: string) => categories.find(([key]) => key === value)?.[1] ?? value.replaceAll("_", " ");
const message = (error: unknown) => error instanceof Error ? error.message : "An unexpected error occurred.";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export default function ExpensesPage() {
  const { user } = useAuth();
  const allowed = user?.role === "owner" || user?.role === "manager";
  const [items, setItems] = useState<ExpenseRecord[]>([]);
  const [pnl, setPnl] = useState<PnLSummaryData | null>(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ category: "rent", amount: "", payment_method: "bank_transfer", expense_date: "", vendor_recipient: "", receipt_reference: "", notes: "" });
  const invalidDates = Boolean(startDate && endDate && startDate > endDate);

  useEffect(() => {
    if (!allowed || invalidDates) return;
    let active = true;
    Promise.all([
      getExpenses(page, 25, category || undefined, startDate || undefined, endDate || undefined),
      getStorePnLSummary(startDate || undefined, endDate || undefined),
    ]).then(([history, summary]) => {
      if (!active) return;
      setItems(history.items);
      setTotal(history.total);
      setPages(Math.max(1, history.pages));
      setPnl(summary);
      setError(null);
    }).catch((err: unknown) => {
      if (active) setError(message(err));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [allowed, invalidDates, page, category, startDate, endDate, refresh]);

  function updateFilter(key: "category" | "start" | "end", value: string) {
    if (key === "category") setCategory(value);
    if (key === "start") setStartDate(value);
    if (key === "end") setEndDate(value);
    setPage(1);
    setLoading(true);
  }

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 99999999.99) {
      setFormError("Enter an amount greater than zero and below ₹10 crore.");
      return;
    }
    if (!form.expense_date) { setFormError("Select an expense date."); return; }
    savingRef.current = true;
    setSaving(true);
    setFormError(null);
    setSuccess(null);
    try {
      const expense = await recordExpense({ ...form, amount, vendor_recipient: form.vendor_recipient.trim(), receipt_reference: form.receipt_reference.trim(), notes: form.notes.trim() });
      setSuccess(`Expense ${expense.expense_number} recorded (${money(expense.amount)}).`);
      setShowForm(false);
      setForm({ category: "rent", amount: "", payment_method: "bank_transfer", expense_date: today(), vendor_recipient: "", receipt_reference: "", notes: "" });
      setLoading(true);
      setPage(1);
      setRefresh((value) => value + 1);
    } catch (err: unknown) {
      setFormError(message(err));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (!allowed) return <div className="page-body"><h1 className="page-title">Expenses & Profit</h1><p style={{ marginTop: "1rem" }}>Owners and managers can view financial reports and record expenses.</p></div>;

  return <div>
    <header className="page-header">
      <div><h1 className="page-title">Expenses & Profit</h1><p className="page-subtitle">Operating costs and store profit & loss</p></div>
      <ThemeToggle />
    </header>
    <div className="page-body" style={{ display: "grid", gap: "1.25rem" }}>
      {success && <p role="status" style={{ color: "var(--status-high-text)" }}>{success}</p>}
      <section className="card" aria-label="Report filters">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "end" }}>
          <label className="form-group"><span className="form-label">From date</span><input type="date" className="form-input" value={startDate} onChange={(e) => updateFilter("start", e.target.value)} /></label>
          <label className="form-group"><span className="form-label">To date</span><input type="date" className="form-input" value={endDate} onChange={(e) => updateFilter("end", e.target.value)} /></label>
          <label className="form-group"><span className="form-label">Expense category</span><select className="form-select" value={category} onChange={(e) => updateFilter("category", e.target.value)}><option value="">All categories</option>{categories.map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
          <button className="btn btn-secondary" disabled={loading || invalidDates} onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}><RefreshCw size={15} />Refresh</button>
          <button className="btn btn-primary" onClick={() => { setForm((value) => ({ ...value, expense_date: value.expense_date || today() })); setFormError(null); setShowForm(true); }}><Plus size={16} />Record expense</button>
        </div>
        {invalidDates && <p role="alert" style={{ marginTop: "0.75rem", color: "var(--status-low-text)" }}>From date must be on or before the to date.</p>}
        <p style={{ color: "var(--text-secondary)", marginTop: "0.75rem", fontSize: "0.8125rem" }}>Dates apply to both reports. Category filters expense history only. Leave dates empty for all time.</p>
      </section>
      {error && <div role="alert" className="card" style={{ color: "var(--status-low-text)" }}>{error}<button className="btn btn-secondary" style={{ marginLeft: "1rem" }} onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}>Retry</button></div>}
      {loading && !invalidDates && <p role="status">Loading financial reports…</p>}
      {!loading && !error && !invalidDates && pnl && <>
        <section aria-label="Profit and loss" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
          {[
            ["Net revenue", pnl.revenue.net_revenue], ["Cost of goods sold", pnl.cogs.total_cogs],
            ["Gross profit", pnl.cogs.gross_profit], ["Operating expenses", pnl.operating_expenses.total_expenses],
            ["Net operating profit", pnl.net_performance.net_operating_profit],
          ].map(([title, value]) => <div className="card" key={title}><h2 className="card-title">{title}</h2><p style={{ fontSize: "1.375rem", fontWeight: 700 }}>{money(Number(value))}</p></div>)}
        </section>
        <section className="card">
          <h2 className="card-title"><Wallet size={16} style={{ verticalAlign: "middle", marginRight: "0.5rem" }} />Profit & loss detail</h2>
          <dl style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.6rem", maxWidth: "650px" }}>
            <dt>Gross sales ({pnl.revenue.total_bills} bills)</dt><dd>{money(pnl.revenue.gross_sales)}</dd>
            <dt>Discounts</dt><dd>− {money(pnl.revenue.discounts)}</dd>
            <dt>Customer refunds</dt><dd>− {money(pnl.revenue.refunds)}</dd>
            <dt>Gross margin</dt><dd>{pnl.cogs.gross_margin_percentage.toFixed(2)}%</dd>
            <dt>Net operating margin</dt><dd>{pnl.net_performance.net_margin_percentage.toFixed(2)}%</dd>
          </dl>
          <h3 className="card-title" style={{ marginTop: "1.25rem" }}>Operating expense breakdown</h3>
          <dl style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.6rem", maxWidth: "650px" }}>{categories.map(([key, title]) => <div key={key} style={{ display: "contents" }}><dt>{title}</dt><dd>{money(pnl.operating_expenses.by_category[key] ?? 0)}</dd></div>)}</dl>
        </section>
        <section className="card">
          <h2 className="card-title">Expense history ({total})</h2>
          {items.length === 0 ? <p>No expenses match these filters. Record an expense to get started.</p> : <div className="table-container"><table className="data-table"><thead><tr><th>Date / reference</th><th>Category</th><th>Recipient</th><th>Payment</th><th>Amount</th><th>Receipt / notes</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.expense_date}<br /><small>{item.expense_number}</small></td><td>{label(item.category)}</td><td>{item.vendor_recipient || "—"}</td><td>{label(item.payment_method)}</td><td>{money(item.amount)}</td><td>{item.receipt_reference || "—"}{item.notes && <p style={{ marginTop: "0.25rem", maxWidth: "300px", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.notes}</p>}</td></tr>)}</tbody></table></div>}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "1rem" }}>
            <button className="btn btn-secondary" disabled={page <= 1} onClick={() => { setLoading(true); setPage((value) => value - 1); }}>Previous</button>
            <span>Page {page} of {pages}</span>
            <button className="btn btn-secondary" disabled={page >= pages} onClick={() => { setLoading(true); setPage((value) => value + 1); }}>Next</button>
          </div>
        </section>
      </>}
      {showForm && <section className="card" aria-labelledby="expense-form-title">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h2 id="expense-form-title" className="card-title">Record operating expense</h2><button type="button" className="btn btn-secondary" disabled={saving} aria-label="Close expense form" onClick={() => setShowForm(false)}><X size={16} /></button></div>
        {formError && <p role="alert" style={{ color: "var(--status-low-text)", marginBottom: "1rem" }}>{formError}</p>}
        <form onSubmit={submitExpense} style={{ display: "grid", gap: "1rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
            <label className="form-group"><span className="form-label">Category</span><select className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
            <label className="form-group"><span className="form-label">Amount (₹)</span><input className="form-input" type="number" required min="0.01" max="99999999.99" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
            <label className="form-group"><span className="form-label">Expense date</span><input className="form-input" type="date" required value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></label>
            <label className="form-group"><span className="form-label">Payment method</span><select className="form-select" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>{methods.map((method) => <option key={method} value={method}>{label(method)}</option>)}</select></label>
            <label className="form-group"><span className="form-label">Vendor / recipient</span><input className="form-input" maxLength={200} value={form.vendor_recipient} onChange={(e) => setForm({ ...form, vendor_recipient: e.target.value })} /></label>
            <label className="form-group"><span className="form-label">Receipt reference</span><input className="form-input" maxLength={100} value={form.receipt_reference} onChange={(e) => setForm({ ...form, receipt_reference: e.target.value })} /></label>
          </div>
          <label className="form-group"><span className="form-label">Notes</span><textarea className="form-textarea" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Recorded expenses are included in your store’s profit report and audit trail.</p>
          <button className="btn btn-primary" disabled={saving} type="submit" style={{ justifySelf: "start" }}>{saving ? "Recording…" : "Record expense"}</button>
        </form>
      </section>}
    </div>
  </div>;
}
