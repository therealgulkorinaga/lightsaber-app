# Seam: Objection Corpus

Seam component version: 1.1.0 (2026-06-10, Lightsaber). Scope: shared. Kind: objection.
Change note 1.1.0: US regulatory anchors added to OBJ-006 and OBJ-011; jurisdiction filtering noted.

Buyer objections mapped to grounded responses. Match by substance, not phrasing. Each entry gives the response substance the engine may use, the regulatory rules it rests on, and what must come from the tenant claims file rather than this corpus. The engine filters an entry's cited rules by the prospect's jurisdiction and responds on the survivors; where none survive, or where no entry matches at all, the objection is uncovered for that prospect: abstain and log it verbatim as an authoring candidate, per SKILL.md operating rule 3.

### OBJ-001 "We cannot let an AI vendor touch customer data"
status: active | v1.0 | rests on: GDPR-PRC-002, GDPR-SUB-003, GDPR-MIN-007, GDPR-TRF-004, DORA-CON-003
- **Substance:** Reframe from whether to under what controls. The law already defines the conditions for a vendor touching customer data: processor terms with mandatory content [GDPR-PRC-002], a disclosed and authorised sub-processor chain [GDPR-SUB-003], minimisation and a no-training position stated contractually [GDPR-MIN-007], residency or a transfer mechanism [GDPR-TRF-004], and the DORA contract schedule where in scope [DORA-CON-003]. Offer the artefacts that operationalise each.
- **Claims gap:** Residency, retention and no-training positions are tenant claims. Without them, present the control framework and mark the vendor-side facts TO EVIDENCE.

### OBJ-002 "Data cannot leave the EEA" (or the UK)
status: active | v1.0 | rests on: GDPR-TRF-004
- **Substance:** Agree with the premise; it is the buyer's transfer rule, not an obstacle invented for you [GDPR-TRF-004]. The question becomes architectural: where does processing happen, where do model calls route, who can access from where. If the adopter can evidence EEA or UK processing, the objection closes. If not, the honest path is SCCs (or IDTA) plus a transfer impact assessment, costed into the timeline rather than waved away.
- **Claims gap:** The actual processing locations are tenant claims. Never assert residency the claims file does not hold.

### OBJ-003 "The EU AI Act makes this high-risk, too hard for us"
status: active | v1.0 | rests on: AIA-CLS-001, AIA-HRC-002, AIA-DEP-003, AIA-TML-007
- **Substance:** Classification before conclusion [AIA-CLS-001]. If the use is credit-touching, high-risk is the right starting assumption [AIA-HRC-002] and the sale plans for deployer-duty support [AIA-DEP-003]. If not, walk the classification to where the service lands. On timing, use the current dates with their status: high-risk deferred to December 2027 under the Omnibus political agreement, transparency duties from August 2026, adoption pending [AIA-TML-007, check staleness]. Too hard usually means unclassified; offer the written classification position.
- **Claims gap:** Any present-tense conformity or certification claim is tenant-only.

### OBJ-004 "Our DPO will demand a DPIA and that takes months"
status: active | v1.0 | rests on: GDPR-DPIA-005, GDPR-BAS-001
- **Substance:** The DPIA is probably owed [GDPR-DPIA-005], so compress it instead of contesting it. Offer the DPIA support pack: processing description, data-flow map, vendor-side risks and mitigations, plus the lawful-basis material for the DPO's first question [GDPR-BAS-001]. Position the pack as taking the document from months to weeks because the vendor-side half arrives pre-written.
- **Claims gap:** The pack's vendor facts come from tenant claims; the offer of the pack does not.

### OBJ-005 "DORA means audit rights and exit plans vendors never agree to"
status: active | v1.0 | rests on: DORA-CON-003, DORA-EXT-007, DORA-SUB-005, DORA-REG-002
- **Substance:** Invert it: the adopter agrees to them by design. The Art 30 clause set is known and finite [DORA-CON-003]; exit and data-return positions can be tabled in writing [DORA-EXT-007]; the sub-processor chain disclosed [DORA-SUB-005]; register data supplied in the buyer's format [DORA-REG-002]. A vendor built for DORA paper is the easiest vendor this buyer will onboard this year. Offer the contract pack at the next step.
- **Claims gap:** The pack itself, audit-rights particulars and exit mechanics are tenant claims or adopter legal positions; the clause map is seam.

### OBJ-006 "Model risk will not approve a black box"
status: active | v1.1 | rests on: AIA-PRV-004, AIA-DEP-003, FCA-AI-005, US-MRM-002
- **Substance:** Sell the oversight surface, not the internals. What model risk needs is documentation, logging, defined human-oversight points and monitoring hooks, the same surface provider and deployer duties demand [AIA-PRV-004, AIA-DEP-003]; in the UK the existing-rulebook approach makes that surface the test [FCA-AI-005]; at a US banking buyer the same surface feeds SR 11-7 validation, inventory and monitoring demands [US-MRM-002]. Ask what their model-risk standard requires and map artefact to requirement rather than debating explainability in the abstract.
- **Claims gap:** What documentation, logging and oversight controls the adopter's product exposes is tenant-only. Without claims, state the category of artefact model risk will ask for and mark TO EVIDENCE.

### OBJ-007 "We tried AI before and compliance killed it"
status: active | v1.0 | rests on: ICP-004 (signal), plus the regulatory rules matching the autopsy
- **Substance:** Treat as the highest-value discovery opening in the corpus, not a rebuttal target. Run the autopsy: which desk stopped it (DPO, TPRM, model risk, procurement), on what ground, at what stage. Then map the cause of death to its rule and show, gate by gate, how the review-first approach answers that gate this time. The prior failure is the budget justification.
- **Claims gap:** None inherent; the autopsy pulls regulatory rules as found.

### OBJ-008 "The regulator has not approved AI for this"
status: active | v1.0 | rests on: FCA-AI-005, AIA-CLS-001
- **Substance:** Correct the model of how approval works, gently. In the UK there is no AI approval gate to wait for; existing rules apply now and the FCA has said so, with innovation channels open [FCA-AI-005]. In the EU the AI Act defines obligations by classification, not a permission ceremony [AIA-CLS-001]. The right question is which existing obligations this use triggers, and that question has a written answer.
- **Claims gap:** None.

### OBJ-009 "Under Consumer Duty we carry the can if your model misfires"
status: active | v1.0 | rests on: FCA-CD-003, GDPR-ADM-006, AIA-DEP-003
- **Substance:** Agree on accountability and answer with the harm-handling design: what happens to the customer when the model is wrong, escalation to humans, outcome monitoring [FCA-CD-003]; human-in-the-loop and contest routes where decisions bite [GDPR-ADM-006]; the oversight duties the buyer must discharge anyway and how the product makes that cheap [AIA-DEP-003].
- **Claims gap:** The product's actual escalation, monitoring and oversight features are tenant claims.

### OBJ-010 "Procurement requires our paper and uncapped liability"
status: active | v1.0 | rests on: XRG-001, DORA-CON-003
- **Substance:** Split regulatory from commercial. The regulatory clause families are non-negotiable and the adopter should accept them by design [XRG-001, DORA-CON-003]; arriving with the mapped contract pack proves it. Liability caps, indemnities and paper choice are commercial positions this corpus does not set.
- **Abstention required:** Commercial terms are out of seam scope. State that plainly and route to the adopter's deal desk. Do not improvise a liability position.

### OBJ-011 "You are a startup; you will not pass our TPRM"
status: active | v1.1 | rests on: DORA-TPR-001, PRA-OUT-001, FCA-OUT-001, US-TPR-001, DORA-SUB-005
- **Substance:** Name what TPRM tests: control over the function, oversight access, chain transparency, continuity [DORA-TPR-001, PRA-OUT-001, FCA-OUT-001, US-TPR-001]. Size is a proxy for those; evidence beats the proxy. Offer the assessment pack up front (security posture, chain disclosure [DORA-SUB-005], continuity position) and ask for the buyer's questionnaire rather than waiting for it.
- **Claims gap:** Certifications, security posture, references and continuity facts are tenant claims. With an empty claims file, commit only to the process: completing their questionnaire and evidencing controls under NDA.

### OBJ-012 "Senior management will not sign; accountability stays with us"
status: active | v1.0 | rests on: FCA-SMCR-004, MICA-OUT-002, FCA-OUT-001
- **Substance:** True everywhere and answerable: responsibility never transfers [FCA-OUT-001, MICA-OUT-002 for CASPs], and a named senior manager owns the call [FCA-SMCR-004]. So the sale's job is the reasonable-steps file: the evidence pack that lets the accountable person show diligence, oversight and exit options. Sell the file that protects the signer.
- **Claims gap:** The pack's vendor facts are tenant claims.
