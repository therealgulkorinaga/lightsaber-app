-- Lightsaber Backoffice: database of record.
-- PRD section 4 implemented as written: shared corpus in schema "shared",
-- tenant data in schema "tenant" behind RLS keyed on tenant_id.
-- Phase 1 builds Components A, B, E, G; Phase 2/3 tables exist but are surfaceless.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid

CREATE SCHEMA IF NOT EXISTS shared;
CREATE SCHEMA IF NOT EXISTS tenant;

-- ──────────────────────────────────────────────────────────────
-- 4.1 Shared schema
-- ──────────────────────────────────────────────────────────────

CREATE TABLE shared.app_user (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  role       text NOT NULL CHECK (role IN ('author', 'reviewer', 'practice_lead', 'analyst', 'tenant_admin')),
  tenant_id  uuid, -- set for tenant_admin only; FK added after tenant.tenant exists
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shared.jurisdiction (
  tag          text PRIMARY KEY,
  parent_tag   text REFERENCES shared.jurisdiction (tag),
  layer_depth  int  NOT NULL,
  display_name text NOT NULL,
  -- FR-D.5: adding a node requires a parent except the roots
  CONSTRAINT jurisdiction_root_or_parent CHECK (
    parent_tag IS NOT NULL OR tag IN ('UK', 'EU', 'US')
  )
);

CREATE TABLE shared.regime (
  code text PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE shared.rule (
  rule_id            text PRIMARY KEY,
  kind               text NOT NULL CHECK (kind IN ('regulatory', 'icp', 'objection', 'messaging')),
  regime             text REFERENCES shared.regime (code),
  scope              text NOT NULL DEFAULT 'shared' CHECK (scope IN ('shared', 'tenant')),
  current_version_id uuid, -- FK added below
  status             text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'in_review', 'returned', 'approved', 'active', 'stale', 'retired')),
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Immutable, append-only version history (FR-G.1).
CREATE TABLE shared.rule_version (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id               text NOT NULL REFERENCES shared.rule (rule_id),
  semver_at_author      text NOT NULL,            -- e.g. '1.0', '1.1' (rendered as v1.0)
  version_annotation    text NOT NULL DEFAULT '', -- verbatim render suffix, e.g. ' (added in seam 1.1.0)'
  title                 text NOT NULL,
  statement             text,                     -- regulatory Statement; per-kind bodies in kind_fields
  buyer_reading         text,
  authority_summary     text,
  applicability         text,
  inputs_required       text[] NOT NULL DEFAULT '{}',
  jurisdiction_tags     text[] NOT NULL DEFAULT '{}', -- ordered, render-bearing
  kind_fields           jsonb NOT NULL DEFAULT '{}',  -- ICP weight/anchors; objection rests_on/claims_gap; messaging substance
  movement_note         text,
  status_at_version     text NOT NULL DEFAULT 'active'
                        CHECK (status_at_version IN ('active', 'stale', 'retired')),
  review_state          text NOT NULL DEFAULT 'draft'
                        CHECK (review_state IN ('draft', 'in_review', 'returned', 'approved', 'discarded')),
  review_notes          text,
  author_id             uuid NOT NULL REFERENCES shared.app_user (id),
  reviewer_id           uuid REFERENCES shared.app_user (id),
  submitted_at          timestamptz,
  approved_at           timestamptz,
  change_note           text,
  supersedes_version_id uuid REFERENCES shared.rule_version (id),
  content_hash          text, -- sha256 of canonical rendered block; approval binds to it (FR-B.4)
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shared.rule
  ADD CONSTRAINT rule_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES shared.rule_version (id);

CREATE INDEX rule_version_rule_idx ON shared.rule_version (rule_id, created_at);

CREATE TABLE shared.rule_jurisdiction (
  rule_id          text NOT NULL REFERENCES shared.rule (rule_id),
  jurisdiction_tag text NOT NULL REFERENCES shared.jurisdiction (tag),
  PRIMARY KEY (rule_id, jurisdiction_tag)
);

CREATE TABLE shared.source (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_version_id uuid NOT NULL REFERENCES shared.rule_version (id),
  citation        text NOT NULL,
  source_type     text NOT NULL CHECK (source_type IN
                    ('statute', 'regulation', 'guidance', 'RTS', 'circular', 'executive_order', 'case', 'other')),
  url             text,
  retrieved_at    date
);

CREATE TABLE shared.watch_item (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type      text NOT NULL CHECK (trigger_type IN ('date', 'event')),
  trigger_date      date,
  event_description text,
  reverify_date     date,
  reverify_action   text,
  status            text NOT NULL DEFAULT 'armed'
                    CHECK (status IN ('armed', 'triggered', 'reauthoring', 'resolved', 'overdue')),
  owner_id          uuid REFERENCES shared.app_user (id),
  last_checked_at   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT watch_trigger_value CHECK (
    (trigger_type = 'date' AND trigger_date IS NOT NULL)
    OR (trigger_type = 'event' AND event_description IS NOT NULL)
  )
);

CREATE TABLE shared.watch_rule (
  watch_item_id uuid NOT NULL REFERENCES shared.watch_item (id),
  rule_id       text NOT NULL REFERENCES shared.rule (rule_id),
  PRIMARY KEY (watch_item_id, rule_id)
);

CREATE TABLE shared.eval_case (
  id               int PRIMARY KEY,
  prompt           text NOT NULL,
  expected_output  text NOT NULL,
  files            jsonb NOT NULL DEFAULT '[]',
  assertions       jsonb NOT NULL DEFAULT '[]',
  jurisdiction_scope text[] NOT NULL DEFAULT '{}',
  added_in_version text
);

CREATE TABLE shared.eval_run (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_version text NOT NULL,
  runner            text NOT NULL DEFAULT 'static' CHECK (runner IN ('static', 'claude')),
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  passed            boolean,
  results           jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE shared.seam_release (
  version      text PRIMARY KEY, -- semver
  base_version text REFERENCES shared.seam_release (version),
  assembled_at timestamptz,
  released_by  uuid REFERENCES shared.app_user (id),
  eval_run_id  uuid REFERENCES shared.eval_run (id),
  changelog    jsonb NOT NULL DEFAULT '{}', -- added/changed/staled/reauthored/retired by rule ID
  status       text NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'staged', 'eval_running', 'eval_passed', 'eval_failed', 'published', 'deprecated')),
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- The exact set of rule versions pinned in a release: what makes
-- FR-G.3 reproducibility and FR-G.4 defensibility hold.
CREATE TABLE shared.release_rule_version (
  release_version text NOT NULL REFERENCES shared.seam_release (version),
  rule_version_id uuid NOT NULL REFERENCES shared.rule_version (id),
  PRIMARY KEY (release_version, rule_version_id)
);

-- Editorial document state pinned per release: ordered blocks per file,
-- rendered together with the pinned rule versions at export time.
CREATE TABLE shared.release_document (
  release_version text NOT NULL REFERENCES shared.seam_release (version),
  file_path       text NOT NULL,
  blocks          jsonb NOT NULL, -- ordered [{type: 'text'|'rule'|'contents', ...}]
  PRIMARY KEY (release_version, file_path)
);

-- Eval suite pinned per release (FR-E.1: "plus the eval suite as it stands").
CREATE TABLE shared.release_eval_case (
  release_version text NOT NULL REFERENCES shared.seam_release (version),
  eval_case_id    int  NOT NULL,
  snapshot        jsonb NOT NULL,
  PRIMARY KEY (release_version, eval_case_id)
);

CREATE TABLE shared.bundle_export (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_version text NOT NULL REFERENCES shared.seam_release (version),
  format          text NOT NULL DEFAULT 'skill-bundle',
  uri             text NOT NULL,
  checksum        text NOT NULL,
  exported_at     timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────
-- Live (working-state) document model: the seam files as ordered
-- blocks. Rule blocks point at rule_id; text blocks hold editorial
-- content verbatim. This is what makes export byte-identical.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE shared.seam_file (
  file_path text PRIMARY KEY, -- e.g. 'SKILL.md', 'seam/regulatory-rules.md'
  kind      text NOT NULL CHECK (kind IN ('document', 'rules', 'evals'))
);

CREATE TABLE shared.seam_section (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path      text NOT NULL REFERENCES shared.seam_file (file_path),
  position       int  NOT NULL,
  heading        text,           -- verbatim heading line, e.g. '## DORA'
  contents_label text,           -- e.g. 'DORA (EU)' for the generated Contents index
  UNIQUE (file_path, position)
);

CREATE TABLE shared.seam_block (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path    text NOT NULL REFERENCES shared.seam_file (file_path),
  section_id   uuid REFERENCES shared.seam_section (id),
  position     int  NOT NULL,
  block_type   text NOT NULL CHECK (block_type IN ('text', 'rule', 'contents')),
  text_content text,
  rule_id      text REFERENCES shared.rule (rule_id),
  UNIQUE (file_path, section_id, position),
  CONSTRAINT block_payload CHECK (
    (block_type = 'rule' AND rule_id IS NOT NULL)
    OR (block_type <> 'rule' AND rule_id IS NULL)
  )
);

-- Review policy by kind (FR-B.3). Default: review required everywhere;
-- the Practice Lead may downgrade icp/messaging.
CREATE TABLE shared.review_policy (
  kind            text PRIMARY KEY,
  requires_review boolean NOT NULL DEFAULT true,
  mandatory       boolean NOT NULL DEFAULT false -- true = not downgradable (regulatory, claim)
);

-- Voice-lint overrides, recorded with a reason (FR-A.5 / FR-E.5).
CREATE TABLE shared.lint_override (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_version_id uuid NOT NULL REFERENCES shared.rule_version (id),
  field           text NOT NULL,
  word            text NOT NULL, -- the banned word or 'em_dash'
  reason          text NOT NULL,
  recorded_by     uuid NOT NULL REFERENCES shared.app_user (id),
  recorded_at     timestamptz NOT NULL DEFAULT now()
);

-- Every state transition logged with actor and timestamp (FR-9.1).
CREATE TABLE shared.audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  object_type text NOT NULL,
  object_id   text NOT NULL,
  action      text NOT NULL,
  actor_id    uuid REFERENCES shared.app_user (id),
  detail      jsonb NOT NULL DEFAULT '{}',
  at          timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────
-- 4.2 Tenant schema (RLS keyed on tenant_id; policies in 002)
-- Phase 1: tables exist, surfaces deferred to Phase 2/3.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE tenant.tenant (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL UNIQUE,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'offboarded')),
  onboarded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shared.app_user
  ADD CONSTRAINT app_user_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenant.tenant (id);

CREATE TABLE tenant.engagement (
  tenant_id     uuid NOT NULL REFERENCES tenant.tenant (id),
  jurisdictions text[] NOT NULL DEFAULT '{}',
  regimes       text[] NOT NULL DEFAULT '{}',
  sla_tier      text,
  line_flags    jsonb NOT NULL DEFAULT '{"retainer": false, "scoped": false, "success": false}',
  start_date    date,
  PRIMARY KEY (tenant_id)
);

-- Versioned like rules (state machine 5.5), tenant-scoped.
CREATE TABLE tenant.claim (
  claim_id    text NOT NULL,
  tenant_id   uuid NOT NULL REFERENCES tenant.tenant (id),
  version     int  NOT NULL DEFAULT 1,
  statement   text NOT NULL,
  category    text NOT NULL CHECK (category IN ('capability', 'security_cert_residency', 'deployment_reference', 'figure')),
  evidence    text,
  approved_by text,
  approved_at date,
  review_date date,
  status      text NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'in_review', 'active', 'stale', 'retired')),
  change_note text,
  PRIMARY KEY (tenant_id, claim_id, version)
);

CREATE TABLE tenant.tenant_pin (
  tenant_id       uuid NOT NULL REFERENCES tenant.tenant (id),
  release_version text NOT NULL REFERENCES shared.seam_release (version),
  pinned_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, release_version, pinned_at)
);

CREATE TABLE tenant.deployment (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant.tenant (id),
  environment text NOT NULL,
  bundle_uri  text NOT NULL,
  deployed_at timestamptz NOT NULL DEFAULT now(),
  active      boolean NOT NULL DEFAULT true
);

CREATE TABLE tenant.gap_log (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenant.tenant (id),
  gap_kind                    text NOT NULL CHECK (gap_kind IN
                                ('uncovered_objection', 'missing_jurisdiction', 'missing_input_pattern', 'uncovered_regime')),
  abstention_text             text NOT NULL,
  prospect_context_abstracted jsonb NOT NULL DEFAULT '{}', -- schema-bounded (FR-9.5)
  jurisdiction                text,
  logged_at                   timestamptz NOT NULL DEFAULT now(),
  triage_status               text NOT NULL DEFAULT 'untriaged'
                              CHECK (triage_status IN ('untriaged', 'duplicate', 'backlog', 'rejected', 'in_authoring', 'closed')),
  triage_reason               text,
  linked_backlog_id           uuid
);

CREATE TABLE tenant.audit_pull (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenant.tenant (id),
  artifact_ref          text NOT NULL,
  cited_release_version text NOT NULL REFERENCES shared.seam_release (version),
  requested_by          text,
  generated_at          timestamptz NOT NULL DEFAULT now(),
  report_uri            text
);

CREATE TABLE tenant.sla_event (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant.tenant (id),
  watch_item_id   uuid NOT NULL REFERENCES shared.watch_item (id),
  triggered_at    timestamptz,
  stale_flagged_at timestamptz,
  republished_at  timestamptz,
  tier            text,
  breach          boolean NOT NULL DEFAULT false
);

CREATE TABLE tenant.billing_event (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant.tenant (id),
  line        text NOT NULL CHECK (line IN ('retainer', 'scoped', 'success')),
  trigger_ref text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
