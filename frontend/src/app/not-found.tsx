import Link from 'next/link';

export default function NotFound() {
  return <section className="screen-error"><p className="ui-hint">404 · Page not found</p><h1>This page is unavailable.</h1><p>Use the navigation to return to your pharmacy workspace.</p><Link href="/" className="ui-button">Back to dashboard</Link></section>;
}
