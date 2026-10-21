'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/primitives';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="screen-error" role="alert"><p className="ui-hint">Something went wrong</p><h1>This screen could not load.</h1><p>Try opening it again. Check recent invoices before repeating a payment or stock action.</p><div className="screen-error-actions"><Button onClick={reset}>Try again</Button><Link href="/" className="ui-button ui-button--secondary">Dashboard</Link></div></section>;
}
