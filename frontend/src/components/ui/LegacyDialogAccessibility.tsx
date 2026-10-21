'use client';

import { useEffect } from 'react';

/** Focus support while existing form dialogs migrate, without replacing their close/submit handlers. */
export default function LegacyDialogAccessibility() {
  useEffect(() => {
    let current: HTMLElement | null = null;
    let previous: HTMLElement | null = null;
    let scheduled = 0;
    const focusable = () => current ? Array.from(current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter(element => element.getClientRects().length > 0) : [];
    const update = () => {
      const dialogs = document.querySelectorAll<HTMLElement>('.modal-content');
      const next = dialogs.length ? dialogs[dialogs.length - 1] : null;
      if (next === current) return;
      if (current && !next && previous?.isConnected) previous.focus();
      if (!current && next) previous = document.activeElement as HTMLElement;
      current = next;
      if (!current) return;
      current.setAttribute('role', 'dialog'); current.setAttribute('aria-modal', 'true'); current.tabIndex = -1;
      const heading = current.querySelector('h2, h3');
      if (heading && !current.hasAttribute('aria-label') && !current.hasAttribute('aria-labelledby')) current.setAttribute('aria-label', heading.textContent || 'Dialog');
      const close = current.querySelector<HTMLButtonElement>('.modal-header button.btn-icon');
      if (close && !close.hasAttribute('aria-label')) close.setAttribute('aria-label', 'Close dialog');
      (focusable()[0] || current).focus();
    };
    const observer = new MutationObserver(records => {
      const dialogChanged = (current && !current.isConnected) || records.some(record => [...record.addedNodes].some(node => node instanceof Element && (node.matches('.modal-content, .modal-backdrop') || node.querySelector('.modal-content'))));
      if (dialogChanged) { cancelAnimationFrame(scheduled); scheduled = requestAnimationFrame(update); }
    });
    observer.observe(document.body, { childList: true, subtree: true }); update();
    const keydown = (event: KeyboardEvent) => {
      if (!current) return;
      if (event.key === 'Escape') { const close = current.querySelector<HTMLButtonElement>('.modal-header button.btn-icon:not(:disabled)'); if (close) { event.preventDefault(); close.click(); } }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      if (!elements.length) { event.preventDefault(); current.focus(); return; }
      const first = elements[0]; const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { observer.disconnect(); cancelAnimationFrame(scheduled); document.removeEventListener('keydown', keydown); };
  }, []);
  return null;
}
