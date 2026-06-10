-- Static reference data: the jurisdiction tree (FR-D.5), regimes,
-- review policy defaults (FR-B.3) and the Phase 1 internal users.
-- The corpus itself is seeded by the seed harness, not by migration.

-- Jurisdiction tree: roots UK, EU, US; member states layer on EU;
-- states layer on US; cities layer on states. Mirrors the seam's model.
INSERT INTO shared.jurisdiction (tag, parent_tag, layer_depth, display_name) VALUES
  ('UK', NULL, 0, 'United Kingdom'),
  ('EU', NULL, 0, 'European Union'),
  ('US', NULL, 0, 'United States (federal)'),
  ('IE', 'EU', 1, 'Ireland'),
  ('DE', 'EU', 1, 'Germany'),
  ('FR', 'EU', 1, 'France'),
  ('NL', 'EU', 1, 'Netherlands'),
  ('US-NY', 'US', 1, 'New York (state)'),
  ('US-CA', 'US', 1, 'California'),
  ('US-TX', 'US', 1, 'Texas'),
  ('US-NYC', 'US-NY', 2, 'New York City');

INSERT INTO shared.regime (code, name) VALUES
  ('DORA', 'Digital Operational Resilience Act'),
  ('EU_AI_ACT', 'EU Artificial Intelligence Act'),
  ('GDPR', 'GDPR and UK GDPR'),
  ('FCA', 'Financial Conduct Authority'),
  ('PRA', 'Prudential Regulation Authority'),
  ('MiCA', 'Markets in Crypto-Assets Regulation'),
  ('cross_regime', 'Cross-regime');

-- FR-B.3: two-person review mandatory for regulatory and claim kinds,
-- on by default and downgradable for icp and messaging. Objections carry
-- regulatory substance, so they default mandatory too. [A]
INSERT INTO shared.review_policy (kind, requires_review, mandatory) VALUES
  ('regulatory', true, true),
  ('claim', true, true),
  ('objection', true, true),
  ('icp', true, false),
  ('messaging', true, false);

-- Phase 1 internal users (fixed IDs so tests and the dev user-switcher are stable).
INSERT INTO shared.app_user (id, name, role) VALUES
  ('00000000-0000-4000-8000-000000000001', 'R. Hale', 'author'),
  ('00000000-0000-4000-8000-000000000002', 'A. Okafor', 'reviewer'),
  ('00000000-0000-4000-8000-000000000003', 'M. Brennan', 'practice_lead'),
  ('00000000-0000-4000-8000-000000000004', 'J. Park', 'analyst');
