import type { Metadata } from "next";
import { RequestForm } from "@/components/public/RequestForm";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <div className="legal" style={{ maxWidth: 680 }}>
      <h1>Contact</h1>
      <p className="ink2" style={{ marginTop: 14, fontSize: 16 }}>
        Questions about Asteric, security, privacy or a design partnership. {site.contactEmail ? <>You can also email <a className="link" href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.</> : null}
      </p>
      <div style={{ marginTop: 32 }}><RequestForm kind="contact" /></div>
    </div>
  );
}
