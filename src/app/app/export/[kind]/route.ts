import { NextResponse, type NextRequest } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { AuthError, getOrgContext } from "@/server/auth/session";
import { withTenant } from "@/server/db";
import { auditEvents, offers, proceduralEvents } from "@/server/db/schema";
import { loadPortfolio } from "@/server/services/portfolio";
import { applyFilter, parseFilter } from "@/lib/analytics/filters";
import { audit } from "@/server/audit";
import { toCsv } from "@/lib/csv";
import { logger } from "@/server/logger";

const KINDS = ["matters", "predictions", "outcomes", "events", "audit"] as const;
type Kind = (typeof KINDS)[number];

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!KINDS.includes(kind as Kind)) return new NextResponse("Not found", { status: 404 });
  let ctx;
  try {
    ctx = await getOrgContext();
  } catch (e) {
    if (e instanceof AuthError) return new NextResponse("Sign in required", { status: 401 });
    throw e;
  }
  if (!ctx.can("data.export")) return new NextResponse("Your role does not permit exporting data.", { status: 403 });

  try {
    const p = await loadPortfolio(ctx.org.id);
    const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
    const ms = kind === "matters" ? applyFilter(p.facts, parseFilter(sp)) : p.facts;
    let csv = "";
    if (kind === "matters") {
      csv = toCsv(
        ["matter_id", "name", "status", "category", "lead_attorney", "referral_source", "jurisdiction", "opened_on", "closed_on", "procedural_stage", "expenses_to_date", "attorney_hours", "resolution", "favorable", "gross_recovery", "attorney_fee", "referral_fee_paid", "litigation_expenses", "net_to_client", "prediction_count"],
        ms.map((m) => [m.externalId, m.name, m.status, m.categoryLabel, m.attorneyName, m.referralName, m.jurisdiction, m.openedOn, m.closedOn, m.proceduralStage, m.expensesToDate, m.attorneyHours,
          m.outcome?.resolutionType, m.outcome?.favorable, m.outcome?.grossRecovery, m.outcome?.attorneyFee, m.outcome?.referralFeePaid, m.outcome?.litigationExpenses, m.outcome?.netToClient, m.predictions.length]),
      );
    } else if (kind === "predictions") {
      csv = toCsv(
        ["matter_id", "matter_name", "version", "recorded_at", "author", "source", "recovery_low", "recovery_high", "probability_favorable", "expected_duration_months", "expected_expense", "confidence", "procedural_stage", "revision_reason"],
        ms.flatMap((m) => m.predictions.filter((x) => x.source !== "sandbox").map((x) => [m.externalId, m.name, x.version, x.recordedAt, x.authorLabel, x.source, x.recoveryLow, x.recoveryHigh, x.probability, x.expectedDurationMonths, x.expectedExpense, x.confidence, x.proceduralStage, x.revisionReason])),
      );
    } else if (kind === "outcomes") {
      csv = toCsv(
        ["matter_id", "matter_name", "resolution", "favorable", "resolved_on", "gross_recovery", "attorney_fee", "referral_fee_paid", "litigation_expenses", "net_to_client", "attorney_hours"],
        ms.filter((m) => m.outcome).map((m) => { const o = m.outcome!; return [m.externalId, m.name, o.resolutionType, o.favorable, o.resolvedOn, o.grossRecovery, o.attorneyFee, o.referralFeePaid, o.litigationExpenses, o.netToClient, o.attorneyHours]; }),
      );
    } else if (kind === "events") {
      const names = new Map(p.facts.map((m) => [m.id, [m.externalId, m.name] as const]));
      const rows = await withTenant(ctx.org.id, async (tx) => {
        const ev = await tx.select().from(proceduralEvents).where(eq(proceduralEvents.organizationId, ctx.org.id)).orderBy(asc(proceduralEvents.occurredOn));
        const of = await tx.select().from(offers).where(eq(offers.organizationId, ctx.org.id)).orderBy(asc(offers.offeredOn));
        return [
          ...ev.map((e) => [...(names.get(e.matterId) ?? ["", ""]), e.occurredOn, "event", e.type, e.title, e.amount]),
          ...of.map((o) => [...(names.get(o.matterId) ?? ["", ""]), o.offeredOn, "offer", o.direction, o.notes, o.amount]),
        ].sort((a, b) => String(a[2]).localeCompare(String(b[2])));
      });
      csv = toCsv(["matter_id", "matter_name", "date", "kind", "type", "title_or_notes", "amount"], rows);
    } else {
      if (!ctx.can("audit.view")) return new NextResponse("Your role does not permit exporting the audit log.", { status: 403 });
      const rows = await withTenant(ctx.org.id, (tx) => tx.select().from(auditEvents).where(eq(auditEvents.organizationId, ctx.org.id)).orderBy(desc(auditEvents.createdAt)).limit(100_000));
      csv = toCsv(["timestamp", "actor", "action", "object_type", "object_id", "summary"], rows.map((r) => [r.createdAt, r.actorLabel, r.action, r.objectType, r.objectId, r.summary]));
    }
    await withTenant(ctx.org.id, (tx) => audit(tx, { organizationId: ctx.org.id, actorUserId: ctx.user.id, actorLabel: ctx.user.name, action: "export.downloaded", summary: `Exported ${kind} as CSV`, metadata: { kind } }));
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(`﻿${csv}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="asteric-${kind}-${stamp}.csv"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    logger.error("export.failed", { err: e, kind });
    return new NextResponse("Export failed. The error has been logged.", { status: 500 });
  }
}
