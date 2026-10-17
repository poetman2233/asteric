import type { Metadata } from "next";
import { pageOrgContext } from "@/server/auth/session";
import { config } from "@/server/config";
import { Card } from "@/components/ui/Blocks";
import { OrganizationForm } from "@/components/app/SettingsForms";

export const metadata: Metadata = { title: "Organization settings" };

export default async function OrganizationPage() {
  const ctx = await pageOrgContext("/app/settings/organization");
  const s = ctx.org.settings;
  return (
    <div className="stack-lg">
      {ctx.org.isDemo ? <div className="alert alert-info"><span>Settings for the demonstration organization are fixed.</span></div> : null}
      <Card title="Organization">
        <OrganizationForm editable={ctx.can("org.manage") && !ctx.org.isDemo} aiConfigured={config.aiProvider !== "none"}
          v={{ name: ctx.org.name, timezone: ctx.org.timezone, attorneyHourlyCost: s.attorneyHourlyCost, defaultContingencyRate: s.defaultContingencyRate, expensesReimbursedFromRecovery: s.expensesReimbursedFromRecovery, staleDays: s.staleDays, expenseVarianceThreshold: s.expenseVarianceThreshold, analystsSeePredictionAuthors: s.analystsSeePredictionAuthors, aiAssistEnabled: s.aiAssistEnabled }} />
      </Card>
    </div>
  );
}
