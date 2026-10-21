'use client';

import { useRef, useState, useEffect, useSyncExternalStore, memo, type CSSProperties } from 'react';
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState, type Row } from '@tanstack/react-table';
import { flushSync } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';

function subscribeDensity(notify: () => void) {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-density'] });
  return () => observer.disconnect();
}
function densitySnapshot() { return document.documentElement.dataset.density === 'compact'; }
function defaultDensity() { return false; }

export function DataTable<T>({ data, columns, getRowId, label, compact, activeRowId, empty = 'No results found.' }: { data: T[]; columns: ColumnDef<T, unknown>[]; getRowId: (row: T) => string; label: string; compact?: boolean; activeRowId?: string; empty?: string }) {
  'use no memo';
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true)); const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before); window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);
  const [sorting, setSorting] = useState<SortingState>([]); const parent = useRef<HTMLDivElement>(null);
  // This component explicitly opts out of compiler memoization for TanStack mutable instances.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data, columns, getRowId, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });
  const savedCompact = useSyncExternalStore(subscribeDensity, densitySnapshot, defaultDensity);
  const rows = table.getRowModel().rows; const height = (compact ?? savedCompact) ? 36 : 48;
  const large = rows.length > 50 && !printing;
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => parent.current, estimateSize: () => height, overscan: 8, enabled: large });
  const selectedIndex = activeRowId ? rows.findIndex(row => row.id === activeRowId) : -1;
  useEffect(() => {
    if (selectedIndex < 0) return;
    if (large) virtual.scrollToIndex(selectedIndex, { align: 'auto' });
    else {
      const container = parent.current;
      const selected = container?.querySelector('[data-selected="true"]');
      if (!container || !selected) return;
      const bounds = container.getBoundingClientRect();
      const rowBounds = selected.getBoundingClientRect();
      const headerHeight = container.querySelector('thead')?.getBoundingClientRect().height || 0;
      if (rowBounds.bottom > bounds.bottom) container.scrollTop += rowBounds.bottom - bounds.bottom;
      else if (rowBounds.top < bounds.top + headerHeight) container.scrollTop += rowBounds.top - bounds.top - headerHeight;
    }
  }, [selectedIndex, rows.length, large, virtual]);
  const items = large ? virtual.getVirtualItems() : rows.map((_, index) => ({ index, start: index * height, end: (index + 1) * height }));
  const top = items[0]?.start ?? 0; const bottom = items.length ? Math.max(0, virtual.getTotalSize() - items[items.length - 1].end) : 0;
  return <div ref={parent} className="ui-table-scroll" tabIndex={0} role="region" aria-label={label} style={{ '--row-height': `${height}px` } as CSSProperties}><table className="ui-table"><caption className="ui-sr-only">{label}</caption><thead>{table.getHeaderGroups().map(group => <tr key={group.id}>{group.headers.map(header => <th key={header.id} scope="col" aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : undefined}>{header.isPlaceholder ? null : header.column.getCanSort() ? <button type="button" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}<span aria-hidden="true">{header.column.getIsSorted() === 'asc' ? ' ↑' : header.column.getIsSorted() === 'desc' ? ' ↓' : ' ↕'}</span></button> : flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead><tbody>{top > 0 && <tr aria-hidden="true"><td colSpan={columns.length} style={{ height: top, padding: 0 }} /></tr>}{items.map(item => <MemoTableRow key={rows[item.index].id} row={rows[item.index]} index={item.index} selected={rows[item.index].id === activeRowId} measure={large ? virtual.measureElement : undefined} />)}{large && bottom > 0 && <tr aria-hidden="true"><td colSpan={columns.length} style={{ height: bottom, padding: 0 }} /></tr>}{!rows.length && <tr><td colSpan={columns.length}>{empty}</td></tr>}</tbody></table></div>;
}

const MemoTableRow = memo(function TableRow<T>({ row, index, selected, measure }: { row: Row<T>; index: number; selected: boolean; measure?: (element: Element | null) => void }) {
  return <tr ref={measure} data-index={index} data-selected={selected ? 'true' : undefined}>{row.getVisibleCells().map(cell => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>;
});
