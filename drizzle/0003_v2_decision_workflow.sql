CREATE TABLE "decision_moments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"matter_id" uuid NOT NULL,
	"type" text NOT NULL,
	"source" text DEFAULT 'event' NOT NULL,
	"event_id" uuid,
	"offer_id" uuid,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"prediction_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"matter_id" uuid NOT NULL,
	"type" text NOT NULL,
	"reason" text,
	"prediction_id" uuid,
	"event_id" uuid,
	"capital_amount" numeric(14, 2),
	"decided_by" uuid,
	"decided_label" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"matter_id" uuid,
	"action" text NOT NULL,
	"assigned_to" uuid,
	"snooze_until" timestamp with time zone,
	"reason" text,
	"created_by" uuid,
	"created_by_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"received_on" date NOT NULL,
	"label" text,
	"category_id" uuid,
	"referral_source_id" uuid,
	"attorney_id" uuid,
	"jurisdiction" text,
	"disposition" text NOT NULL,
	"reason_code" text NOT NULL,
	"note" text,
	"likelihood" text,
	"recovery_low" numeric(14, 2),
	"recovery_high" numeric(14, 2),
	"decided_by" uuid,
	"decided_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitored_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"insight_id" text NOT NULL,
	"label" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source_insight" text,
	"created_by" uuid,
	"created_by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "predictions" ADD COLUMN "assessment_inputs" jsonb;--> statement-breakpoint
ALTER TABLE "predictions" ADD COLUMN "is_reaffirmation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "predictions" ADD COLUMN "moment_id" uuid;--> statement-breakpoint
ALTER TABLE "decision_moments" ADD CONSTRAINT "decision_moments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_moments" ADD CONSTRAINT "decision_moments_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_actions" ADD CONSTRAINT "inbox_actions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_actions" ADD CONSTRAINT "inbox_actions_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_decisions" ADD CONSTRAINT "intake_decisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_decisions" ADD CONSTRAINT "intake_decisions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_decisions" ADD CONSTRAINT "intake_decisions_referral_source_id_referral_sources_id_fk" FOREIGN KEY ("referral_source_id") REFERENCES "public"."referral_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_decisions" ADD CONSTRAINT "intake_decisions_attorney_id_attorneys_id_fk" FOREIGN KEY ("attorney_id") REFERENCES "public"."attorneys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitored_patterns" ADD CONSTRAINT "monitored_patterns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_rules" ADD CONSTRAINT "review_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moments_org_status_idx" ON "decision_moments" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "moments_matter_idx" ON "decision_moments" USING btree ("organization_id","matter_id");--> statement-breakpoint
CREATE INDEX "decisions_org_matter_idx" ON "decisions" USING btree ("organization_id","matter_id","decided_at");--> statement-breakpoint
CREATE INDEX "inbox_actions_key_idx" ON "inbox_actions" USING btree ("organization_id","item_key","created_at");--> statement-breakpoint
CREATE INDEX "intake_org_idx" ON "intake_decisions" USING btree ("organization_id","received_on");--> statement-breakpoint
CREATE UNIQUE INDEX "monitored_org_insight_uq" ON "monitored_patterns" USING btree ("organization_id","insight_id");--> statement-breakpoint
CREATE INDEX "review_rules_org_idx" ON "review_rules" USING btree ("organization_id","active");--> statement-breakpoint
DO $$
DECLARE
  t text;
  v2 text[] := ARRAY['decision_moments','inbox_actions','review_rules','decisions','intake_decisions','monitored_patterns'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asteric_app') THEN
    RETURN;
  END IF;
  FOREACH t IN ARRAY v2 LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO asteric_app', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I TO asteric_app USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org())', t);
  END LOOP;
  -- Decisions and inbox actions are an append-only record, like predictions.
  EXECUTE 'REVOKE UPDATE, DELETE ON decisions FROM asteric_app';
  EXECUTE 'REVOKE UPDATE, DELETE ON inbox_actions FROM asteric_app';
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS decisions_append_only ON decisions;
--> statement-breakpoint
CREATE TRIGGER decisions_append_only BEFORE UPDATE OR DELETE ON decisions
  FOR EACH ROW EXECUTE FUNCTION asteric_forbid_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS inbox_actions_append_only ON inbox_actions;
--> statement-breakpoint
CREATE TRIGGER inbox_actions_append_only BEFORE UPDATE OR DELETE ON inbox_actions
  FOR EACH ROW EXECUTE FUNCTION asteric_forbid_mutation();
