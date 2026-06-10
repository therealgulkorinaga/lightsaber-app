-- Phase 2/3: tenancy activation, watch automation, gap ledger, services
-- layer and assisted authoring. See docs/lightsaber-backoffice-phase23-prd.md §9.

-- Claims become reviewable substance with full provenance (FR-F.3).
ALTER TABLE tenant.claim
  ADD COLUMN title            text NOT NULL DEFAULT '',
  ADD COLUMN author_user_id   uuid REFERENCES shared.app_user (id),
  ADD COLUMN reviewer_user_id uuid REFERENCES shared.app_user (id),
  ADD COLUMN review_state     text NOT NULL DEFAULT 'draft'
    CHECK (review_state IN ('draft', 'in_review', 'returned', 'approved', 'discarded')),
  ADD COLUMN review_notes     text,
  ADD COLUMN submitted_at     timestamptz;

-- Deployments carry the skill's write credential and the bundle identity (FR-F.4, FR-D.1).
ALTER TABLE tenant.deployment
  ADD COLUMN deploy_key      text UNIQUE,
  ADD COLUMN checksum        text,
  ADD COLUMN release_version text REFERENCES shared.seam_release (version),
  ADD COLUMN revoked         boolean NOT NULL DEFAULT false;

-- Audit pulls: practice-side pulls have no tenant; reports record the rules
-- they resolved and whether the tenant tied the pull to a closed deal (FR-X.1).
ALTER TABLE tenant.audit_pull
  ALTER COLUMN tenant_id DROP NOT NULL,
  ADD COLUMN rule_ids    text[] NOT NULL DEFAULT '{}',
  ADD COLUMN deal_closed boolean NOT NULL DEFAULT false;

-- Gap economics and provenance (FR-D.1, FR-D.3).
ALTER TABLE tenant.gap_log
  ADD COLUMN deal_cost_gbp      int,
  ADD COLUMN cost_estimated_gbp int,
  ADD COLUMN deployment_id      uuid REFERENCES tenant.deployment (id),
  ADD COLUMN occurred_at        timestamptz;

-- Watch automation (FR-C.2 .. FR-C.5).
ALTER TABLE shared.watch_item ADD COLUMN triggered_at timestamptz;

CREATE TABLE shared.reauthor_task (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watch_item_id         uuid NOT NULL REFERENCES shared.watch_item (id),
  rule_id               text NOT NULL REFERENCES shared.rule (rule_id),
  owner_id              uuid REFERENCES shared.app_user (id),
  status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_by_version_id  uuid REFERENCES shared.rule_version (id),
  opened_at             timestamptz NOT NULL DEFAULT now(),
  closed_at             timestamptz,
  UNIQUE (watch_item_id, rule_id)
);

-- Gap -> authoring linkage (FR-D.2/E3.6): the rule a backlog item became.
ALTER TABLE tenant.gap_log ADD COLUMN linked_rule_id text REFERENCES shared.rule (rule_id);

-- Configuration of record (FR-X.4).
CREATE TABLE shared.app_config (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_by uuid REFERENCES shared.app_user (id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO shared.app_config (key, value) VALUES
  ('retention_years', '7'),
  ('sla_windows', '{
     "standard": {"stale_hours": 72,  "republish_days": 30},
     "priority": {"stale_hours": 24,  "republish_days": 14},
     "critical": {"stale_hours": 4,   "republish_days": 7}
   }'),
  ('eval_runner', '"static"'),
  ('assist_model', '"claude-sonnet-4-6"');

-- Assisted authoring provenance (Component AI).
ALTER TABLE shared.rule_version ADD COLUMN ai_assisted boolean NOT NULL DEFAULT false;

CREATE TABLE shared.assist_run (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability   text NOT NULL CHECK (capability IN ('research', 'critic', 'scaffold', 'gap_draft', 'reviewer')),
  requested_by uuid NOT NULL REFERENCES shared.app_user (id),
  params       jsonb NOT NULL DEFAULT '{}',
  model        text,
  status       text NOT NULL DEFAULT 'complete' CHECK (status IN ('complete', 'refused', 'failed')),
  result       jsonb NOT NULL DEFAULT '{}',
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);

CREATE TABLE shared.assist_finding (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid NOT NULL REFERENCES shared.assist_run (id),
  kind              text NOT NULL,
  rule_ids          text[] NOT NULL DEFAULT '{}',
  detail            jsonb NOT NULL DEFAULT '{}',
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'accepted', 'task')),
  resolution_reason text,
  resolved_by       uuid REFERENCES shared.app_user (id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Reviewer-assist advisories live with the review record (FR-AI.5).
ALTER TABLE shared.rule_version ADD COLUMN review_advisory jsonb;

-- Tenant-table RLS extends automatically (policies are row-scoped); the new
-- shared tables are practice-side and carry no tenant rows.
