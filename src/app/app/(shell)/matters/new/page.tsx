import type { Metadata } from "next";
import Link from "next/link";
import { pageOrgContext } from "@/server/auth/session";
import { loadPortfolio } from "@/server/services/portfolio";
import { Card, Empty, PageHead } from "@/components/ui/Blocks";
import { NewMatterForm } from "@/components/app/NewMatterForm";

export const metadata: Metadata = { title: "New matter" };

export default async function NewMatterPage() {
  const ctx = await pageOrgContext("/app/matters/new");
  if (!ctx.can("matters.edit") || ctx.org.isDemo) return <><PageHead title="New matter" /><Empty title="Not available">{ctx.org.isDemo ? "Matters cannot be added to the demonstration workspace. Record a sandbox prediction on an open matter instead." : "Your role does not permit adding matters."}</Empty></>;
  const p = await loadPortfolio(ctx.org.id);
  return (
    <>
      <nav aria-label="Breadcrumb" className="help" style={{ marginBottom: 10 }}><Link className="link" href="/app/matters">Matters</Link> / New</nav>
      <PageHead title="New matter" sub="Add a matter at intake, then record the prediction while the outcome is still unknown." />
      <div style={{ maxWidth: 760 }}><Card><NewMatterForm categories={p.categories} attorneys={p.attorneys} referrals={p.referrals.map((r) => r.name)} defaultAttorney={ctx.attorneyId} /></Card></div>
    </>
  );
}
