/*
 * LEGAL REVIEW REQUIRED: This privacy policy was drafted to describe how the software
 * actually behaves. It must be reviewed by qualified counsel (including for state privacy
 * laws, attorney professional-responsibility obligations and any customer DPA terms)
 * before Asteric processes real customer data.
 */
import type { Metadata } from "next";
import { ContactLine } from "@/components/public/Legal";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy", robots: { index: true } };
const UPDATED = "October 17, 2026";

export default function PrivacyPage() {
  return (
    <article className="legal">
      <h1>Privacy</h1>
      <p className="updated">Last updated {UPDATED}</p>
      <p style={{ marginTop: 24 }}>This policy explains what information {site.legalEntity} (&ldquo;Asteric&rdquo;, &ldquo;we&rdquo;) collects through this website and the Asteric application, how it is used, and the choices available to you.</p>

      <h2>Two kinds of information</h2>
      <p><strong>Account and website information</strong> is information about the people who use Asteric: names, work email addresses, job titles, sign-in activity and messages sent through our forms. We are responsible for this information.</p>
      <p><strong>Customer data</strong> is the matter information a law firm uploads or enters into its workspace: matter names and identifiers, categories, dates, attorneys, referral sources, recorded predictions, procedural events, offers and financial outcomes. The firm controls its customer data. We process it only to provide the service to that firm, under our agreement with it.</p>

      <h2>What we collect</h2>
      <ul>
        <li>Information you give us: your name, email, firm and message when you request access or contact us; your name, title and password (stored only as a salted hash) when you create an account.</li>
        <li>Security information: hashed session tokens, a keyed hash of your IP address for rate limiting, browser type, and sign-in and audit events.</li>
        <li>Customer data that your firm imports or enters.</li>
      </ul>
      <p>We do not use advertising trackers or sell information. The marketing site does not set cookies. The application sets one strictly necessary session cookie.</p>

      <h2>How we use it</h2>
      <ul>
        <li>To provide, secure and support the service, including authentication, audit logging and abuse prevention.</li>
        <li>To respond to requests and send service emails such as invitations and password resets.</li>
        <li>To compute analytics for the firm that owns the data. Each firm&apos;s analytics are computed only from its own records.</li>
      </ul>
      <p>We do not use customer data to train machine-learning models, and we do not combine one firm&apos;s data with another&apos;s. A planned, opt-in network feature is described in the application as a preview; it is not active and no data is shared through it.</p>

      <h2>Optional AI-assisted import mapping</h2>
      <p>If an organization&apos;s administrator turns this on, and only for spreadsheet columns Asteric cannot identify on its own, column headers and inferred value types (for example &ldquo;date&rdquo; or &ldquo;currency&rdquo;) are sent to an AI model provider to suggest a mapping. Cell contents are not sent. Suggestions are never applied without a person confirming them. This setting is off by default.</p>

      <h2>Service providers</h2>
      <p>We use service providers to host the application and database, deliver email and, if enabled, provide AI-assisted mapping. They process information on our behalf under contractual obligations. A current list is available on request.</p>

      <h2>Retention and deletion</h2>
      <p>An organization owner can export customer data at any time and can request deletion of the organization. Deletion takes effect after a 30-day grace period, during which it can be cancelled; after that, the organization&apos;s customer data is permanently deleted from the live database. Backups held by our database provider expire on that provider&apos;s schedule. Website contact submissions are kept while they are useful for responding to you.</p>

      <h2>Your choices</h2>
      <p>You can update your profile in the application, ask us for a copy of the account information we hold about you, or ask us to correct or delete it. Requests about customer data should go to the firm that controls it; we will assist that firm.</p>

      <h2>Security</h2>
      <p>See our <a className="link" href="/security">security overview</a> for the measures in place.</p>

      <h2>Changes</h2>
      <p>We will update this page when our practices change and revise the date above. For material changes affecting customer data, we will notify organization owners.</p>

      <h2>Contact</h2>
      <p>Questions about this policy: <ContactLine />.</p>
    </article>
  );
}
