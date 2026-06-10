-- Row-level security on every tenant table (FR-7.1).
-- Session context:
--   app.is_practice = 'true'  -> practice-side session, full visibility
--   app.tenant_id   = <uuid>  -> tenant session, own rows only
-- The lsb_tenant role is what a tenant portal session (Phase 2) connects
-- through; it exists now so isolation is provable under test from day one.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lsb_tenant') THEN
    CREATE ROLE lsb_tenant NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA tenant TO lsb_tenant;
GRANT USAGE ON SCHEMA shared TO lsb_tenant;
-- Tenants consume the shared corpus through their deployed bundle only;
-- no shared-table access at all for tenant sessions (FR-7.2).
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA tenant TO lsb_tenant;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenant', 'engagement', 'claim', 'tenant_pin', 'deployment',
                           'gap_log', 'audit_pull', 'sla_event', 'billing_event']
  LOOP
    EXECUTE format('ALTER TABLE tenant.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE tenant.%I FORCE ROW LEVEL SECURITY', t);

    -- Practice-side sessions see everything (the practice operates the fleet).
    EXECUTE format(
      'CREATE POLICY practice_full ON tenant.%I
         USING (current_setting(''app.is_practice'', true) = ''true'')
         WITH CHECK (current_setting(''app.is_practice'', true) = ''true'')', t);

    -- Tenant sessions: own rows only, keyed on tenant_id
    -- (tenant.tenant keys on id rather than tenant_id).
    IF t = 'tenant' THEN
      EXECUTE
        'CREATE POLICY tenant_isolation ON tenant.tenant
           USING (id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)
           WITH CHECK (id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)';
    ELSE
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON tenant.%I
           USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)
           WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    END IF;
  END LOOP;
END $$;
