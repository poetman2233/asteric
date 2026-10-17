/*
 * LEGAL REVIEW REQUIRED: These terms are a working draft written to match how the product
 * behaves. They must be reviewed and completed by qualified counsel (entity name, governing
 * law, liability caps, data processing terms, and professional-responsibility considerations
 * for law-firm customers) before any customer relies on them.
 */
import type { Metadata } from "next";
import { ContactLine } from "@/components/public/Legal";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Terms", robots: { index: true } };
const UPDATED = "October 17, 2026";

export default function TermsPage() {
  return (
    <article className="legal">
      <h1>Terms of service</h1>
      <p className="updated">Last updated {UPDATED}</p>
      <p style={{ marginTop: 24 }}>These terms govern access to and use of the Asteric website and application provided by {site.legalEntity}. If your organization has signed a separate agreement with us, that agreement controls where it differs from these terms.</p>

      <h2>The service</h2>
      <p>Asteric is software that helps law firms record predictions about their matters, compare them with outcomes, and analyze their own historical data. Access is by invitation to an organization workspace.</p>

      <div className="callout"><p><strong>Asteric does not provide legal advice.</strong> Its analytics describe patterns in a firm&apos;s own historical records. They are not predictions about any particular matter, are not a substitute for professional judgment, and must not be relied on as the sole basis for any legal, settlement or financial decision. Responsibility for case decisions remains with the firm and its attorneys.</p></div>

      <h2>Accounts</h2>
      <ul>
        <li>Keep your credentials confidential and use two-factor authentication where available. You are responsible for activity under your account.</li>
        <li>Organization owners and administrators control who has access to their workspace and with which role.</li>
        <li>Tell us promptly if you believe your account has been compromised.</li>
      </ul>

      <h2>Your data</h2>
      <p>Your organization retains all rights in the data it uploads or enters. You grant us permission to host, process and display that data only as needed to provide the service to you. You are responsible for having the right to upload it, including any obligations you owe to clients. Do not upload documents, privileged communications or client contact details; the service does not need them.</p>
      <p>You can export your data at any time and request deletion of your organization as described in our <a className="link" href="/privacy">privacy policy</a>.</p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not attempt to access another organization&apos;s data, probe or circumvent security controls, or disrupt the service.</li>
        <li>Do not upload malicious files or use the service in violation of law or professional rules.</li>
        <li>Do not resell the service or use it to build a competing product.</li>
      </ul>

      <h2>Demonstration workspace</h2>
      <p>The demonstration organization contains synthetic data only. It depicts a fictional firm; any resemblance to real people or organizations is coincidental. Activity in it is reset regularly.</p>

      <h2>Availability and changes</h2>
      <p>We work to keep the service available and secure but do not guarantee uninterrupted operation. We may change or discontinue features and will give reasonable notice of material changes that affect paying customers.</p>

      <h2>Disclaimers and liability</h2>
      <p>Except as stated in a signed agreement, the service is provided &ldquo;as is&rdquo; without warranties of any kind, to the extent permitted by law. To the extent permitted by law, we are not liable for indirect, incidental or consequential damages, or for decisions made using the service.</p>

      <h2>Termination</h2>
      <p>You may stop using the service at any time. We may suspend access for material breach of these terms or to protect the service or other customers. On termination you may export your data for 30 days, after which it is deleted.</p>

      <h2>General</h2>
      <p>{site.governingLaw ? `These terms are governed by the laws of ${site.governingLaw}.` : "Governing law and venue are set out in your organization's agreement with us."} If any provision is unenforceable, the rest remains in effect.</p>

      <h2>Contact</h2>
      <p>Questions about these terms: <ContactLine />.</p>
    </article>
  );
}
