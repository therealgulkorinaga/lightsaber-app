# Seam: ICP and Scoring

Seam component version: 1.1.0 (2026-06-10, Lightsaber). Scope: shared. Kind: icp.
Change note 1.1.0: ICP-DQ-001 retired and replaced by ICP-DQ-003 on the addition of US coverage; regulator anchors extended.

The guardrail-pain ICP. The thesis: the best prospect is the firm where compliance review is the binding constraint on adopting AI, because that is where a grounded, review-ready sale wins against a better demo. Each signal is a rule so the weighting is authored and auditable, never hidden in engine behaviour.

## Scoring method

1. Test disqualifiers first. Any ICP-DQ rule that fires ends qualification: recommendation Park, rule cited, no score.
2. Score each ICP signal 0, 1 or 2 against its anchors. If the inputs to score a signal are absent, skip it and log it under Missing inputs; skipped signals leave the denominator.
3. Weighted score = sum(signal score x weight). Maximum = sum(2 x weight) over scored signals only. Report the percentage.
4. Band: **Pursue** at 70% and above. **Develop** from 45% to 69%. **Park** below 45%.
5. Output the three highest-weighted contributing rules as drivers, with IDs.

## Disqualifiers

### ICP-DQ-003 Outside covered jurisdictions
weight: n/a | status: active | v1.0 (added in seam 1.1.0; replaces ICP-DQ-001, retired 2026-06-10)
- **Test:** The prospect's regulated footprint and the AI touchpoint are wholly outside the UK, EU and US, with no concrete entry plan.
- **Rationale:** The seam covers UK, EU and US regimes only. Selling on regime grounding the seam does not hold violates the grounding rule.

### ICP-DQ-002 No regulated nexus
weight: n/a | status: active | v1.0
- **Test:** The firm is unregulated, faces no authorisation path, and the AI touchpoint creates no regulated exposure.
- **Rationale:** Without a compliance gate the wedge has nothing to cut. A different playbook applies; this skill is the wrong tool.

## Signals

### ICP-001 Regulated status
weight: 3 | status: active | v1.0
- **0:** Unregulated, regulation distant. **1:** Authorisation in progress or light-perimeter (for example registered-only). **2:** Fully authorised or supervised firm (bank, payments or e-money institution, investment firm, CASP, insurer, lender) under FCA, PRA, CBI, BaFin, AMF, OCC, the Federal Reserve, FDIC, NYDFS, DFPI or peer.
- **Why weighted high:** Authorisation is what makes the review gate real. Inputs: firm_type, regulator.

### ICP-002 Live regime exposure
weight: 3 | status: active | v1.0
- **0:** No current regime pressure on the AI decision. **1:** General exposure, no dated pressure. **2:** Dated, named exposure: in DORA scope now, AI Act transparency duties from August 2026, the CPPA's 1 January 2027 automated-decisionmaking date, an NYDFS Part 500 obligation, a supervisory finding, an authorisation condition.
- **Why weighted high:** Dated exposure converts interest into a buying clock. Cross-check against regulatory rules, AIA-TML-007 included, and respect its staleness state. Inputs: firm_type, jurisdiction, ai_touchpoint.

### ICP-003 A compliance veto exists
weight: 3 | status: active | v1.0
- **0:** No identifiable compliance function in the buying path. **1:** Compliance consulted late or informally. **2:** Named CCO, DPO or model-risk owner with documented sign-off power over vendor adoption.
- **Why weighted high:** The wedge is winning at the veto desk. No veto, no differentiation. Inputs: buyer_persona, deal_state.

### ICP-004 A prior attempt stalled at review
weight: 2 | status: active | v1.0
- **0:** No prior AI attempt. **1:** Prior attempt, outcome unclear. **2:** A vendor or internal build died at compliance, legal or procurement review, and the pain is owned by someone still there.
- **Why it matters:** The buyer has pre-paid the lesson the sale teaches. Discovery should find the corpse and learn its cause of death. Inputs: deal_state.

### ICP-005 AI touches a regulated workflow
weight: 2 | status: active | v1.0
- **0:** Pure back-office tooling, no regulated surface. **1:** Adjacent to a regulated workflow. **2:** Inside credit, onboarding and AML, complaints, advice, reporting or another supervised workflow.
- **Why it matters:** Regulated surface raises the review stakes, which raises the value of grounded selling. It also raises obligations; pair with the Navigate review stage early. Inputs: ai_touchpoint.

### ICP-006 Data sensitivity
weight: 1 | status: active | v1.0
- **0:** No personal or transaction data confirmed. **1:** Personal data. **2:** Special-category, large-scale retail, or transaction data.
- **Why it matters:** Sensitivity predicts DPO depth (GDPR-DPIA-005, GDPR-TRF-004 territory) and so predicts where the deal will be won or stalled. Inputs: data_classes.

### ICP-007 Procurement and TPRM maturity
weight: 1 | status: active | v1.0
- **0:** No formal vendor process (also means budget signals are weak). **1:** Lightweight process. **2:** Formal TPRM with security questionnaires and register processes.
- **Why it matters:** A mature process means a longer cycle and a real budget, and it is exactly the terrain the evidence-pack approach is built for. Inputs: deal_state, firm_type.

### ICP-008 A buying trigger is dated
weight: 2 | status: active | v1.0
- **0:** No trigger. **1:** Soft trigger (strategy initiative, new hire). **2:** Hard dated trigger: regulatory deadline, audit finding, incident post-mortem, board mandate with a date.
- **Why it matters:** Dated triggers beat enthusiasm. Tie outreach and the business case to the trigger's date. Inputs: deal_state.

### ICP-009 Size band fits
weight: 1 | status: active | v1.0
- **0:** Too small to hold a compliance function, or so large that vendor onboarding alone exceeds the adopter's sales capacity. **1:** Borderline either way. **2:** Mid-size: real compliance function, navigable buying committee.
- **Why it matters:** The wedge needs a veto desk that exists and a committee a seller can reach. Inputs: firm.

### ICP-010 Champion seniority and risk ownership
weight: 2 | status: active | v1.0
- **0:** Enthusiast without budget or risk ownership. **1:** Manager with influence, not accountable. **2:** Sponsor who personally owns the risk or the outcome (an SMF-holder under FCA-SMCR-004, a named accountable executive).
- **Why it matters:** In this market the buyer who signs is the buyer whose name is on the risk. Inputs: buyer_persona, deal_state.

## Output

Qualification artifacts report: band, percentage, the three top drivers with rule IDs, fired disqualifiers if any, missing inputs with the rule that needs each, and the regime exposure list per the Qualify stage logic in SKILL.md.
