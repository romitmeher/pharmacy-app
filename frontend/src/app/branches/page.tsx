"use client";
import "./presentation.css";
import { VirtualTableBody } from "@/components/ui/VirtualTableBody";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Plus, RefreshCw } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "@/context/AuthContext";
import {
  getNetworkStores, listStockTransfers, getBatches, getLocations,
  createStockTransfer, dispatchStockTransfer, receiveStockTransfer, getCrossStoreStock, getAuthToken,
  type NetworkStore, type StockTransferData, type BatchItem, type PhysicalLocation, type CrossStoreStockResponse,
} from "@/lib/api";

const errorText = (error: unknown) => error instanceof Error ? error.message : "Unable to complete this operation.";
const localDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
type DraftLine = { batchId: string; quantity: string };

export default function BranchesPage() {
  const { user } = useAuth();
  const allowed = user?.role === "owner" || user?.role === "manager";
  const [stores, setStores] = useState<NetworkStore[]>([]);
  const [transfers, setTransfers] = useState<StockTransferData[]>([]);
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [locations, setLocations] = useState<PhysicalLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ batchId: "", quantity: "1" }]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [actionTransfer, setActionTransfer] = useState<StockTransferData | null>(null);
  const [receiveLocation, setReceiveLocation] = useState("");
  const [lookupId, setLookupId] = useState("");
  const [lookup, setLookup] = useState<CrossStoreStockResponse | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [branchForm, setBranchForm] = useState({ name: "", address: "", phone: "", gstin: "", drug_license_number: "", manager_name: "", manager_email: "", manager_username: "", manager_password: "" });
  const [branchError, setBranchError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    Promise.all([getNetworkStores(), listStockTransfers(), getBatches({ has_stock: true }), getLocations(true)])
      .then(([network, transferData, stock, shelves]) => {
        if (!active) return;
        setStores(network);
        setTransfers(transferData);
        setBatches(stock.batches);
        setLocations(shelves.locations);
        setError(null);
      }).catch((err: unknown) => { if (active) setError(errorText(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [allowed, refresh]);

  const eligibleBatches = batches.filter((batch) => batch.store_id === user?.store_id && batch.expiry_date >= localDate() && batch.total_available > 0);
  const destinations = stores.filter((store) => store.id !== user?.store_id && store.is_active);
  const name = (id: number) => stores.find((store) => store.id === id)?.name ?? `Store #${id}`;

  function reload() { setLoading(true); setRefresh((value) => value + 1); }

  async function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || !user) return;
    setError(null);
    setSuccess(null);
    if (!destinations.some((store) => store.id === Number(destination))) { setError("Select an active destination branch."); return; }
    const requested = lines.map((line) => {
      const batch = eligibleBatches.find((entry) => entry.id === Number(line.batchId));
      return { batch, quantity: Number(line.quantity) };
    });
    if (!requested.length || requested.some(({ batch, quantity }) => !batch || !Number.isInteger(quantity) || quantity <= 0 || quantity > batch.total_available)) {
      setError("Select a batch and a whole-number quantity within its available stock for every line."); return;
    }
    if (new Set(requested.map(({ batch }) => batch?.id)).size !== requested.length) { setError("Use each batch once; combine quantities on one line."); return; }
    busyRef.current = true;
    setBusy(true);
    try {
      const transfer = await createStockTransfer(user.store_id, Number(destination), requested.map(({ batch, quantity }) => ({ medicine_id: batch!.medicine_id, batch_id: batch!.id, quantity })), notes.trim() || undefined);
      setSuccess(`Draft ${transfer.transfer_number} created. Stock will move when you confirm dispatch.`);
      setLines([{ batchId: "", quantity: "1" }]);
      setNotes("");
      reload();
    } catch (err: unknown) { setError(errorText(err)); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function confirmAction() {
    if (!actionTransfer || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const transfer = actionTransfer.status === "draft"
        ? await dispatchStockTransfer(actionTransfer.id)
        : await receiveStockTransfer(actionTransfer.id, receiveLocation ? Number(receiveLocation) : undefined);
      setSuccess(`${transfer.transfer_number} is now ${transfer.status.replaceAll("_", " ")}.`);
      setActionTransfer(null);
      reload();
    } catch (err: unknown) { setError(errorText(err)); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function lookupStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lookupId || lookingUp) return;
    setLookingUp(true);
    setLookupError(null);
    setLookup(null);
    try { setLookup(await getCrossStoreStock(Number(lookupId))); }
    catch (err: unknown) { setLookupError(errorText(err)); }
    finally { setLookingUp(false); }
  }

  async function provisionBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || user?.role !== "owner") return;
    if (branchForm.manager_password.length < 8 || new TextEncoder().encode(branchForm.manager_password).length > 72) { setBranchError("Use a manager password with at least 8 characters and at most 72 UTF-8 bytes."); return; }
    busyRef.current = true;
    setBusy(true);
    setBranchError(null);
    setSuccess(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000"}/api/multibranch/stores`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ store: { name: branchForm.name.trim(), address: branchForm.address.trim(), phone: branchForm.phone.trim(), gstin: branchForm.gstin.trim(), drug_license_number: branchForm.drug_license_number.trim() }, manager: { full_name: branchForm.manager_name.trim(), email: branchForm.manager_email.trim(), username: branchForm.manager_username.trim(), password: branchForm.manager_password } }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to create branch.");
      setSuccess(`Branch ${result.data.name} created. Its manager can sign in using ${result.data.manager_email}.`);
      setBranchForm({ name: "", address: "", phone: "", gstin: "", drug_license_number: "", manager_name: "", manager_email: "", manager_username: "", manager_password: "" });
      setShowBranchForm(false);
      reload();
    } catch (err: unknown) { setBranchError(errorText(err)); }
    finally { busyRef.current = false; setBusy(false); }
  }

  if (!allowed) return <div className="page-body"><h1 className="page-title">Branches & Transfers</h1><p className="branches-1">Owners and managers can manage branch transfers.</p></div>;

  return <div>
    <header className="page-header"><div><h1 className="page-title">Branches & Transfers</h1><p className="page-subtitle">Current branch: {user ? name(user.store_id) : "—"}</p></div><ThemeToggle /></header>
    <div  className="page-body branches-2">
      {error && <p role="alert" className="branches-3">{error}</p>}
      {success && <p role="status" className="branches-4">{success}</p>}
      <div className="branches-5"><button className="btn btn-secondary" onClick={reload} disabled={loading || busy}><RefreshCw size={15} />Refresh branches & stock</button>{user?.role === "owner" && <button className="btn btn-primary" disabled={busy} onClick={() => setShowBranchForm((value) => !value)}><Plus size={15} />{showBranchForm ? "Close branch form" : "Add branch"}</button>}</div>
      {showBranchForm && user?.role === "owner" && <section className="card"><h2 className="card-title">Add branch and initial manager</h2><p className="branches-6">All branches in this installation belong to one pharmacy chain. The new manager signs in to the new branch with a unique email. Share their password directly with them.</p>
        {branchError && <p role="alert" className="branches-7">{branchError}</p>}
        <form onSubmit={provisionBranch} className="branches-8">
          <div className="branches-9">
            <label className="form-group"><span className="form-label">Branch name</span><input className="form-input" required maxLength={200} value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} /></label>
            <label className="form-group"><span className="form-label">Branch address</span><input className="form-input" maxLength={2000} value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} /></label>
            <label className="form-group"><span className="form-label">Branch phone</span><input className="form-input" type="tel" maxLength={20} value={branchForm.phone} onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })} /></label>
            <label className="form-group"><span className="form-label">GSTIN</span><input className="form-input" maxLength={15} pattern="[0-9A-Z]{15}" value={branchForm.gstin} onChange={(e) => setBranchForm({ ...branchForm, gstin: e.target.value.toUpperCase() })} /></label>
            <label className="form-group"><span className="form-label">Drug license number</span><input className="form-input" maxLength={50} value={branchForm.drug_license_number} onChange={(e) => setBranchForm({ ...branchForm, drug_license_number: e.target.value })} /></label>
            <label className="form-group"><span className="form-label">Manager full name</span><input className="form-input" required maxLength={200} value={branchForm.manager_name} onChange={(e) => setBranchForm({ ...branchForm, manager_name: e.target.value })} /></label>
            <label className="form-group"><span className="form-label">Manager login email</span><input className="form-input" type="email" autoComplete="off" required maxLength={200} value={branchForm.manager_email} onChange={(e) => setBranchForm({ ...branchForm, manager_email: e.target.value })} /></label>
            <label className="form-group"><span className="form-label">Manager username</span><input className="form-input" autoComplete="off" required maxLength={100} value={branchForm.manager_username} onChange={(e) => setBranchForm({ ...branchForm, manager_username: e.target.value })} /></label>
            <label className="form-group"><span className="form-label">Initial manager password</span><input className="form-input" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={branchForm.manager_password} onChange={(e) => setBranchForm({ ...branchForm, manager_password: e.target.value })} /></label>
          </div>
          <button  className="btn btn-primary branches-10" disabled={busy}>{busy ? "Creating…" : "Create branch & manager"}</button>
        </form>
      </section>}
      {loading ? <p role="status">Loading branches, transfers and stock…</p> : <>
        <section aria-label="Branches" className="branches-11">{stores.map((store) => <div key={store.id} className="card"><h2 className="card-title">{store.name}{store.id === user?.store_id ? " (current)" : ""}</h2><p>{store.address || "Address not set"}</p><small className="branches-12">{store.total_medicines} medicines · {store.is_active ? "Active" : "Inactive"}</small></div>)}</section>
        <section className="card">
          <h2 className="card-title">Create a transfer draft</h2>
          {destinations.length === 0 ? <p>No other active branch is available. Transfers require a second branch in the network.</p> : <form onSubmit={createDraft} className="branches-13">
            <p className="branches-14">Draft from {user ? name(user.store_id) : "your branch"}. Dispatch deducts stock at the source; the destination branch confirms physical receipt.</p>
            <label className="form-group"><span className="form-label">Destination branch</span><select required className="form-select" value={destination} onChange={(e) => setDestination(e.target.value)}><option value="">Select branch</option>{destinations.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
            {lines.map((line, index) => <div key={index} className="branches-15">
              <label  className="form-group branches-16"><span className="form-label">Batch {index + 1}</span><select required className="form-select" value={line.batchId} onChange={(e) => setLines((current) => current.map((entry, position) => position === index ? { ...entry, batchId: e.target.value } : entry))}><option value="">Select stocked batch</option>{eligibleBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.medicine?.brand_name || `Medicine #${batch.medicine_id}`} · {batch.batch_number} · {batch.total_available} available · exp {batch.expiry_date}</option>)}</select></label>
              <label className="form-group"><span className="form-label">Quantity</span><input required className="form-input" type="number" min="1" step="1" max={eligibleBatches.find((batch) => batch.id === Number(line.batchId))?.total_available} value={line.quantity} onChange={(e) => setLines((current) => current.map((entry, position) => position === index ? { ...entry, quantity: e.target.value } : entry))} /></label>
              <button type="button" className="btn btn-secondary" disabled={lines.length === 1 || busy} onClick={() => setLines((current) => current.filter((_, position) => position !== index))}>Remove line {index + 1}</button>
            </div>)}
            {eligibleBatches.length === 0 && <p>No unexpired stocked batches are available for transfer.</p>}
            <button type="button"  className="btn btn-secondary branches-17" disabled={busy || lines.length >= eligibleBatches.length} onClick={() => setLines((current) => [...current, { batchId: "", quantity: "1" }])}><Plus size={15} />Add batch</button>
            <label className="form-group"><span className="form-label">Transfer notes</span><textarea rows={2} className="form-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
            <button type="submit"  className="btn btn-primary branches-18" disabled={busy || eligibleBatches.length === 0}>{busy ? "Saving…" : "Create transfer draft"}</button>
          </form>}
        </section>
        <section className="card"><h2 className="card-title">Recent transfers</h2><p className="branches-19">Latest 50 transfers. Dispatch from the source account; receive from the destination account.</p>
          {transfers.length === 0 ? <p>No transfers yet.</p> : <div className="branches-20">{transfers.map((transfer) => <article key={transfer.id} className="branches-21">
            <h3 className="card-title">{transfer.transfer_number} · {transfer.status.replaceAll("_", " ")}</h3><p>{name(transfer.source_store_id)} <ArrowRight size={14} className="branches-22" /> {name(transfer.destination_store_id)}</p>
            <ul className="branches-23">{transfer.items.map((item) => <li key={item.id}>{item.medicine_name || `Medicine #${item.medicine_id}`} · batch {item.batch_number} · {item.quantity} units</li>)}</ul>
            {transfer.notes && <p className="branches-24">{transfer.notes}</p>}
            {transfer.status === "draft" && transfer.source_store_id === user?.store_id && <button className="btn btn-primary" disabled={busy} onClick={() => { setActionTransfer(transfer); setReceiveLocation(""); }}>Review dispatch</button>}
            {transfer.status === "in_transit" && transfer.destination_store_id === user?.store_id && <button className="btn btn-primary" disabled={busy} onClick={() => { setActionTransfer(transfer); setReceiveLocation(""); }}>Review receipt</button>}
          </article>)}</div>}
        </section>
        {actionTransfer && <section className="card" aria-labelledby="transfer-action-title"><h2 id="transfer-action-title" className="card-title">Confirm {actionTransfer.status === "draft" ? "dispatch" : "physical receipt"}: {actionTransfer.transfer_number}</h2><p className="branches-25">{actionTransfer.status === "draft" ? "Confirm these units have been packed and are leaving this branch. This deducts stock immediately." : "Confirm all listed units have arrived and been counted. This adds stock at this branch."}</p>
          {actionTransfer.status === "in_transit" && <label className="form-group"><span className="form-label">Receiving location</span><select className="form-select" value={receiveLocation} onChange={(e) => setReceiveLocation(e.target.value)}><option value="">Unassigned stock</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>}
          <div className="branches-26"><button className="btn btn-primary" disabled={busy} onClick={() => void confirmAction()}>{busy ? "Confirming…" : "Confirm stock movement"}</button><button className="btn btn-secondary" disabled={busy} onClick={() => setActionTransfer(null)}>Cancel review</button></div>
        </section>}
        <section className="card"><h2 className="card-title">Find stock across branches</h2><form onSubmit={lookupStock} className="branches-27"><label className="form-group"><span className="form-label">Medicine from this branch’s stocked catalog</span><select className="form-select" required value={lookupId} onChange={(e) => { setLookupId(e.target.value); setLookup(null); }}><option value="">Select medicine</option>{Array.from(new Map(batches.map((batch) => [batch.medicine_id, batch])).values()).map((batch) => <option key={batch.medicine_id} value={batch.medicine_id}>{batch.medicine?.brand_name || `Medicine #${batch.medicine_id}`}</option>)}</select></label><button className="btn btn-secondary" disabled={lookingUp || !lookupId}>{lookingUp ? "Looking up…" : "Find stock"}</button></form>
          {lookupError && <p role="alert" className="branches-28">{lookupError}</p>}
          {lookup && <div className="branches-29"><h3 className="card-title">{lookup.brand_name} {lookup.strength} · {lookup.total_network_stock} units in network</h3><div className="table-container"><table className="data-table"><thead><tr><th>Branch</th><th>Stock</th><th>Batches / expiry</th></tr></thead><VirtualTableBody>{lookup.stores.map((store) => <tr key={store.store_id}><td>{store.store_name}</td><td>{store.total_stock}</td><td>{store.batches.map((batch) => `${batch.batch_number}: ${batch.quantity_available} units (exp ${batch.expiry_date})`).join("; ") || "No stock"}</td></tr>)}</VirtualTableBody></table></div></div>}
        </section>
      </>}
    </div>
  </div>;
}
