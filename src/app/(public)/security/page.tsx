/*
 * LEGAL REVIEW REQUIRED before relying on this page in sales or contracts. Every statement
 * here describes a control implemented in this codebase. Do not add claims (certifications,
 * audits, penetration tests, insurance) unless they have actually been obtained.
 */
import type { Metadata } from "next";
import { ContactLine } from "@/components/public/Legal";

export const metadata: Metadata = { title: "Security", robots: { index: true } };
const UPDATED = "October 17, 2026";

export default function SecurityPage() {
  return (
    <article className="legal">
      <h1>Security</h1>
      <p className="updated">Last updated {UPDATED}</p>
      <p style={{ marginTop: 24 }}>Law firms trust Asteric with information about their matters. This page describes the controls built into the product today. It is a factual overview, not a certification.</p>

      <h2>Tenant isolation</h2>
      <ul>
        <li>Every record belonging to a firm carries its organization identifier, and every application query is scoped to the signed-in member&apos;s organization.</li>
        <li>As a second, independent layer, the database enforces Postgres row-level security: application queries run under a restricted database role that can only read and write rows belonging to the active organization.</li>
        <li>Automated tests verify that one organization cannot read or modify another&apos;s data.</li>
      </ul>

      <h2>Integrity of the record</h2>
      <ul>
        <li>Recorded predictions are append-only. A revision is saved as a new version; earlier versions cannot be edited or deleted, which the database enforces as well as the application.</li>
        <li>An append-only audit log records sign-ins, security changes, imports, predictions, outcomes, exports and settings changes. Organization owners and administrators can review it.</li>
        <li>Corrections to imported or recorded values keep the previous value and who changed it.</li>
      </ul>

      <h2>Accounts and access</h2>
      <ul>
        <li>Passwords are stored only as salted scrypt hashes. Minimum length is 12 characters.</li>
        <li>Time-based two-factor authentication with single-use recovery codes is available to every user.</li>
        <li>Sessions expire after 12 hours of inactivity and always after 14 days, use secure, HTTP-only cookies, and can be revoked from settings.</li>
        <li>Sign-in, password reset and other sensitive endpoints are rate limited, and responses do not reveal whether an email has an account.</li>
        <li>Role-based permissions (owner, administrator, attorney, analyst, read-only) control what each member can see and do.</li>
        <li>Asteric staff who administer the platform are not members of customer organizations and cannot open their matters through the product.</li>
      </ul>

      <h2>Data handling</h2>
      <ul>
        <li>All traffic is served over HTTPS with HSTS. Pages send a strict content security policy and other protective headers.</li>
        <li>Two-factor secrets are encrypted at the application layer. Uploaded import files are stored privately in the database and are never served by public URL.</li>
        <li>Uploads are checked for type and size; spreadsheet exports neutralize formula injection.</li>
        <li>Application logs exclude passwords, tokens and matter content.</li>
        <li>AI-assisted mapping is off by default. When enabled, only column headers and value types are sent, never cell contents.</li>
        <li>Organization owners can export all of their data and schedule permanent deletion.</li>
      </ul>

      <h2>Infrastructure</h2>
      <p>The application runs on managed cloud hosting with a managed Postgres database that encrypts data at rest. Details of the providers in use are available on request.</p>

      <h2>What we do not claim</h2>
      <p>Asteric has not yet completed a SOC 2 or similar third-party audit. We will update this page if and when that changes. We are glad to answer security questionnaires.</p>

      <h2>Reporting a vulnerability</h2>
      <p>If you believe you have found a security issue, please contact <ContactLine kind="security" /> with details. Please do not access data that is not yours or degrade the service while testing.</p>
    </article>
  );
}
