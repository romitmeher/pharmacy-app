'use client';

import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

export function Button({ variant = 'primary', busy, children, className = '', disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'quiet'; busy?: boolean; ref?: React.Ref<HTMLButtonElement> }) {
  return <button type="button" {...props} disabled={disabled || busy} aria-busy={busy || undefined} className={`ui-button ui-button--${variant} ${className}`}>{busy && <span className="ui-spinner" aria-hidden="true" />}{children}</button>;
}
export function Field({ label, unit, error, hint, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; unit?: string; error?: string; hint?: string }) {
  const generated = useId(); const inputId = id ?? generated;
  return <div className="ui-field"><label htmlFor={inputId}>{label}</label><div className="ui-input-wrap">{unit && <span aria-hidden="true">{unit}</span>}<input {...props} id={inputId} aria-invalid={!!error} aria-describedby={error || hint ? `${inputId}-help` : undefined} /></div>{(error || hint) && <p id={`${inputId}-help`} role={error ? 'alert' : undefined} className={error ? 'ui-error' : 'ui-hint'}>{error || hint}</p>}</div>;
}
export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';
export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: StatusTone }) {
  return <span className={`ui-badge ui-badge--${tone}`}><span aria-hidden="true">{tone === 'success' ? '✓' : tone === 'warning' || tone === 'danger' ? '!' : '○'}</span>{children}</span>;
}
export function ExpiryBadge({ label, tone }: { label: string; tone: StatusTone }) { return <StatusBadge tone={tone}>{label}</StatusBadge>; }
export function StatCard({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return <article className="ui-card ui-stat"><h2>{label}</h2><p className="ui-stat-value">{value}</p>{detail && <div className="ui-hint">{detail}</div>}</article>;
}
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="ui-empty"><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;
}
export function Skeleton({ label = 'Loading', rows = 3 }: { label?: string; rows?: number }) {
  return <div role="status" aria-label={label} className="ui-skeleton-group">{Array.from({ length: rows }, (_, i) => <div key={i} className="ui-skeleton" aria-hidden="true" />)}</div>;
}
export function QuantityStepper({ value, onChange, min = 1, max, disabled, label = 'Quantity' }: { value: number; onChange: (value: number) => void; min?: number; max?: number; disabled?: boolean; label?: string }) {
  return <div className="ui-stepper"><Button variant="quiet" aria-label={`Decrease ${label}`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>−</Button><input aria-label={label} type="number" min={min} max={max} value={value} disabled={disabled} onChange={e => { const next = e.target.valueAsNumber; if (Number.isInteger(next) && next >= min && (max === undefined || next <= max)) onChange(next); }} /><Button variant="quiet" aria-label={`Increase ${label}`} disabled={disabled || (max !== undefined && value >= max)} onClick={() => onChange(value + 1)}>+</Button></div>;
}
export function FilterBar({ children }: { children: ReactNode }) { return <div className="ui-filter-bar" role="group" aria-label="Filters">{children}</div>; }
export function DateRange({ start, end, onStartChange, onEndChange }: { start: string; end: string; onStartChange: (value: string) => void; onEndChange: (value: string) => void }) {
  return <div className="ui-date-range"><Field label="From" type="date" value={start} onChange={e => onStartChange(e.target.value)} /><Field label="To" type="date" value={end} onChange={e => onEndChange(e.target.value)} /></div>;
}
export function BatchPicker({ label = 'Batch', children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const id = useId(); return <div className="ui-field"><label htmlFor={id}>{label}</label><select {...props} id={id} className="ui-select">{children}</select></div>;
}
/** Caller supplies existing stock, search and add handlers. No medicine data is transformed. */
export function MedicineSearch<T>({ label = 'Search medicines or scan barcode', query, onQueryChange, suggestions, getKey, render, onSelect, busy }: { label?: string; query: string; onQueryChange: (query: string) => void; suggestions: T[]; getKey: (item: T) => string; render: (item: T) => ReactNode; onSelect: (item: T) => void; busy?: boolean }) {
  return <div className="ui-medicine-search"><Field label={label} type="search" value={query} onChange={e => onQueryChange(e.target.value)} autoComplete="off" />{busy && <span role="status">Searching…</span>}{suggestions.length > 0 && <ul aria-label="Medicine suggestions">{suggestions.map(item => <li key={getKey(item)}><button type="button" onClick={() => onSelect(item)}>{render(item)}</button></li>)}</ul>}</div>;
}
export function PrintDocument({ children, kind = 'invoice' }: { children: ReactNode; kind?: 'invoice' | 'receipt' }) { return <article className={`ui-print ui-print--${kind}`}>{children}</article>; }
