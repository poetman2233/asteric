import type { Metadata } from "next";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="auth-title">Choose a new password</h1>
      <p className="auth-sub">Updating your password signs you out of every other session.</p>
      {token ? <ResetForm token={token} /> : <div className="alert alert-error">This reset link is incomplete. Request a new one.</div>}
    </>
  );
}
