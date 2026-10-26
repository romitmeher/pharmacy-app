'use client';

import { memo, useEffect, useId, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Medicine } from '@/lib/api';
import { Button, StatusBadge } from './ui/primitives';

/** POS has no sortable columns: virtualize the existing array without building a second row model. */
export default function POSCatalog({ medicines, stock, selectedId, onAdd, disabled, empty }: { medicines: Medicine[]; stock: Map<number, number>; selectedId?: number; onAdd: (medicine: Medicine) => boolean; disabled: boolean; empty: string }) {
  'use no memo';
  const parent = useRef<HTMLDivElement>(null);
  const headerId = useId();
  const large = medicines.length > 50;
  // TanStack's mutable instance is intentionally outside compiler memoization.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtual = useVirtualizer({ count: medicines.length, getScrollElement: () => parent.current, estimateSize: () => 64, overscan: 6, enabled: large });
  const index = selectedId === undefined ? -1 : medicines.findIndex(medicine => medicine.id === selectedId);
  useEffect(() => {
    if (index < 0) return;
    if (large) virtual.scrollToIndex(index, { align: 'auto' });
    else {
      const container = parent.current; const row = container?.querySelector('[data-selected="true"]');
      if (!container || !row) return;
      const bounds = container.getBoundingClientRect(); const selected = row.getBoundingClientRect();
      const header = container.querySelector('thead')?.getBoundingClientRect().height || 0;
      if (selected.bottom > bounds.bottom) container.scrollTop += selected.bottom - bounds.bottom;
      else if (selected.top < bounds.top + header) container.scrollTop += selected.top - bounds.top - header;
    }
  }, [index, large, virtual]);
  const items = large ? virtual.getVirtualItems() : medicines.map((_, index) => ({ index, start: index * 64, end: (index + 1) * 64 }));
  const top = items[0]?.start || 0; const bottom = large ? Math.max(0, virtual.getTotalSize() - (items[items.length - 1]?.end || 0)) : 0;
  return <div className="ui-table-scroll pos-catalog-scroll" ref={parent} tabIndex={0} role="region" aria-label="Stocked medicines"><table className="ui-table pos-catalog-table" role="table" aria-rowcount={medicines.length + 1}><caption className="ui-sr-only">Stocked medicines</caption><colgroup><col /><col className="pos-stock-column" /><col className="pos-price-column" /><col className="pos-schedule-column" /><col className="pos-action-column" /></colgroup><thead role="rowgroup"><tr role="row">{['Medicine & Molecular Form', 'Stock Available', 'Price', 'Schedule', 'Action'].map((label,i) => <th scope="col" role="columnheader" id={`${headerId}-${i}`} key={label}>{label}</th>)}</tr></thead><tbody role="rowgroup">{top > 0 && <tr aria-hidden="true"><td colSpan={5} style={{ height: top, padding: 0 }} /></tr>}{items.map(item => { const medicine = medicines[item.index]; return <CatalogRow key={medicine.id} headerId={headerId} medicine={medicine} stock={stock.get(medicine.id) || 0} selected={medicine.id === selectedId} disabled={disabled} onAdd={onAdd} index={item.index} measure={large ? virtual.measureElement : undefined} />; })}{bottom > 0 && <tr aria-hidden="true"><td colSpan={5} style={{ height: bottom, padding: 0 }} /></tr>}{!medicines.length && <tr><td colSpan={5}>{empty}</td></tr>}</tbody></table></div>;
}

const CatalogRow = memo(function CatalogRow({ medicine, stock, selected, disabled, onAdd, index, measure, headerId }: { medicine: Medicine; stock: number; selected: boolean; disabled: boolean; onAdd: (medicine: Medicine) => boolean; index: number; measure?: (element: Element | null) => void; headerId: string }) {
  return <tr ref={measure} role="row" aria-rowindex={index+2} data-index={index} data-selected={selected ? 'true' : undefined}><td role="cell" headers={`${headerId}-0`}><div className="pos-medicine"><strong>{medicine.brand_name}</strong><span>{medicine.generic_name || '—'} {medicine.strength ? `• ${medicine.strength}` : ''}</span></div></td><td role="cell" headers={`${headerId}-1`}><span className="pos-cell-label" aria-hidden="true">Available stock</span><StatusBadge tone={stock > 0 ? 'success' : 'danger'}>{stock > 0 ? `${stock} units` : 'Out of Stock'}</StatusBadge></td><td role="cell" headers={`${headerId}-2`}><span className="pos-cell-label" aria-hidden="true">Price</span><span className="pos-number">₹{Number(medicine.selling_price || medicine.mrp || 0).toFixed(2)}</span></td><td role="cell" headers={`${headerId}-3`}><span className="pos-cell-label" aria-hidden="true">Schedule</span><StatusBadge tone={medicine.is_prescription_only ? 'warning' : 'success'}>{medicine.is_prescription_only ? 'Rx Only' : 'OTC'}</StatusBadge></td><td role="cell" headers={`${headerId}-4`}><Button variant="secondary" disabled={stock <= 0 || disabled} onClick={() => onAdd(medicine)} aria-label={`Add ${medicine.brand_name}`}>Add</Button></td></tr>;
});
