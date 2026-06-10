-- The guarantees, enforced in the database rather than the application:
--   FR-G.1 / FR-9.2  immutable, append-only history
--   FR-B.3 / FR-B.4  two-person review, approval bound to content
--   FR-9.3           no publish path for a red candidate
--   5.2              release state machine transitions

-- ── rule_version: append-only; frozen once approved ───────────

CREATE OR REPLACE FUNCTION shared.rule_version_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'rule_version rows are never deleted (FR-G.1)';
  END IF;

  -- Once approved, content is frozen for good (FR-B.4): a later edit is a new version.
  IF OLD.review_state = 'approved' THEN
    RAISE EXCEPTION 'version % is approved and immutable; author a new version (FR-B.4)', OLD.id;
  END IF;

  -- Approving: enforce the two-person rule at the database level.
  IF NEW.review_state = 'approved' AND OLD.review_state IS DISTINCT FROM 'approved' THEN
    IF NEW.reviewer_id IS NULL THEN
      RAISE EXCEPTION 'approval requires a reviewer (FR-B.2)';
    END IF;
    IF NEW.reviewer_id = NEW.author_id THEN
      RAISE EXCEPTION 'the author of a version cannot be its reviewer (FR-B.1/B.3)';
    END IF;
    IF NEW.approved_at IS NULL THEN
      NEW.approved_at := now();
    END IF;
    IF NEW.content_hash IS NULL THEN
      RAISE EXCEPTION 'approval binds to content; content_hash must be set (FR-B.4)';
    END IF;
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER rule_version_guard
  BEFORE UPDATE OR DELETE ON shared.rule_version
  FOR EACH ROW EXECUTE FUNCTION shared.rule_version_guard();

-- ── seam_release: state machine + publish gate ────────────────

CREATE OR REPLACE FUNCTION shared.seam_release_guard() RETURNS trigger AS $$
DECLARE
  run RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'releases are never deleted (FR-9.2)';
  END IF;

  -- Published releases are immutable except deprecation (5.2).
  IF OLD.status = 'published' AND NEW.status <> 'deprecated' THEN
    RAISE EXCEPTION 'release % is published and immutable (FR-9.2)', OLD.version;
  END IF;
  IF OLD.status = 'deprecated' THEN
    RAISE EXCEPTION 'release % is deprecated and terminal', OLD.version;
  END IF;

  -- Legal transitions only (5.2). No path from staged to published bypasses eval.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'draft'        AND NEW.status = 'staged') OR
      (OLD.status = 'staged'       AND NEW.status = 'eval_running') OR
      (OLD.status = 'eval_running' AND NEW.status IN ('eval_passed', 'eval_failed')) OR
      (OLD.status = 'eval_failed'  AND NEW.status = 'draft') OR
      (OLD.status = 'eval_passed'  AND NEW.status = 'published') OR
      (OLD.status = 'published'    AND NEW.status = 'deprecated')
    ) THEN
      RAISE EXCEPTION 'illegal release transition % -> % (state machine 5.2)', OLD.status, NEW.status;
    END IF;
  END IF;

  -- The gate is technically blocking (FR-9.3): publishing requires a green
  -- eval run recorded against this exact candidate version.
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
    IF NEW.eval_run_id IS NULL THEN
      RAISE EXCEPTION 'no publish without a recorded eval run (FR-9.3)';
    END IF;
    SELECT * INTO run FROM shared.eval_run WHERE id = NEW.eval_run_id;
    IF run IS NULL OR run.passed IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'no publish path exists for a red candidate (FR-9.3)';
    END IF;
    IF run.candidate_version <> NEW.version THEN
      RAISE EXCEPTION 'eval run % is for candidate %, not % (FR-9.3)',
        NEW.eval_run_id, run.candidate_version, NEW.version;
    END IF;
    IF NEW.published_at IS NULL THEN
      NEW.published_at := now();
    END IF;
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER seam_release_guard
  BEFORE UPDATE OR DELETE ON shared.seam_release
  FOR EACH ROW EXECUTE FUNCTION shared.seam_release_guard();

-- ── frozen-by-construction tables ──────────────────────────────

CREATE OR REPLACE FUNCTION shared.immutable_row() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable (FR-9.2)', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER bundle_export_immutable
  BEFORE UPDATE OR DELETE ON shared.bundle_export
  FOR EACH ROW EXECUTE FUNCTION shared.immutable_row();

CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON shared.audit_log
  FOR EACH ROW EXECUTE FUNCTION shared.immutable_row();

CREATE TRIGGER release_rule_version_immutable
  BEFORE UPDATE OR DELETE ON shared.release_rule_version
  FOR EACH ROW EXECUTE FUNCTION shared.immutable_row();

CREATE TRIGGER release_document_immutable
  BEFORE UPDATE OR DELETE ON shared.release_document
  FOR EACH ROW EXECUTE FUNCTION shared.immutable_row();

CREATE TRIGGER release_eval_case_immutable
  BEFORE UPDATE OR DELETE ON shared.release_eval_case
  FOR EACH ROW EXECUTE FUNCTION shared.immutable_row();

-- Retired rules stay retired; their IDs are never reused (FR-A.2, 5.1).
CREATE OR REPLACE FUNCTION shared.rule_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'rules are never deleted; retire them (FR-G.1)';
  END IF;
  IF OLD.status = 'retired' AND NEW.status <> 'retired' THEN
    RAISE EXCEPTION 'retired is terminal for %; a replacement takes a new ID (5.1)', OLD.rule_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER rule_guard
  BEFORE UPDATE OR DELETE ON shared.rule
  FOR EACH ROW EXECUTE FUNCTION shared.rule_guard();
