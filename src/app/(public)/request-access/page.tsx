import type { Metadata } from "next";
import { RequestForm } from "@/components/public/RequestForm";

export const metadata: Metadata = { title: "Request access" };

export default function RequestAccessPage() {
  return (
    <div className="legal" style={{ maxWidth: 680 }}>
      <h1>Request access</h1>
      <p className="ink2" style={{ marginTop: 14, fontSize: 16 }}>
        Asteric works with a small number of contingency firms as design partners. Bring 200 to 1,000 closed matters and we will help you build an analysis of how your firm&apos;s judgment and capital have performed.
      </p>
      <div style={{ marginTop: 32 }}><RequestForm kind="access" /></div>
    </div>
  );
}
