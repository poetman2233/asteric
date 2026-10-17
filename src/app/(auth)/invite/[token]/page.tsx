import type { Metadata } from "next";
import Link from "next/link";
import { findInvitation, findUserByEmail } from "@/server/services/accounts";
import { getSession } from "@/server/auth/session";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { InviteForm } from "./InviteForm";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findInvitation(token);
  if (!found) {
    return (
      <>
        <h1 className="auth-title">Invitation unavailable</h1>
        <p className="auth-sub">This invitation is invalid, has expired, or was already used. Ask your administrator to send a new one.</p>
        <Link className="btn btn-secondary" href="/login">Go to sign in</Link>
      </>
    );
  }
  const existing = await findUserByEmail(found.inv.email);
  const session = await getSession();
  const signedInAsInvitee = Boolean(existing && session && session.userId === existing.id);
  return (
    <>
      <h1 className="auth-title">Join {found.orgName}</h1>
      <p className="auth-sub">You were invited as <strong>{ROLE_LABEL[found.inv.role as Role]}</strong> using {found.inv.email}.</p>
      {existing && !signedInAsInvitee ? (
        <div className="stack">
          <div className="alert alert-info">An Asteric account already exists for {found.inv.email}. Sign in, then open this invitation link again.</div>
          <Link className="btn btn-primary btn-block" href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in to accept</Link>
        </div>
      ) : (
        <InviteForm token={token} needsAccount={!existing} />
      )}
    </>
  );
}
