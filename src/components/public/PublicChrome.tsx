import Link from "next/link";
import { Wordmark } from "@/components/ui/Brand";

export function PublicNav() {
  return (
    <header className="public-nav">
      <Link href="/" aria-label="Asteric home"><Wordmark /></Link>
      <nav aria-label="Primary">
        <Link className="hide-sm" href="/security">Security</Link>
        <Link className="hide-sm" href="/privacy">Privacy</Link>
        <Link href="/login">Log in</Link>
        <Link className="btn btn-primary btn-sm" href="/request-access">Request access</Link>
      </nav>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <span>&copy; {new Date().getFullYear()} Asteric</span>
      <nav aria-label="Footer">
        <Link href="/">Product</Link>
        <Link href="/security">Security</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/contact">Contact</Link>
        <Link href="/login">Log in</Link>
      </nav>
    </footer>
  );
}
