"use client";

import Link from "next/link";

/** Shown when a page fails to render. No technical detail is exposed; the digest correlates with server logs. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="empty" role="alert" style={{ maxWidth: 640 }}>
      <p className="empty-title">This page could not be loaded.</p>
      <p className="empty-body">The problem has been logged. Try again, or return to the overview. If it persists, contact your Asteric administrator{error.digest ? <> and quote reference <span className="mono">{error.digest}</span></> : null}.</p>
      <div className="empty-actions">
        <button type="button" className="btn btn-primary" onClick={reset}>Try again</button>
        <Link className="btn btn-secondary" href="/app">Go to overview</Link>
      </div>
    </div>
  );
}
