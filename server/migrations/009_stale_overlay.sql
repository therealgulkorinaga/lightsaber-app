-- FR-C.4: a staled rule renders `status: stale` in the live export and in any
-- candidate assembled after the trigger, while past releases stay byte-stable
-- (FR-G.3). Rule versions are immutable, so staleness is an overlay: live
-- export reads rule.status; a release pins the overlay at assembly time.
ALTER TABLE shared.release_rule_version ADD COLUMN status_override text
  CHECK (status_override IN ('stale'));
