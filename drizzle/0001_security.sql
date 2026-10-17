-- ============================================================================
-- Asteric security layer: tenant isolation (RLS) and append-only records.
--
-- Tenant transactions run `SET LOCAL ROLE asteric_app` and set `app.org_id`.
-- asteric_app is NOLOGIN, NOBYPASSRLS and does not own any table, so the
-- policies below always apply to it. A query that forgets its tenant filter
-- therefore returns nothing rather than another organization's data.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asteric_app') THEN
    CREATE ROLE asteric_app NOLOGIN NOBYPASSRLS;
  END IF;
  EXECUTE format('GRANT asteric_app TO %I', current_user);
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'asteric: could not create role asteric_app. Database-level RLS is inactive; application-level tenant scoping still applies.';
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_current_org() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;
--> statement-breakpoint

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'memberships','invitations','attorneys','referral_sources','categories','matters',
    'predictions','procedural_events','offers','outcomes','imports','import_files',
    'import_rows','import_value_reviews','provenance','audit_events','notification_reads','saved_views'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asteric_app') THEN
    RETURN;
  END IF;

  EXECUTE 'GRANT USAGE ON SCHEMA public TO asteric_app';
  EXECUTE 'GRANT EXECUTE ON FUNCTION app_current_org() TO asteric_app';

  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO asteric_app', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO asteric_app USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org())', t);
  END LOOP;

  -- The organization row itself.
  EXECUTE 'GRANT SELECT, UPDATE ON organizations TO asteric_app';
  EXECUTE 'ALTER TABLE organizations ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON organizations';
  EXECUTE 'CREATE POLICY tenant_isolation ON organizations TO asteric_app USING (id = app_current_org()) WITH CHECK (id = app_current_org())';

  -- Users are visible inside a tenant only if they belong to that tenant.
  EXECUTE 'GRANT SELECT ON users TO asteric_app';
  EXECUTE 'ALTER TABLE users ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_members ON users';
  EXECUTE 'CREATE POLICY tenant_members ON users FOR SELECT TO asteric_app USING (id IN (SELECT user_id FROM memberships WHERE organization_id = app_current_org()))';

  -- Append-only records: the application role can never rewrite history.
  EXECUTE 'REVOKE UPDATE, DELETE ON predictions FROM asteric_app';
  EXECUTE 'REVOKE UPDATE, DELETE ON audit_events FROM asteric_app';
  -- sessions, auth_tokens, rate_limits, access_requests and the network schema
  -- are deliberately not granted: they are only touched by system code paths.
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION asteric_forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Only the organization purge and the demo sandbox reset may delete these rows.
  IF TG_OP = 'DELETE' AND current_setting('app.allow_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only; % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS predictions_append_only ON predictions;
--> statement-breakpoint
CREATE TRIGGER predictions_append_only BEFORE UPDATE OR DELETE ON predictions
  FOR EACH ROW EXECUTE FUNCTION asteric_forbid_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_append_only ON audit_events;
--> statement-breakpoint
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION asteric_forbid_mutation();
