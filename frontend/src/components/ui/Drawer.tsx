'use client';
import type { ReactNode } from 'react';
import { Drawer as Vaul } from 'vaul';
import { Button } from './primitives';
export function Drawer({ open, onOpenChange, title, children, description }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: ReactNode }) {
  return <Vaul.Root open={open} onOpenChange={onOpenChange}><Vaul.Portal><Vaul.Overlay className="ui-drawer-overlay" /><Vaul.Content className="ui-drawer"><div className="ui-drawer-handle" /><Vaul.Title>{title}</Vaul.Title><Vaul.Description>{description}</Vaul.Description><div className="ui-dialog-body">{children}</div><Vaul.Close asChild><Button variant="secondary">Close</Button></Vaul.Close></Vaul.Content></Vaul.Portal></Vaul.Root>;
}
