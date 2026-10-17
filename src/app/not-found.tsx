import Link from "next/link";

export default function NotFound() {
  return (
    <main className="legal" style={{ paddingTop: 120 }}>
      <p className="eyebrow">404</p>
      <h1 style={{ marginTop: 10 }}>This page does not exist.</h1>
      <p style={{ marginTop: 14 }} className="ink2">The link may be out of date, or you may not have access to this resource.</p>
      <p style={{ marginTop: 24 }}><Link className="btn btn-secondary" href="/">Return to Asteric</Link></p>
    </main>
  );
}
