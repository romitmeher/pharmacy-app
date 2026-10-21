'use client';

import { useEffect, useRef, useId, type ReactNode } from 'react';
import { Command } from 'cmdk';
import { Toaster } from 'sonner';
import { Button } from './primitives';
export { toast } from 'sonner';

export function ToastHost() { return <Toaster position="bottom-right" closeButton toastOptions={{ className: 'ui-toast' }} />; }
export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null); const titleId = useId();
  useEffect(() => { const dialog = ref.current; if (!dialog) return; if (open && !dialog.open) dialog.showModal(); else if (!open && dialog.open) dialog.close(); }, [open]);
  return <dialog ref={ref} className="ui-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}><header><h2 id={titleId}>{title}</h2><Button variant="quiet" onClick={onClose} aria-label="Close dialog">×</Button></header><div className="ui-dialog-body">{children}</div>{footer && <footer>{footer}</footer>}</dialog>;
}
export function ConfirmDialog({ open, title, description, confirmLabel, onConfirm, onClose, busy }: { open: boolean; title: string; description: string; confirmLabel: string; onConfirm: () => void; onClose: () => void; busy?: boolean }) {
  return <Modal open={open} onClose={() => { if (!busy) onClose(); }} title={title} footer={<><Button variant="secondary" autoFocus disabled={busy} onClick={onClose}>Cancel</Button><Button variant="danger" busy={busy} onClick={onConfirm}>{confirmLabel}</Button></>}><p>{description}</p></Modal>;
}
export { Drawer } from './Drawer';
export function CommandPalette({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  return <Command.Dialog open={open} onOpenChange={onOpenChange} label="Jump to a screen, medicine or bill" className="ui-command"><Command.Input placeholder="Search screens, medicines or bills…" /><Command.List><Command.Empty>No results found.</Command.Empty>{children}</Command.List></Command.Dialog>;
}
export const CommandItem = Command.Item;
