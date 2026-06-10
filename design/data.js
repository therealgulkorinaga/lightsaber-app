// ============================================================
//  Loom — sample seam data (plain JS global, no JSX)
//  Loaded with <script src="data.js"> before the Babel app.
// ============================================================
(function () {
  // Seam-wide facts
  const SEAM = {
    version: '1.1.0',
    counts: { regulatory: 59, icp: 10, objection: 12, messaging: 7 },
  };

  // The voice kill-list (seam authoring voice + brand marketing kill-list).
  const BANNED = [
    'Actually', 'Really', 'Quietly', 'Genuine', 'Interesting', 'Significant',
    'Essentially', 'Straightforward', 'Momentum',
    'best-in-class', 'industry-leading', 'AI-powered', 'cutting-edge',
    'revolutionary', 'seamless', 'empower', 'unlock', 'leverage', 'delight',
  ];

  // prospect-object fields the coverage gate can reference
  const PROSPECT_FIELDS = [
    'firm', 'firm_type', 'jurisdiction', 'regulator', 'buyer_persona',
    'service_sold', 'ai_touchpoint', 'data_classes', 'deployment_model', 'deal_state',
  ];

  // Jurisdiction catalogue — for tag validation + layer resolution
  const JURIS = {
    UK: { label: 'United Kingdom', layer: 'national', parent: null },
    EU: { label: 'European Union', layer: 'union', parent: null },
    IE: { label: 'Ireland', layer: 'member-state', parent: 'EU' },
    DE: { label: 'Germany', layer: 'member-state', parent: 'EU' },
    FR: { label: 'France', layer: 'member-state', parent: 'EU' },
    NL: { label: 'Netherlands', layer: 'member-state', parent: 'EU' },
    US: { label: 'United States', layer: 'federal', parent: null },
    'US-NY': { label: 'New York', layer: 'state', parent: 'US' },
    'US-CA': { label: 'California', layer: 'state', parent: 'US' },
    'US-TX': { label: 'Texas', layer: 'state', parent: 'US' },
    'US-NYC': { label: 'New York City', layer: 'city', parent: 'US-NY' },
  };

  // The active version on file (baseline for the diff). DORA-CON-003 v1.0.
  const BASELINE = {
    rule_id: 'DORA-CON-003',
    kind: 'regulatory',
    title: 'Mandatory contractual provisions',
    jurisdiction: ['EU'],
    regime: 'DORA',
    statement:
      'Contracts with ICT third-party providers must contain a defined set of provisions: full service description, data processing locations, availability and security commitments, incident assistance, access and audit rights, termination rights and notice. Where the service supports a critical or important function, extended provisions apply, including exit strategies, broader audit and inspection rights, and performance targets.',
    buyer_reading:
      'Their legal team arrives with a mandatory clause list. A vendor that arrives with a DORA-ready contractual schedule shortens review by weeks; a vendor that resists these clauses is unsellable internally.',
    authority:
      'DORA Art 30, with Art 30(3) extended provisions for critical or important functions.',
    applicability:
      'Prospect is an EU financial entity in DORA scope (banks, payment and e-money institutions, investment firms, CASPs, insurers, among others).',
    inputs: ['firm_type', 'jurisdiction', 'ai_touchpoint'],
    status: 'active',
    version: '1.0',
  };

  // The working draft the author is editing now (v1.1 candidate).
  // Deliberately carries one em-dash and one banned word so lint has work.
  const DRAFT = Object.assign({}, BASELINE, {
    statement:
      'Contracts with ICT third-party providers must contain a defined set of provisions: full service description, data processing locations, availability and security commitments, incident assistance, access and audit rights, termination rights and notice. Where the service supports a critical or important function, extended provisions apply — including exit strategies, broader audit and inspection rights, performance targets, and a named subcontractor register made available at onboarding. This is a Significant addition under the 2024 RTS on contractual content.',
    authority:
      'DORA Art 30, with Art 30(3) extended provisions for critical or important functions; ESAs Regulatory Technical Standards on the content of contractual arrangements (2024).',
    status: 'draft',
    version: '1.1',
  });

  // Field order + display labels for the form
  const FIELDS = [
    { key: 'statement', label: 'Statement', req: true, area: true, rows: 6,
      help: 'The substance the engine may assert. One assertable unit. Load-bearing for grounding.' },
    { key: 'buyer_reading', label: 'Buyer reading', req: true, area: true, rows: 4,
      help: 'How the buyer\u2019s compliance function reads this in a buying decision. Where the selling value lives.' },
    { key: 'authority', label: 'Authority', req: true, area: true, rows: 2, mono: true,
      help: 'The instrument the statement rests on, at article level where certain. Never invented.' },
    { key: 'applicability', label: 'Applicability', req: true, area: true, rows: 3,
      help: 'Conditions under which the rule fires.' },
  ];

  // Provenance
  const PROVENANCE = {
    author: 'R. Hale',
    author_role: 'Legal specialist',
    reviewer: 'Unassigned',
    created: '2026-05-27',
    edited: '2026-06-10 14:08',
    change_note: 'Add named-subcontractor register requirement per 2024 RTS; cite RTS in authority.',
  };

  window.LOOM = { SEAM, BANNED, PROSPECT_FIELDS, JURIS, BASELINE, DRAFT, FIELDS, PROVENANCE };
})();
