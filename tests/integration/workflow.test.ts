import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { pool, systemDb } from "@/server/db";
import { decisionMoments, decisions, inboxActions, memberships, users } from "@/server/db/schema";
import { addEvent, createMatter, recordOutcome, recordPrediction, type PredictionInput } from "@/server/services/ledger";
import { createRule, getInbox, reaffirmAssessment, recordDecision, recordInboxAction } from "@/server/services/workflow";
import { ensureAttorneyForMember } from "@/server/services/accounts";
import { loadPortfolio, todayIso } from "@/server/services/portfolio";
import { generateInsights } from "@/lib/analytics/insights";
import { templateForInsight } from "@/lib/rules";
import { ctxFor, makeOrg, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(async () => { await pool().end(); globalThis.__astericPool = undefined; });

const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10);
const assess = (lo: number, hi: number, p = 0.7): PredictionInput => ({ recoveryLow: lo, recoveryHigh: hi, probability: p, expectedDurationMonths: 18, expectedExpense: 40_000, confidence: "medium", drivers: [] });
const outcome = (gross: number) => ({ resolutionType: "settlement", resolvedOn: daysAgo(0), grossRecovery: gross, attorneyFee: gross * 0.4, referralFeePaid: null, litigationExpenses: 30_000, netToClient: gross * 0.6 - 30_000, attorneyHours: 400 });

async function colleague(ctx: Awaited<ReturnType<typeof makeOrg>>, name: string) {
  const [u] = await systemDb().insert(users).values({ email: `${name.toLowerCase()}@colleague.test`, name, emailVerifiedAt: new Date() }).returning();
  await systemDb().insert(memberships).values({ organizationId: ctx.org.id, userId: u!.id, role: "attorney" });
  const att = await ensureAttorneyForMember(systemDb(), ctx.org.id, u!.id, name);
  return ctxFor(ctx.org.id, ctx.org.name, u!.id, name, "attorney", att.id);
}

describe("V2 decision loop", () => {
  it("matter → assessment → Decision Moment → update → outcome → Firm Learning → review rule → inbox", async () => {
    const owner = await makeOrg("Loop Firm");

    // A new matter asks for its first assessment; the quick assessment clears it.
    const m = await createMatter(owner, { name: "Rivera v. Halcyon", openedOn: daysAgo(40), categoryKey: "retaliation" });
    let inbox = await getInbox(owner);
    expect(inbox.items.some((i) => i.matterId === m.id && (i.kind === "needs_assessment" || i.kind === "moment"))).toBe(true);
    await recordPrediction(owner, m.id, assess(200_000, 350_000), { inputs: { mode: "quick", strength: "typical" } });
    inbox = await getInbox(owner);
    expect(inbox.items.filter((i) => i.matterId === m.id)).toHaveLength(0);

    // A configured development opens a Decision Moment.
    const ev = await addEvent(owner, m.id, { type: "mediation_held", occurredOn: daysAgo(1), title: "Mediation held" });
    expect(ev.momentId).toBeTruthy();
    inbox = await getInbox(owner);
    const item = inbox.items.find((i) => i.kind === "moment" && i.matterId === m.id)!;
    expect(item).toBeTruthy();

    // "Has your view changed?" → No change records a timestamped reaffirmation and resolves the moment.
    await reaffirmAssessment(owner, m.id, { momentId: ev.momentId, itemKey: item.key });
    const mo = (await systemDb().select().from(decisionMoments).where(eq(decisionMoments.id, ev.momentId!)))[0]!;
    expect(mo.status).toBe("resolved");
    expect((await getInbox(owner)).items.filter((i) => i.matterId === m.id)).toHaveLength(0);

    // A second moment, answered with an updated assessment.
    const ev2 = await addEvent(owner, m.id, { type: "motion_decided", occurredOn: daysAgo(0), title: "Summary judgment denied" });
    await recordPrediction(owner, m.id, { ...assess(250_000, 420_000, 0.75), revisionReason: "Summary judgment denied" }, { momentId: ev2.momentId });
    expect((await systemDb().select().from(decisionMoments).where(eq(decisionMoments.id, ev2.momentId!)))[0]!.resolution).toBe("updated");
    await recordOutcome(owner, m.id, outcome(330_000));

    // History: matters assessed at $1M+ recovered far less; smaller matters landed in range.
    for (let i = 0; i < 12; i++) {
      const big = await createMatter(owner, { name: `High ${i}`, openedOn: daysAgo(900), categoryKey: "retaliation" });
      await recordPrediction(owner, big.id, assess(1_000_000, 1_500_000));
      await recordOutcome(owner, big.id, outcome(450_000 + i * 10_000));
      const small = await createMatter(owner, { name: `Small ${i}`, openedOn: daysAgo(900), categoryKey: "retaliation" });
      await recordPrediction(owner, small.id, assess(150_000, 250_000));
      await recordOutcome(owner, small.id, outcome(190_000 + i * 2_000));
    }

    // Firm Learning finds the pattern and offers a rule template.
    const p = await loadPortfolio(owner.org.id);
    const s = owner.org.settings;
    const insights = generateInsights(p.facts, { attorneyHourlyCost: s.attorneyHourlyCost, defaultContingencyRate: s.defaultContingencyRate, expensesReimbursedFromRecovery: s.expensesReimbursedFromRecovery }, { asOf: todayIso(), staleDays: s.staleDays, expenseThreshold: s.expenseVarianceThreshold });
    const finding = insights.find((x) => x.id === "valuation-gt1m");
    expect(finding).toBeTruthy();
    const tpl = templateForInsight(finding!.id, { categories: {}, referrals: {} })!;
    expect(tpl.type).toBe("high_value");

    // Management creates the rule; a new $1M+ matter enters the Decision Inbox under it.
    const rule = await createRule(owner, { name: tpl.name, type: tpl.type, params: tpl.params, sourceInsight: finding!.id });
    const attorney = await colleague(owner, "Priya");
    const next = await createMatter(attorney, { name: "Moreau v. Cobalt", openedOn: daysAgo(3), categoryKey: "retaliation" });
    await recordPrediction(attorney, next.id, assess(1_100_000, 1_600_000));
    inbox = await getInbox(owner);
    const ruleItem = inbox.items.find((i) => i.kind === "rule" && i.matterId === next.id);
    expect(ruleItem?.ruleId).toBe(rule.id);

    // The author cannot satisfy their own second review; a colleague can.
    await recordDecision(attorney, next.id, { type: "second_review" });
    expect((await getInbox(owner)).items.some((i) => i.kind === "rule" && i.matterId === next.id)).toBe(true);
    await recordDecision(owner, next.id, { type: "second_review", reason: "Reviewed range with lead attorney" });
    expect((await getInbox(owner)).items.some((i) => i.kind === "rule" && i.matterId === next.id)).toBe(false);
  });

  it("keeps decisions and inbox actions append-only, and hides dismissed items", async () => {
    const owner = await makeOrg("Ledger Firm");
    const m = await createMatter(owner, { name: "Chen v. Arbor", openedOn: daysAgo(20) });
    const key = (await getInbox(owner)).items.find((i) => i.matterId === m.id)!.key;
    await recordInboxAction(owner, { itemKey: key, matterId: m.id, action: "dismissed", reason: "Assessment pending intake call" });
    expect((await getInbox(owner)).items.some((i) => i.key === key)).toBe(false);
    const d = await recordDecision(owner, m.id, { type: "continue_investment", capitalAmount: 5_000 });
    const app = sql.raw("set local role asteric_app");
    for (const [t, id] of [[decisions, d.id], [inboxActions, null]] as const) {
      await expect(systemDb().transaction(async (tx) => {
        await tx.execute(app);
        await tx.execute(sql`select set_config('app.current_org', ${owner.org.id}, true)`);
        await tx.update(t).set({ createdAt: new Date() }).where(id ? eq(t.id, id) : sql`true`);
      })).rejects.toThrow();
    }
  });
});
