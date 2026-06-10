-- A regime has a jurisdictional footprint: the root tags it can apply under.
-- A rule's jurisdiction tags must each resolve (via the tree) to a root inside
-- its regime's footprint; the editor filters the regime list by the chosen
-- tags and validation blocks a mismatch. Derived from the 1.1.0 corpus:
-- EU instruments (DORA, MiCA, EU AI Act incl. member-state layers), UK
-- supervisors (FCA, PRA), GDPR spanning EU and UK, and cross_regime carrying
-- the layered UK / IE / US coverage.

ALTER TABLE shared.regime ADD COLUMN jurisdictions text[] NOT NULL DEFAULT '{}';

UPDATE shared.regime SET jurisdictions = '{EU}'      WHERE code = 'DORA';
UPDATE shared.regime SET jurisdictions = '{EU}'      WHERE code = 'EU_AI_ACT';
UPDATE shared.regime SET jurisdictions = '{EU,UK}'   WHERE code = 'GDPR';
UPDATE shared.regime SET jurisdictions = '{UK}'      WHERE code = 'FCA';
UPDATE shared.regime SET jurisdictions = '{UK}'      WHERE code = 'PRA';
UPDATE shared.regime SET jurisdictions = '{EU}'      WHERE code = 'MiCA';
UPDATE shared.regime SET jurisdictions = '{UK,EU,US}' WHERE code = 'cross_regime';
