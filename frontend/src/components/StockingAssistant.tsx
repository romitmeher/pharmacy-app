"use client";
import { useRef, useState } from "react";
import { Medicine, StockingRead, StockingSearch, stockingRequest } from "@/lib/api";

interface Props {
  onClose: () => void;
  onUse: (medicine: Medicine, extracted: StockingRead["extracted"]) => void;
}

export default function StockingAssistant({ onClose, onUse }: Props) {
  const [raw, setRaw] = useState("");
  const [query, setQuery] = useState("");
  const [read, setRead] = useState<StockingRead | null>(null);
  const [results, setResults] = useState<StockingSearch | null>(null);
  const [selected, setSelected] = useState<Medicine | null>(null);
  const [identity, setIdentity] = useState({ brand_name: "", strength: "", generic_name: "", manufacturer: "", dosage_form: "tablet" });
  const [barcode, setBarcode] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [saved, setSaved] = useState<Medicine | null>(null);
  const lock = useRef(false);
  const webSequence = useRef(0);
  const [webBusy, setWebBusy] = useState(false);

  const run = async (label: string, action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(label); setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Request failed."); }
    finally { lock.current = false; setBusy(""); }
  };
  const applyRead = (data: StockingRead) => {
    webSequence.current += 1; setWebBusy(false);
    setRead(data); setRaw(data.raw_text); setResults(null); setConfirmed(false); setSelected(null);
    setBarcode(""); setSources([]);
    setQuery(data.extracted.brand_name || "");
    setIdentity({ brand_name: "", strength: data.extracted.strength || "", generic_name: "", manufacturer: "", dosage_form: "tablet" });
  };
  const imageRead = (file?: File) => {
    if (!file) return;
    void run("Reading packaging…", async () => {
      if (file.size > 8 * 1024 * 1024) throw new Error("Use an image smaller than 8 MB.");
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("Could not read image.")); reader.readAsDataURL(file);
      });
      applyRead(await stockingRequest<StockingRead>("read", { image_base64: base64 }));
    });
  };
  const chooseCatalog = (medicine: Medicine) => {
    setSelected(medicine); setConfirmed(false); setSources([]);
    setIdentity({ brand_name: medicine.brand_name, strength: medicine.strength || "", generic_name: medicine.generic_name || "",
      manufacturer: medicine.manufacturer || "", dosage_form: medicine.dosage_form || "other" });
  };
  const chooseReference = (ref: StockingSearch["references"][number]) => {
    setSelected(null); setConfirmed(false); setSources(ref.url ? [ref.url] : []);
    setIdentity({ brand_name: ref.name, strength: read?.extracted.strength || "", generic_name: ref.composition,
      manufacturer: ref.manufacturer, dosage_form: "other" });
  };

  return <div className="modal-backdrop">
    <div  role="dialog" aria-modal="true" aria-label="Stocking assistant" className="modal-content stockingassistant-1">
      <div className="modal-header"><h2>Read, search and confirm medicine</h2><button className="btn btn-secondary" onClick={onClose} disabled={!!busy}>Close</button></div>
      <div  className="modal-body stockingassistant-2">
        <p>Read the pack, correct the search words, then verify the identity. Batch, expiry, prices and quantity are reviewed in your purchase draft.</p>
        <fieldset disabled={!!busy || !!saved} className="stockingassistant-3">
          <label>Packaging photo<input type="file" accept="image/*" capture="environment" onChange={e => imageRead(e.target.files?.[0])} /></label>
          <label>Packaging text<textarea className="form-input" rows={4} maxLength={12000} value={raw} onChange={e => { setRaw(e.target.value); setRead(null); setConfirmed(false); }} /></label>
          <button className="btn btn-secondary" disabled={!raw.trim()} onClick={() => run("Reading text…", async () => applyRead(await stockingRequest<StockingRead>("read", { raw_text: raw })))}>Read pasted text</button>
          {!!read?.extracted.brand_candidates?.length && <p>Text suggestions: {read.extracted.brand_candidates.map(name => <button className="btn btn-secondary" key={name} onClick={() => setQuery(name)}>{name}</button>)}</p>}
          <form onSubmit={e => { e.preventDefault(); void run("Searching catalog…", async () => {
            const sequence = ++webSequence.current;
            setResults(await stockingRequest<StockingSearch>("search", { query, raw_text: raw, include_web: false }));
            setSelected(null); setConfirmed(false);
            setWebBusy(true);
            void stockingRequest<StockingSearch>("search", { query, raw_text: raw, include_web: true }).then(data => {
              if (sequence === webSequence.current) setResults(previous => previous ? { ...previous, web: data.web } : previous);
            }).catch(() => {
              if (sequence === webSequence.current) setError("Web search is unavailable. You can continue with local references.");
            }).finally(() => { if (sequence === webSequence.current) setWebBusy(false); });
          }); }} className="stockingassistant-4">
            <input className="form-input" aria-label="Corrected medicine search" placeholder="Correct medicine name and strength, e.g. Parawel 650" value={query} minLength={3} maxLength={120} required onChange={e => { setQuery(e.target.value); setConfirmed(false); }} />
            <button className="btn btn-primary">Search</button>
          </form>
          <small>Only these search words go to the web search provider. Packaging images and full text stay local.</small>
          {results && <>
            <h3>Store catalog</h3>
            {results.remembered && <p>Previously confirmed in your store: {results.remembered.brand_name}. Check the pack again.</p>}
            {results.catalog.map(m => <button className="btn btn-secondary" key={m.id} onClick={() => chooseCatalog(m)}>{m.brand_name} · {m.strength}</button>)}
            {!results.catalog.length && <p>No existing store medicine found. Review a reference or enter its identity below.</p>}
            <h3>Reference suggestions — verify against the pack</h3>
            {results.references.map(ref => <div key={ref.id} className="stockingassistant-5">
              <strong>{ref.name}</strong><p>{ref.composition} · {ref.manufacturer} · {ref.pack}</p>
              <button className="btn btn-secondary" onClick={() => chooseReference(ref)}>Review these details</button>{" "}
              {ref.url && <a href={ref.url} target="_blank" rel="noopener noreferrer">Open source</a>}
            </div>)}
            <h3>Web references</h3>
            {webBusy && <p role="status">Searching the web… Local results are ready to review.</p>}
            {results.web?.results.map(ref => <div key={ref.url}><a href={ref.url} target="_blank" rel="noopener noreferrer">{ref.title}</a><p>{ref.snippet}</p>
              <label><input type="checkbox" checked={sources.includes(ref.url)} onChange={e => setSources(previous => e.target.checked ? [...previous, ref.url] : previous.filter(url => url !== ref.url))} /> Record this source after reviewing it</label></div>)}
            {results.web && !results.web.results.length && <p>No relevant web results were available. Local references are still shown.</p>}
            {results.web && <a href={results.web.search_url} target="_blank" rel="noopener noreferrer">Search web directly</a>}
          </>}
          <h3>{selected ? "Selected existing medicine" : "Confirm new medicine identity"}</h3>
          {Object.entries(identity).map(([field, value]) => <label key={field}>{field.replaceAll("_", " ")}
            {field === "dosage_form" ? <select className="form-input" value={value} disabled={!!selected} onChange={e => { setIdentity({ ...identity, dosage_form: e.target.value }); setConfirmed(false); }}>
              {["tablet", "capsule", "syrup", "suspension", "injection", "cream", "ointment", "gel", "drops", "inhaler", "powder", "suppository", "patch", "spray", "lotion", "solution", "other"].map(form => <option key={form}>{form}</option>)}
            </select> : <input className="form-input" value={value} readOnly={!!selected} maxLength={field === "strength" ? 100 : 300} onChange={e => { setIdentity({ ...identity, [field]: e.target.value }); setConfirmed(false); }} />}
          </label>)}
          {selected && <button className="btn btn-secondary" onClick={() => { setSelected(null); setConfirmed(false); }}>Enter a different medicine</button>}
          <label>Barcode (optional)<input className="form-input" value={barcode} maxLength={64} onChange={e => { setBarcode(e.target.value); setConfirmed(false); }} placeholder="Scan or type the product barcode" /></label>
          <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> I checked the medicine, strength and pack against the physical product.</label>
          <button className="btn btn-primary" disabled={!confirmed || !identity.brand_name.trim() || (!selected && !identity.strength.trim())} onClick={() => run("Saving confirmed identity…", async () => {
            const result = await stockingRequest<{ medicine: Medicine; learning_saved: boolean }>("confirm", {
              confirmed, medicine_id: selected?.id, medicine: identity, barcode: barcode.trim(), query: query || identity.brand_name,
              raw_text: raw, source_urls: sources,
            });
            setSaved(result.medicine);
            if (!result.learning_saved) setError("Medicine saved, but correction memory could not be updated. You can still continue.");
          })}>Save verified medicine</button>
        </fieldset>
        {busy && <p role="status">{busy}</p>}
        {error && <p role="alert" className="stockingassistant-6">{error}</p>}
        {saved && <><p>Saved {saved.brand_name}. Your store will reuse this confirmed match for future searches. This does not retrain the neural model automatically.</p>
          <button className="btn btn-primary" onClick={() => onUse(saved, read?.extracted || {})}>Use in purchase draft</button></>}
      </div>
    </div>
  </div>;
}
