"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOrgContext } from "@/server/auth/session";
import { run, type ActionResult } from "@/server/action-runner";
import { predictionSchema, recordPrediction } from "@/server/services/ledger";
import {
  createRule, decisionSchema, deleteRule, inboxActionSchema, intakeSchema, markDevelopment, monitorPattern, reaffirmAssessment,
  recordDecision, recordInboxAction, recordIntake, ruleSchema, setRuleActive,
} from "@/server/services/workflow";

const refresh = (matterId?: string | null) => { revalidatePath("/app", "layout"); if (matterId) revalidatePath(`/app/matters/${matterId}`); };

const assessmentPayload = z.object({
  assessment: z.object({
    recoveryLow: z.number(), recoveryHigh: z.number(), probability: z.number(), expectedDurationMonths: z.number(), expectedExpense: z.number(),
    confidence: z.enum(["low", "medium", "high"]), drivers: z.array(z.string()).max(3), revisionReason: z.string().max(500).optional(),
  }),
  inputs: z.record(z.string(), z.unknown()),
  momentId: z.string().uuid().nullable().optional(),
});

/** Saves the attorney's confirmed assessment as a new immutable version. */
export async function submitAssessmentAction(matterId: string, payload: z.infer<typeof assessmentPayload>): Promise<ActionResult> {
  return run("submit_assessment", async () => {
    const ctx = await getOrgContext();
    const v = assessmentPayload.parse(payload);
    const p = await recordPrediction(ctx, matterId, predictionSchema.parse(v.assessment), { inputs: v.inputs, momentId: v.momentId ?? null });
    refresh(matterId);
    return { ok: p.version > 1 ? `Assessment v${p.version} recorded. Earlier versions are preserved.` : "Assessment recorded and locked.", id: p.id };
  });
}

export async function reaffirmAction(matterId: string, opts: { momentId?: string | null; itemKey?: string | null; note?: string | null }): Promise<ActionResult> {
  return run("reaffirm", async () => {
    const ctx = await getOrgContext();
    const p = await reaffirmAssessment(ctx, matterId, opts);
    refresh(matterId);
    return { ok: `No change confirmed. Recorded as v${p.version}.`, id: p.id };
  });
}

export async function inboxAction(input: z.infer<typeof inboxActionSchema>): Promise<ActionResult> {
  return run("inbox_action", async () => {
    const ctx = await getOrgContext();
    await recordInboxAction(ctx, input);
    refresh(input.matterId);
    return { ok: { assigned: "Assigned.", snoozed: "Snoozed.", dismissed: "Dismissed.", confirmed: "Confirmed.", reopened: "Reopened." }[input.action] };
  });
}

export async function markDevelopmentAction(matterId: string, note: string): Promise<ActionResult> {
  return run("mark_development", async () => {
    const ctx = await getOrgContext();
    const id = await markDevelopment(ctx, matterId, note);
    refresh(matterId);
    return { ok: "Development recorded.", data: { momentId: id } };
  });
}

export async function createRuleAction(input: z.infer<typeof ruleSchema>): Promise<ActionResult> {
  return run("create_rule", async () => {
    const ctx = await getOrgContext();
    const r = await createRule(ctx, input);
    refresh();
    return { ok: `Rule "${r.name}" is active. Matching matters now appear in the Decision Inbox.`, id: r.id };
  });
}

export async function toggleRuleAction(ruleId: string, active: boolean): Promise<ActionResult> {
  return run("toggle_rule", async () => { const ctx = await getOrgContext(); await setRuleActive(ctx, ruleId, active); refresh(); });
}

export async function deleteRuleAction(ruleId: string): Promise<ActionResult> {
  return run("delete_rule", async () => { const ctx = await getOrgContext(); await deleteRule(ctx, ruleId); refresh(); return { ok: "Rule deleted." }; });
}

export async function recordDecisionAction(matterId: string, input: z.infer<typeof decisionSchema>): Promise<ActionResult> {
  return run("record_decision", async () => {
    const ctx = await getOrgContext();
    await recordDecision(ctx, matterId, input);
    if (input.itemKey) await recordInboxAction(ctx, { itemKey: input.itemKey, matterId, action: "confirmed", reason: "Review recorded" });
    refresh(matterId);
    return { ok: "Decision recorded in the ledger." };
  });
}

const numOrU = (v: FormDataEntryValue | null) => { const s = String(v ?? "").replace(/[$,\s]/g, ""); return s ? Number(s) : undefined; };
export async function recordIntakeAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run("record_intake", async () => {
    const ctx = await getOrgContext();
    const o = (k: string) => String(fd.get(k) ?? "").trim() || undefined;
    await recordIntake(ctx, intakeSchema.parse({
      receivedOn: o("receivedOn"), label: o("label"), categoryKey: o("categoryKey"), referralId: o("referralId"), attorneyId: o("attorneyId"), jurisdiction: o("jurisdiction"),
      disposition: o("disposition"), reasonCode: o("reasonCode"), note: o("note"), likelihood: o("likelihood"), recoveryLow: numOrU(fd.get("recoveryLow")), recoveryHigh: numOrU(fd.get("recoveryHigh")),
    }));
    revalidatePath("/app/intake");
    return { ok: "Intake decision recorded." };
  });
}

export async function monitorAction(insightId: string, label: string, on: boolean): Promise<ActionResult> {
  return run("monitor", async () => { const ctx = await getOrgContext(); await monitorPattern(ctx, insightId, label, on); refresh(); return { ok: on ? "Monitoring this pattern." : "Stopped monitoring." }; });
}
