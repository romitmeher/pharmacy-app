'use client';

import { Children, useRef, useState, useEffect, cloneElement, isValidElement, type ReactNode, type ReactElement, type HTMLAttributes, type Ref } from 'react';
import { flushSync } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';

/** Presentation adapter for existing tables. Row contents and action handlers stay unchanged. */
export default function LargeTableBody({ children }: { children: ReactNode }) {
  'use no memo';
  const body = useRef<HTMLTableSectionElement>(null);
  const rows = Children.toArray(children);
  const [printing, setPrinting] = useState(false);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  useEffect(() => { setScrollElement(body.current?.closest('.table-container') as HTMLElement | null); }, [rows.length]);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before); window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);
  const large = rows.length > 50 && !!scrollElement && !printing;
  // This adapter opts out of compiler memoization for TanStack mutable instances.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scrollElement, estimateSize: () => 64, overscan: 6, enabled: large });
  if (!large) return <tbody ref={body}>{children}</tbody>;
  const items = virtual.getVirtualItems();
  const firstRow = rows[0];
  const columnCount = isValidElement<{ children?: ReactNode }>(firstRow) ? Math.max(1, Children.count(firstRow.props.children)) : 1;
  const first = items[0]?.start ?? 0;
  const last = items[items.length - 1]?.end ?? 0;
  return <tbody ref={body}>
    {first > 0 && <tr aria-hidden="true"><td colSpan={columnCount} style={{ height: first, padding: 0, border: 0 }} /></tr>}
    {items.map(item => { const row = rows[item.index]; return <MeasuredRow key={isValidElement(row) ? row.key ?? item.key : item.key} index={item.index} measure={virtual.measureElement}>{row}</MeasuredRow>; })}
    {virtual.getTotalSize() > last && <tr aria-hidden="true"><td colSpan={columnCount} style={{ height: virtual.getTotalSize() - last, padding: 0, border: 0 }} /></tr>}
  </tbody>;
}

function MeasuredRow({ children, index, measure }: { children: ReactNode; index: number; measure: (element: Element | null) => void }) {
  if (!isValidElement(children)) return null;
  return cloneElement(children as ReactElement<HTMLAttributes<HTMLTableRowElement> & { ref?: Ref<HTMLTableRowElement>; 'data-index'?: number }>, { ref: measure, 'data-index': index });
}
