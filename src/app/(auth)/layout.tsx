import Link from "next/link";
import { Wordmark } from "@/components/ui/Brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-wrap">
      <aside className="auth-side" aria-hidden="false">
        <Link href="/" aria-label="Asteric home"><Wordmark /></Link>
        <div style={{ marginTop: "auto", marginBottom: "auto", position: "relative", zIndex: 1, maxWidth: 440 }}>
          <p className="display" style={{ fontSize: 40 }}>A measurable record of how your firm allocates legal capital.</p>
          <p className="ink2" style={{ marginTop: 18, fontSize: 15, maxWidth: 400 }}>
            What you believed, what you committed, and what happened, preserved side by side.
          </p>
        </div>
        <nav style={{ display: "flex", gap: 18, fontSize: 13, position: "relative", zIndex: 1 }} className="muted">
          <Link href="/security">Security</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </aside>
      <main className="auth-main" id="main">
        <div className="auth-card">{children}</div>
      </main>
    </div>
  );
}
