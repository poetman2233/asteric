import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { MfaForm } from "./MfaForm";

export const metadata: Metadata = { title: "Two-factor authentication" };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.mfaPending) redirect("/app");
  const { next } = await searchParams;
  return (
    <>
      <h1 className="auth-title">Two-factor authentication</h1>
      <p className="auth-sub">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
      <MfaForm next={next ?? "/app"} />
    </>
  );
}
