-- Designing against the quiet failure modes of assisted authoring:
--
-- Anchoring: accepting an agent draft must be a real verification act. Each
-- authority source carries a read-tick; an ai_assisted version cannot be
-- submitted until its author has ticked every source as read.
ALTER TABLE shared.source
  ADD COLUMN verified_by uuid REFERENCES shared.app_user (id),
  ADD COLUMN verified_at timestamptz;

-- Eval poisoning: eval authoring must be independent of the agent's draft.
-- Evals record their human author; the assist layer has no eval-writing
-- capability by construction, and this column makes the independence auditable.
ALTER TABLE shared.eval_case
  ADD COLUMN created_by uuid REFERENCES shared.app_user (id); -- null = shipped 1.1.0 suite
