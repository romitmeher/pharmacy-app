"use client";
import { Children, lazy, Suspense, type ReactNode } from 'react';
const LargeTableBody = lazy(() => import('./LargeTableBody'));
/** Paginated tables do not load the virtualization engine until more than 50 rows exist. */
export function VirtualTableBody({ children }: { children: ReactNode }) {
  if (Children.count(children) <= 50) return <tbody>{children}</tbody>;
  return <Suspense fallback={<tbody><tr><td colSpan={20}><span role="status">Preparing large table…</span></td></tr></tbody>}><LargeTableBody>{children}</LargeTableBody></Suspense>;
}
