// ============================================================
//  Loom — sample data for screens 2–5 (plain JS global)
// ============================================================
(function () {

  // ── Regime Watch ────────────────────────────────────────────
  const watch = [
    {
      id: 'AIA-TML-007', regime: 'EU AI Act', state: 'triggered',
      title: 'Application timeline (Digital Omnibus)',
      trigger: 'Event: Omnibus formal adoption pending — provisional political agreement 7 May 2026, Official Journal publication expected before 2 Aug 2026.',
      reverify: '2 Aug 2026', reverifyState: 'due', deps: 4,
      impact: {
        triggeredOn: '7 May 2026',
        summary: 'The Digital Omnibus agreement defers Annex III high-risk obligations to Dec 2027 but leaves the 2 Aug 2026 transparency date intact. Every timeline-dependent rule must be re-verified and re-authored once the Omnibus is formally adopted and published.',
        staled: [
          { id: 'AIA-TML-007', title: 'Application timeline, as amended in negotiation', from: 'active', to: 'stale' },
          { id: 'AIA-TRN-005', title: 'Transparency-tier duties', from: 'active', to: 'in_review', note: 'cites AIA-TML-007 for Art 50 timing' },
        ],
        tenants: [
          { name: 'Mercia Payments', version: '1.1.0', rules: 2 },
          { name: 'Northwind Bank', version: '1.0.0', rules: 2 },
          { name: 'Dolfin Capital', version: '1.1.0', rules: 1 },
        ],
        artifacts: [
          { id: 'ART-2041', kind: 'Business case', tenant: 'Mercia Payments', cited: 'AIA-TML-007', date: '14 May 2026' },
          { id: 'ART-2033', kind: 'Objection response', tenant: 'Northwind Bank', cited: 'AIA-TML-007, AIA-TRN-005', date: '9 May 2026' },
          { id: 'ART-2018', kind: 'Discovery set', tenant: 'Dolfin Capital', cited: 'AIA-TML-007', date: '2 May 2026' },
        ],
      },
    },
    {
      id: 'US-AI-009', regime: 'US federal', state: 'overdue',
      title: 'Federal AI posture & preemption contest',
      trigger: 'Event: Federal preemption litigation — Dec 2025 executive order directing challenges to state AI laws; outcome unresolved.',
      reverify: '15 May 2026', reverifyState: 'overdue', reverifyNote: '26 days overdue', deps: 6,
    },
    {
      id: 'IE-AI-006', regime: 'EU AI Act · IE', state: 'monitoring',
      title: 'AI Act competent-authority designation',
      trigger: 'Date: National AI Office stand-up — CBI designation list to finalise around the Aug 2026 milestone.',
      reverify: '2 Aug 2026', reverifyState: 'ok', deps: 3,
    },
    {
      id: 'GDPR-TRF-004', regime: 'GDPR', state: 'monitoring',
      title: 'EEA / UK transfer mechanism',
      trigger: 'Date: EU-US Data Privacy Framework adequacy review window.',
      reverify: '30 Sep 2026', reverifyState: 'ok', deps: 5,
    },
    {
      id: 'NY-DFS-001', regime: 'NYDFS', state: 'monitoring',
      title: 'Part 500 AI guidance phase-in',
      trigger: 'Date: Part 500 final transitional date — Nov 2023 amendments phased through 2026.',
      reverify: '1 Nov 2026', reverifyState: 'ok', deps: 4,
    },
  ];

  // ── Coverage matrix ─────────────────────────────────────────
  const coverage = {
    regimes: ['Outsourcing', 'AI law', 'Data', 'Conduct', 'Fin-crime', 'Accountability'],
    rows: ['UK', 'EU', 'IE', 'US', 'US-NY', 'US-CA', 'US-TX'],
    // [count, staleCount] per cell, or null = out of scope
    cells: {
      'UK':    [[3, 0], [1, 0], [7, 0], [1, 0], null,   [2, 0]],
      'EU':    [[7, 0], [7, 1], [7, 0], null,   null,   [1, 0]],
      'IE':    [[1, 0], [1, 0], [1, 0], [1, 0], null,   [2, 0]],
      'US':    [[2, 0], [1, 1], [1, 0], [3, 0], [1, 0], [1, 0]],
      'US-NY': [null,   [2, 0], null,   [1, 0], null,   [1, 0]],
      'US-CA': [null,   [2, 0], [2, 0], null,   null,   [1, 0]],
      'US-TX': [null,   [1, 0], [2, 0], null,   null,   null],
    },
  };

  // ── Gap backlog (from live-deal abstentions) ────────────────
  const gaps = [
    { id: 'GAP-031', type: 'jurisdiction', title: 'Texas AI law depth thin for credit decisioning',
      sub: 'TX-AI-001 only; no rule for automated-decision disclosure in consumer lending.',
      juris: 'US-TX', regime: 'AI law', freq: 6, cost: 240, lastSeen: '2 days ago' },
    { id: 'GAP-028', type: 'objection', title: 'SOC 2 Type II mapped clause-by-clause to DORA Art 30',
      sub: 'Recurring objection with no OBJ rule; reps improvising the crosswalk.',
      juris: 'EU', regime: 'DORA', freq: 5, cost: 190, lastSeen: 'Yesterday' },
    { id: 'GAP-035', type: 'objection', title: '“Do you train on our data” with an on-prem carve-out',
      sub: 'GDPR-MIN-007 covers the question, not the answer; tenant-claim gap.',
      juris: 'EU, UK', regime: 'GDPR', freq: 8, cost: 120, lastSeen: 'Today' },
    { id: 'GAP-022', type: 'jurisdiction', title: 'California ADMT regs — pricing-AI disclosure path',
      sub: 'CA-ADMT-002 lacks the consumer opt-out mechanics buyers ask about.',
      juris: 'US-CA', regime: 'AI law', freq: 4, cost: 150, lastSeen: '4 days ago' },
    { id: 'GAP-019', type: 'objection', title: 'NYDFS 72-hour clock vs vendor incident-notice window',
      sub: 'No objection rule pairing NY-DFS-001 with contractual notice terms.',
      juris: 'US-NY', regime: 'Accountability', freq: 3, cost: 95, lastSeen: '6 days ago' },
  ];

  // ── Release gate (candidate 1.2.0) ──────────────────────────
  const release = {
    version: '1.2.0', base: '1.1.0', assembled: 9,
    checks: [
      { id: 'eval', title: 'Eval suite', sub: '10 grounding & abstention cases', state: 'fail', pass: 9, total: 10,
        cases: [
          { id: 'EVAL-01', t: 'DORA contract clause checklist — grounded & cited', state: 'pass' },
          { id: 'EVAL-02', t: 'EU AI Act classification position holds', state: 'pass' },
          { id: 'EVAL-03', t: 'GDPR transfer mechanism abstains where residency unknown', state: 'pass' },
          { id: 'EVAL-04', t: 'FCA Consumer Duty retail-harm framing', state: 'pass' },
          { id: 'EVAL-05', t: 'US adverse-action reason codes cited to ECOA', state: 'pass' },
          { id: 'EVAL-06', t: 'NYDFS Part 500 incident notice mapped', state: 'pass' },
          { id: 'EVAL-07', t: 'US-TX credit objection — engine returned a near-miss rule instead of abstaining', state: 'fail' },
          { id: 'EVAL-08', t: 'Stale-rule citation carries staleness warning', state: 'pass' },
          { id: 'EVAL-09', t: 'Tenant-claim separation held (no claim from a regulatory rule)', state: 'pass' },
          { id: 'EVAL-10', t: 'Cross-regime contract stack assembled coherently', state: 'pass' },
        ] },
      { id: 'cite', title: 'Citation integrity', sub: 'every cited authority resolves to a document on file', state: 'pass' },
      { id: 'ground', title: 'Grounding', sub: 'no assertion outside an active rule Statement', state: 'pass' },
      { id: 'voice', title: 'Voice lint', sub: 'kill-list + em-dash across all candidate rules', state: 'pass' },
      { id: 'covpair', title: 'Coverage-paired evals', sub: 'each new rule ships with a paired eval case', state: 'pass' },
    ],
    changelog: [
      { group: 'Added', tone: 'ok', items: [
        { id: 'CA-ADMT-002', note: 'California automated-decision tech' },
        { id: 'TX-BIO-003', note: 'Texas biometric (CUBI)' },
        { id: 'NY-AI-004', note: 'NY state AI in finance' },
        { id: 'US-BAAS-008', note: 'sponsor-bank oversight chain' },
      ] },
      { group: 'Changed', tone: 'accent', items: [
        { id: 'DORA-CON-003', note: 'v1.0 → v1.1 · subcontractor register' },
        { id: 'GDPR-TRF-004', note: 'v1.0 → v1.1 · DPF review note' },
      ] },
      { group: 'Staled', tone: 'warn', items: [
        { id: 'AIA-TML-007', note: 'Omnibus adoption pending' },
      ] },
      { group: 'Re-authored', tone: 'brand', items: [
        { id: 'AIA-TRN-005', note: 'Art 50 timing decoupled' },
      ] },
      { group: 'Retired', tone: 'neutral', items: [
        { id: 'MICA-REC-002', note: 'superseded by MICA-REC-003' },
      ] },
    ],
  };

  // ── Tenant fleet ────────────────────────────────────────────
  const published = '1.1.0';
  const tenants = [
    { name: 'Mercia Payments', type: 'Payments institution', juris: 'EU · IE', version: '1.1.0', stale: 0, claims: 6,
      upgrade: false },
    { name: 'Northwind Bank', type: 'UK Tier-1 bank', juris: 'UK', version: '1.0.0', stale: 2, claims: 4,
      upgrade: true, upgradeDiff: [
        { tone: 'ok', t: '<b>+12 rules</b> — US federal layer, NY / CA / TX state layers' },
        { tone: 'accent', t: '<b>3 changed</b> — DORA-CON-003, GDPR-TRF-004, FCA-OPR-002 re-authored' },
        { tone: 'warn', t: '<b>2 now stale</b> in your pinned version — superseded by newer authored rules' },
      ] },
    { name: 'Dolfin Capital', type: 'Investment firm', juris: 'EU', version: '1.1.0', stale: 0, claims: 0,
      claimsPending: true, upgrade: false },
    { name: 'Harbour Trust', type: 'Building society', juris: 'UK', version: '1.0.0', stale: 1, claims: 3,
      upgrade: true, upgradeDiff: [
        { tone: 'ok', t: '<b>+12 rules</b> — US & state layers (low relevance for UK-only scope)' },
        { tone: 'accent', t: '<b>2 changed</b> — FCA-OPR-002, PRA-OUT-001 clarified' },
        { tone: 'warn', t: '<b>1 now stale</b> in your pinned version' },
      ] },
    { name: 'Tessera', type: 'CASP', juris: 'EU', version: '1.1.0', stale: 0, claims: 2, upgrade: false },
  ];

  window.LOOM2 = { watch, coverage, gaps, release, tenants, published };
})();
