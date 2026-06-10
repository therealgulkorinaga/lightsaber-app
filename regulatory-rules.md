# Seam: Regulatory Rules

Seam component version: 1.1.0 (2026-06-10, Lightsaber). Scope: shared. Kind: regulatory.
Change note 1.1.0: added the Ireland national layer and United States coverage (federal, New York state and city, California, Texas); jurisdiction model extended to layered US tags.

The shared regime corpus. Each rule is the unit the engine may assert, framed as a buyer's compliance function raises it in an AI-services buying decision. Regime-level depth by design; humans deepen it rule by rule. Authoring guide: `references/seam-schema.md`.

## Contents

- DORA (EU): DORA-TPR-001, DORA-REG-002, DORA-CON-003, DORA-CIF-004, DORA-SUB-005, DORA-INC-006, DORA-EXT-007
- EU AI Act (EU): AIA-CLS-001, AIA-HRC-002, AIA-DEP-003, AIA-PRV-004, AIA-TRN-005, AIA-FRIA-006, AIA-TML-007
- GDPR and UK GDPR (EU, UK): GDPR-BAS-001, GDPR-PRC-002, GDPR-SUB-003, GDPR-TRF-004, GDPR-DPIA-005, GDPR-ADM-006, GDPR-MIN-007
- FCA (UK): FCA-OUT-001, FCA-OPR-002, FCA-CD-003, FCA-SMCR-004, FCA-AI-005
- PRA and UK cross-sector (UK): PRA-OUT-001, UK-CTP-001
- MiCA (EU): MICA-SCO-001, MICA-OUT-002, MICA-REC-003
- Cross-regime (UK, EU): XRG-001, XRG-002
- Ireland, national layer (IE): IE-CBI-001, IE-CBI-002, IE-IAF-003, IE-CPC-004, IE-DPC-005, IE-AI-006
- United States, federal layer (US): US-TPR-001, US-MRM-002, US-GLBA-003, US-ECOA-004, US-FCRA-005, US-UDAP-006, US-BSA-007, US-BAAS-008, US-AI-009
- New York, state and city (US-NY, US-NYC): NY-DFS-001, NY-INS-002, NYC-AEDT-003, NY-AI-004
- California (US-CA): CA-CCPA-001, CA-ADMT-002, CA-AI-003, CA-DFPI-004
- Texas (US-TX): TX-AI-001, TX-PRIV-002, TX-BIO-003

---

## DORA

### DORA-TPR-001 ICT third-party risk sits inside the buyer's risk framework
kind: regulatory | jurisdiction: EU | regime: DORA | scope: shared | status: active | v1.0
- **Statement:** EU financial entities must manage ICT third-party risk as an integral part of their ICT risk management framework. Bringing in an AI vendor is an ICT third-party arrangement and triggers the buyer's third-party risk process before signature.
- **Buyer reading:** Onboarding you is not a procurement formality. Their TPRM function runs a risk assessment on the vendor, the service and the dependency before any contract.
- **Authority:** Regulation (EU) 2022/2554 (DORA), Art 28; applied from 17 January 2025.
- **Applicability:** Prospect is an EU financial entity in DORA scope (banks, payment and e-money institutions, investment firms, CASPs, insurers, among others).
- **Inputs required:** firm_type, jurisdiction.

### DORA-REG-002 Register of information
kind: regulatory | jurisdiction: EU | regime: DORA | scope: shared | status: active | v1.0
- **Statement:** The buyer must maintain a register of information on all contractual arrangements with ICT third-party providers, distinguishing those supporting critical or important functions, and report it to its competent authority on request.
- **Buyer reading:** Your contract gets logged, classified and is visible to their regulator. Expect structured data demands at onboarding (entity identifiers, service taxonomy, locations) so they can populate the register.
- **Authority:** DORA Art 28(3) and the implementing technical standards on the register of information.
- **Applicability:** As DORA-TPR-001.
- **Inputs required:** firm_type, jurisdiction.

### DORA-CON-003 Mandatory contractual provisions
kind: regulatory | jurisdiction: EU | regime: DORA | scope: shared | status: active | v1.0
- **Statement:** Contracts with ICT third-party providers must contain a defined set of provisions: full service description, data processing locations, availability and security commitments, incident assistance, access and audit rights, termination rights and notice. Where the service supports a critical or important function, extended provisions apply, including exit strategies, broader audit and inspection rights, and performance targets.
- **Buyer reading:** Their legal team arrives with a mandatory clause list. A vendor that arrives with a DORA-ready contractual schedule shortens review by weeks; a vendor that resists these clauses is unsellable internally.
- **Authority:** DORA Art 30, with Art 30(3) extended provisions for critical or important functions.
- **Applicability:** As DORA-TPR-001.
- **Inputs required:** firm_type, jurisdiction, ai_touchpoint (to assess critical-or-important exposure).

### DORA-CIF-004 Critical or important function uplift
kind: regulatory | jurisdiction: EU | regime: DORA | scope: shared | status: active | v1.0
- **Statement:** If the AI service supports a function whose disruption would materially impair the buyer's financial performance, soundness, continuity or regulatory compliance, the arrangement is classed as supporting a critical or important function and the heaviest DORA obligations attach: extended contract terms, exit planning, concentration analysis and pre-contract risk assessment.
- **Buyer reading:** The first classification question their TPRM asks is whether your service touches a critical or important function. The answer sets the depth of everything that follows. Sellers should know the answer before the buyer asks.
- **Authority:** DORA Arts 28 to 30 read with the Art 3 definition of critical or important function.
- **Applicability:** As DORA-TPR-001, where ai_touchpoint is a production workflow rather than internal tooling.
- **Inputs required:** ai_touchpoint, service_sold.

### DORA-SUB-005 Subcontracting conditions and the chain
kind: regulatory | jurisdiction: EU | regime: DORA | scope: shared | status: active | v1.0
- **Statement:** Where ICT services supporting critical or important functions are subcontracted, conditions apply: the buyer must be able to see and assess the subcontracting chain, and contracts must address whether and how sub-outsourcing is permitted. For an AI vendor this reaches model providers, hosting and any data sub-processors.
- **Buyer reading:** They will ask for the full chain: which foundation model, which cloud, which region, who else touches the data. An incomplete chain disclosure stalls the review.
- **Authority:** DORA Art 30(2)(a) and the ESAs regulatory technical standards on subcontracting.
- **Applicability:** As DORA-CIF-004.
- **Inputs required:** deployment_model, service_sold.

### DORA-INC-006 Incident notice flows through the vendor
kind: regulatory | jurisdiction: EU | regime: DORA | scope: shared | status: active | v1.0
- **Statement:** Buyers carry classification and reporting duties for major ICT-related incidents on regulatory clocks. They need contractual incident notification from the vendor fast enough to meet their own deadlines, plus assistance during the incident.
- **Buyer reading:** Expect a contractual notice window measured in hours, a named contact route and cooperation duties. A vendor without an incident-notice commitment fails the clause checklist at DORA-CON-003.
- **Authority:** DORA Arts 17 to 23 (incident management, classification and reporting).
- **Applicability:** As DORA-TPR-001.
- **Inputs required:** firm_type, jurisdiction.

### DORA-EXT-007 Exit and termination are review items, not edge cases
kind: regulatory | jurisdiction: EU | regime: DORA | scope: shared | status: active | v1.0
- **Statement:** For arrangements supporting critical or important functions the buyer must hold documented exit strategies: the ability to terminate, transition without disruption, and retrieve data in usable form.
- **Buyer reading:** They will ask how they get out before they decide to get in. A written exit and data-return position from the vendor converts a blocking question into a checklist tick.
- **Authority:** DORA Art 28(8) and Art 30(3) exit provisions.
- **Applicability:** As DORA-CIF-004.
- **Inputs required:** ai_touchpoint, deployment_model.

---

## EU AI Act

### AIA-CLS-001 Classification is the first question
kind: regulatory | jurisdiction: EU | regime: EU_AI_ACT | scope: shared | status: active | v1.0
- **Statement:** The Act regulates by risk tier: prohibited practices, high-risk systems (Annex III use cases and Annex I embedded systems), transparency-tier systems, and minimal risk. The obligations that attach to a sale depend on where the service lands, so classification of the AI service against the tiers is the first analytical step in any EU sale.
- **Buyer reading:** Their compliance function opens with one question: what is this under the AI Act? A seller who arrives with a written classification position and its reasoning controls the conversation. A seller without one is sent away to get one.
- **Authority:** Regulation (EU) 2024/1689, Arts 5, 6, 50 and Annexes I and III.
- **Applicability:** Prospect has EU operations or serves EU persons with the AI touchpoint.
- **Inputs required:** service_sold, ai_touchpoint, jurisdiction.

### AIA-HRC-002 Creditworthiness and credit scoring are high-risk
kind: regulatory | jurisdiction: EU | regime: EU_AI_ACT | scope: shared | status: active | v1.0
- **Statement:** AI systems intended to evaluate the creditworthiness of natural persons or establish their credit score are listed high-risk uses (with a narrow fraud-detection carve-out). A fintech buying AI that touches consumer credit decisions should expect high-risk treatment for that use.
- **Buyer reading:** If your service is anywhere near retail credit decisioning, their first instinct is high-risk and the full obligation stack. Either your classification position distinguishes the use, or the sale plans for high-risk obligations rather than arguing past them.
- **Authority:** Regulation (EU) 2024/1689, Annex III point 5(b).
- **Applicability:** ai_touchpoint is credit and the persons affected are natural persons in the EU.
- **Inputs required:** ai_touchpoint, service_sold.

### AIA-DEP-003 The buyer carries deployer duties
kind: regulatory | jurisdiction: EU | regime: EU_AI_ACT | scope: shared | status: active | v1.0
- **Statement:** Deployers of high-risk AI must use the system per the provider's instructions, assign competent human oversight, ensure relevant and representative input data so far as they control it, monitor operation, keep logs within their control, and inform affected persons where required.
- **Buyer reading:** The buyer does not offload AI Act risk by buying. They carry duties, and they buy from vendors whose documentation, oversight design and logging let them discharge those duties cheaply. Sell the discharge of their duties, not the absence of duties.
- **Authority:** Regulation (EU) 2024/1689, Art 26.
- **Applicability:** Service classifies as high-risk under AIA-CLS-001 analysis.
- **Inputs required:** service_sold, ai_touchpoint.

### AIA-PRV-004 The vendor carries provider duties
kind: regulatory | jurisdiction: EU | regime: EU_AI_ACT | scope: shared | status: active | v1.0
- **Statement:** Providers of high-risk AI must operate a risk management system, meet data governance standards, produce and maintain technical documentation, enable logging, design for human oversight, meet accuracy, robustness and cybersecurity requirements, run conformity assessment and affix CE marking before placing on the market.
- **Buyer reading:** Their diligence asks whether the vendor will be a compliant provider when the obligations bite. The honest sellable position for an adopter not yet conformity-assessed is a dated readiness roadmap, stated as such, never an implied present-tense compliance claim. Present-tense conformity claims may only come from the tenant claims file.
- **Authority:** Regulation (EU) 2024/1689, Art 16 and Chapter III Section 2.
- **Applicability:** Service classifies as high-risk under AIA-CLS-001 analysis.
- **Inputs required:** service_sold.

### AIA-TRN-005 Transparency-tier duties
kind: regulatory | jurisdiction: EU | regime: EU_AI_ACT | scope: shared | status: active | v1.0
- **Statement:** AI systems that interact directly with persons must disclose that fact unless obvious; deployers of certain systems carry disclosure duties to affected persons; synthetic-content marking duties attach to providers of generating systems.
- **Buyer reading:** Even below high-risk, a chat or content surface in their customer journey triggers disclosure design questions. Cheap to answer if the vendor arrives with the disclosure pattern built.
- **Authority:** Regulation (EU) 2024/1689, Art 50. On timing of Art 50 duties see AIA-TML-007.
- **Applicability:** Service includes a customer-facing conversational or content-generating surface.
- **Inputs required:** service_sold, ai_touchpoint.

### AIA-FRIA-006 Fundamental rights impact assessment
kind: regulatory | jurisdiction: EU | regime: EU_AI_ACT | scope: shared | status: active | v1.0
- **Statement:** Before first use of certain high-risk systems, some deployers (public bodies, private entities providing public services, and deployers of creditworthiness and life and health insurance pricing systems under Annex III point 5) must complete a fundamental rights impact assessment.
- **Buyer reading:** A fintech deploying credit-touching AI may owe a FRIA. Vendors that supply the system description, oversight measures and risk material that feed a FRIA take weeks out of the buyer's path to first use.
- **Authority:** Regulation (EU) 2024/1689, Art 27.
- **Applicability:** ai_touchpoint is credit or insurance pricing for natural persons in the EU.
- **Inputs required:** ai_touchpoint, firm_type.

### AIA-TML-007 Application timeline, as amended in negotiation
kind: regulatory | jurisdiction: EU | regime: EU_AI_ACT | scope: shared | status: active | v1.0 | movement note attached
- **Statement:** In force since 1 August 2024. Prohibitions apply since 2 February 2025; general-purpose model obligations since 2 August 2025. Under the Digital Omnibus on AI political agreement of 7 May 2026 (formal adoption pending, expected before 2 August 2026): Annex III high-risk obligations are deferred to 2 December 2027; Annex I embedded high-risk to 2 August 2028; the Art 50(2) synthetic-content marking duty to 2 December 2026; other transparency obligations, deployer duties included, still apply from 2 August 2026.
- **Buyer reading:** Two truths to hold at once. The high-risk wall moved out to December 2027, so panic framing fails. But transparency duties land in under two months, the deferral is not yet formally adopted, and buyer programmes already in flight will not be unwound. Urgency framing rests on the August 2026 transparency date and the cost of late preparation, never on a false high-risk cliff.
- **Authority:** Regulation (EU) 2024/1689, Art 113; Digital Omnibus on AI, provisional political agreement 7 May 2026.
- **Applicability:** Any EU prospect where timing shapes the buying decision.
- **Inputs required:** jurisdiction.
- **Movement note:** Re-verify on formal adoption and Official Journal publication, expected before 2 August 2026. If the Omnibus is not adopted by that date, the original dates apply as written and this rule must be re-authored. Mark stale on either event.

---

## GDPR and UK GDPR

### GDPR-BAS-001 Lawful basis and purpose compatibility
kind: regulatory | jurisdiction: EU, UK | regime: GDPR | scope: shared | status: active | v1.0
- **Statement:** Personal data processed through the AI service needs an identified lawful basis, and where the data was collected for another purpose, a compatibility analysis. The buyer's DPO owns this question and answers it before any data flows.
- **Buyer reading:** The DPO's first two questions: what is the basis, and is this a new purpose for data we already hold. A vendor data-flow map that lets them answer in one sitting is worth more than any security certificate at this gate.
- **Authority:** GDPR Arts 5(1)(b) and 6; UK GDPR equivalents with the Data Protection Act 2018.
- **Applicability:** data_classes includes personal data.
- **Inputs required:** data_classes, ai_touchpoint.

### GDPR-PRC-002 Processor terms are mandatory contract content
kind: regulatory | jurisdiction: EU, UK | regime: GDPR | scope: shared | status: active | v1.0
- **Statement:** A vendor processing personal data on the buyer's behalf is a processor, and a contract with the mandatory content must be in place: documented instructions, confidentiality, security measures, sub-processor conditions, assistance with data-subject rights and breach duties, deletion or return at end, and audit rights.
- **Buyer reading:** Their template DPA is coming. A vendor whose own DPA already mirrors the mandatory content closes legal review in days; redlining a non-conforming DPA takes weeks.
- **Authority:** GDPR Art 28(3); UK GDPR equivalent.
- **Applicability:** data_classes includes personal data and the vendor processes it.
- **Inputs required:** data_classes, deployment_model.

### GDPR-SUB-003 The sub-processor chain needs authorisation
kind: regulatory | jurisdiction: EU, UK | regime: GDPR | scope: shared | status: active | v1.0
- **Statement:** Engaging another processor requires the buyer's prior authorisation, general or named, with a right to object to changes, and the same data protection obligations flowed down the chain. For an AI vendor the chain includes any foundation-model provider and hosting that touches personal data.
- **Buyer reading:** They want the named list: model provider, cloud, region, any annotation or support access. Pair with DORA-SUB-005 where DORA applies; it is one chain disclosure answering both.
- **Authority:** GDPR Art 28(2) and (4); UK GDPR equivalent.
- **Applicability:** As GDPR-PRC-002.
- **Inputs required:** deployment_model, service_sold.

### GDPR-TRF-004 Transfers out of the EEA or UK need a mechanism
kind: regulatory | jurisdiction: EU, UK | regime: GDPR | scope: shared | status: active | v1.0
- **Statement:** Personal data leaving the EEA needs an adequacy decision or safeguards, standard contractual clauses with a transfer impact assessment in practice. Leaving the UK needs the IDTA or the UK addendum to the EU SCCs. Model API calls routed to non-adequate jurisdictions are transfers.
- **Buyer reading:** Where does the data go when the model is called is the question that kills more AI deals at the DPO desk than any other. EU or UK residency for processing, stated precisely and evidenced, dissolves it. Anything else means SCC paperwork and a TIA the buyer must own.
- **Authority:** GDPR Chapter V, Arts 44 to 49; UK GDPR with the IDTA and addendum.
- **Applicability:** data_classes includes personal data.
- **Inputs required:** deployment_model, data_classes.

### GDPR-DPIA-005 The service will likely trigger their DPIA
kind: regulatory | jurisdiction: EU, UK | regime: GDPR | scope: shared | status: active | v1.0
- **Statement:** A data protection impact assessment is required where processing is likely high risk to individuals, in particular systematic and extensive automated evaluation or profiling with material effects, large-scale special-category processing, or novel technology. AI over customer data in a financial firm routinely meets the threshold.
- **Buyer reading:** Assume their DPIA fires. The vendor that hands over a DPIA support pack (processing description, data flows, risks and mitigations from the vendor side) compresses the longest single document on the critical path.
- **Authority:** GDPR Art 35; UK GDPR equivalent and ICO DPIA guidance.
- **Applicability:** data_classes includes personal data and ai_touchpoint is a customer-affecting workflow.
- **Inputs required:** data_classes, ai_touchpoint.

### GDPR-ADM-006 Solely automated decisions carry Art 22 rights
kind: regulatory | jurisdiction: EU, UK | regime: GDPR | scope: shared | status: active | v1.0
- **Statement:** Individuals have the right not to be subject to decisions based solely on automated processing with legal or similarly material effects, save narrow exceptions which then require safeguards including human intervention and the ability to contest.
- **Buyer reading:** For credit, onboarding and claims workflows, the buyer must decide whether a human stays in the loop, and the vendor's oversight design either makes that easy or makes the deal heavy. Pairs with AIA-DEP-003 oversight duties; design once, answer both.
- **Authority:** GDPR Art 22; UK GDPR equivalent.
- **Applicability:** ai_touchpoint produces or drives decisions about natural persons.
- **Inputs required:** ai_touchpoint.

### GDPR-MIN-007 Minimisation, purpose limitation, retention
kind: regulatory | jurisdiction: EU, UK | regime: GDPR | scope: shared | status: active | v1.0
- **Statement:** Processing must be limited to what the purpose needs, and data kept no longer than needed. Two AI-pointed corollaries the buyer will press: whether the service can run on less data, and whether vendor-side retention and any training use of buyer data are switched off or controlled.
- **Buyer reading:** Expect the question put bluntly: do you train on our data. The answer must come from the tenant claims file, never improvised. The seam-level truth is only that the question is coming and a contractual no-training commitment is the buyer's default ask.
- **Authority:** GDPR Art 5(1)(c) and (e); UK GDPR equivalent.
- **Applicability:** data_classes includes personal data.
- **Inputs required:** data_classes, deployment_model.

---

## FCA

### FCA-OUT-001 Outsourcing without impairing control
kind: regulatory | jurisdiction: UK | regime: FCA | scope: shared | status: active | v1.0
- **Statement:** An FCA firm outsourcing critical or important operational functions must avoid undue additional operational risk and must not materially impair its internal control or the regulator's ability to monitor compliance. The firm remains fully responsible for the outsourced function.
- **Buyer reading:** Responsibility never transfers to the vendor, so the buyer prices in oversight cost. Vendors win by making themselves cheap to oversee: reporting, access, and clear service boundaries.
- **Authority:** FCA Handbook SYSC 8.
- **Applicability:** UK-authorised prospect; service is material to an operational function.
- **Inputs required:** firm_type, jurisdiction, ai_touchpoint.

### FCA-OPR-002 Operational resilience and important business services
kind: regulatory | jurisdiction: UK | regime: FCA | scope: shared | status: active | v1.0
- **Statement:** In-scope UK firms must identify important business services, set impact tolerances for disruption, map the resources (third parties included) those services depend on, and remain within tolerances through severe but plausible scenarios. The regime is fully in force; the transition ended 31 March 2025.
- **Buyer reading:** If the AI sits in the dependency map of an important business service, the buyer must scenario-test around it, and asks about availability, failover, degradation behaviour and substitutes. A resilience answer beats a capability answer at this desk.
- **Authority:** FCA SYSC 15A and PS21/3 (with the PRA equivalents for dual-regulated firms).
- **Applicability:** UK prospect; ai_touchpoint sits in a customer-serving or market-facing service chain.
- **Inputs required:** ai_touchpoint, firm_type.

### FCA-CD-003 Consumer Duty reads the AI's retail effects
kind: regulatory | jurisdiction: UK | regime: FCA | scope: shared | status: active | v1.0
- **Statement:** Firms owe retail customers good outcomes under the Consumer Duty: acting in good faith, avoiding foreseeable harm, and supporting customers' objectives, with outcome standards on products, price and value, understanding, and support. AI touching retail journeys is assessed for foreseeable-harm and outcome effects.
- **Buyer reading:** Their question is what happens to the customer when your model is wrong. Error handling, escalation to humans, and monitoring of customer outcomes are the sellable surface here.
- **Authority:** FCA PRIN 2A (Consumer Duty), PS22/9.
- **Applicability:** UK prospect with retail customers; ai_touchpoint affects a retail journey.
- **Inputs required:** ai_touchpoint, firm_type.

### FCA-SMCR-004 A named human owns this risk
kind: regulatory | jurisdiction: UK | regime: FCA | scope: shared | status: active | v1.0
- **Statement:** Under the Senior Managers and Certification Regime, accountability for a firm's activities sits with named senior managers under statements of responsibility, with a duty to take reasonable steps. Adopting an AI vendor lands inside some senior manager's personal accountability.
- **Buyer reading:** Somewhere in the buyer a person's own name is on this decision. They over-document by design. Give them the file that protects them: the evidence pack is for their reasonable-steps record, not for ceremony.
- **Authority:** FSMA senior managers regime; FCA SYSC and the senior managers regime sourcebooks.
- **Applicability:** UK-authorised prospect.
- **Inputs required:** firm_type, jurisdiction.

### FCA-AI-005 No AI rulebook means the whole rulebook applies
kind: regulatory | jurisdiction: UK | regime: FCA | scope: shared | status: active | v1.0
- **Statement:** The FCA has stated it does not currently propose a standalone AI rulebook; existing frameworks (SYSC, operational resilience, Consumer Duty, SM&CR) apply to AI use, with the FCA running supervised innovation channels including an AI Lab and sandbox routes.
- **Buyer reading:** Cuts both ways. A buyer saying the regulator has not approved AI for this misreads the model: there is no approval gate to wait for, there are existing rules to satisfy now. A buyer hoping for an AI grace period misreads it the same way.
- **Authority:** FCA AI Update (April 2024) and subsequent FCA statements on its AI approach.
- **Applicability:** UK prospect where regulatory permission framing arises.
- **Inputs required:** jurisdiction.

---

## PRA and UK cross-sector

### PRA-OUT-001 SS2/21 governs dual-regulated outsourcing
kind: regulatory | jurisdiction: UK | regime: PRA | scope: shared | status: active | v1.0
- **Statement:** PRA-regulated firms apply SS2/21 to outsourcing and third-party risk: materiality assessment, proportionate due diligence, written agreements with defined content, data-location awareness, exit plans for material arrangements, and board-level accountability.
- **Buyer reading:** At a bank or insurer, SS2/21 is the playbook your deal is run through. Its clause expectations rhyme with DORA Art 30; a vendor pack built for one substantially answers the other, divergences noted.
- **Authority:** PRA Supervisory Statement SS2/21, Outsourcing and third party risk management.
- **Applicability:** Prospect is PRA-regulated (banks, building societies, designated investment firms, insurers).
- **Inputs required:** firm_type, regulator.

### UK-CTP-001 The critical third parties regime sits behind the buyer's questions
kind: regulatory | jurisdiction: UK | regime: cross_regime | scope: shared | status: active | v1.0
- **Statement:** The UK critical third parties regime (in force since 1 January 2025) lets HM Treasury designate third parties critical to the sector, placing designated CTPs under direct regulatory duties and resilience testing. Most AI vendors are not designated, but buyers ask whether a vendor's own chain depends on designated or hyperscale providers.
- **Buyer reading:** A concentration question in new clothes: if your service rides one hyperscaler in one region, their resilience team logs a concentration exposure. Multi-region or substitutability answers help.
- **Authority:** FSMA 2023 critical third parties provisions; PRA/FCA/Bank of England PS16/24.
- **Applicability:** UK prospect assessing vendor-chain concentration.
- **Inputs required:** deployment_model.

---

## MiCA

### MICA-SCO-001 Scope gate: does MiCA reach this buyer
kind: regulatory | jurisdiction: EU | regime: MiCA | scope: shared | status: active | v1.0
- **Statement:** MiCA applies to crypto-asset service providers and issuers of asset-referenced and e-money tokens, with CASP provisions applied from 30 December 2024 and national transition windows for pre-existing firms. It shapes governance, records and outsourcing for those buyers only.
- **Buyer reading:** A scope gate, not a universal lens. Confirm the prospect is a CASP or issuer before any MiCA framing; misapplied MiCA framing reads as a seller who does not know the buyer's perimeter.
- **Authority:** Regulation (EU) 2023/1114 (MiCA), Titles I to V.
- **Applicability:** Prospect is or is becoming a CASP or in-scope issuer.
- **Inputs required:** firm_type.

### MICA-OUT-002 CASP outsourcing keeps responsibility home
kind: regulatory | jurisdiction: EU | regime: MiCA | scope: shared | status: active | v1.0
- **Statement:** CASPs outsourcing services or activities remain fully responsible for their obligations, and must ensure outsourcing does not materially impair quality of internal control or the supervisor's ability to monitor compliance; outsourcing of operational functions is conditioned, and compliance responsibility cannot be delegated away.
- **Buyer reading:** The CASP version of the familiar rule: the buyer cannot hand you its compliance duty, so it buys controls it can supervise. Same evidence pack as DORA and SS2/21 buyers, MiCA wording on the contract schedule.
- **Authority:** MiCA Art 73.
- **Applicability:** Prospect is an authorised CASP using the service in regulated activity.
- **Inputs required:** firm_type, ai_touchpoint.

### MICA-REC-003 Records and auditability of crypto-asset services
kind: regulatory | jurisdiction: EU | regime: MiCA | scope: shared | status: active | v1.0
- **Statement:** CASPs must keep records of services, activities, orders and transactions sufficient for the supervisor to assess compliance. AI touching order, transaction or client-facing crypto workflows must preserve, not obscure, that record trail.
- **Buyer reading:** If the AI summarises, routes or decides inside a recorded workflow, the buyer asks how the record survives: inputs, outputs, versions, timestamps. Audit-ready logging is the answer they are listening for.
- **Authority:** MiCA Title V record-keeping obligations for CASPs.
- **Applicability:** As MICA-OUT-002, ai_touchpoint in transaction or client workflows.
- **Inputs required:** ai_touchpoint.

---

## Cross-regime

### XRG-001 One contract stack, three rulebooks
kind: regulatory | jurisdiction: EU, UK | regime: cross_regime | scope: shared | status: active | v1.0
- **Statement:** The buyer's legal team must land DORA Art 30 provisions (or SS2/21 and SYSC 8 expectations in the UK), GDPR Art 28 processor terms, and sectoral outsourcing conditions in one coherent agreement. The clause families overlap but are not identical.
- **Buyer reading:** Redline cycles, not regulation, are where deal months go. A vendor contract pack pre-assembled as DPA plus DORA-or-UK addendum plus security schedule, mapped clause-to-rule, is the highest-leverage sales asset in this market.
- **Authority:** Composite: DORA Art 30; GDPR Art 28; FCA SYSC 8; PRA SS2/21.
- **Applicability:** Any regulated prospect heading to contract.
- **Inputs required:** jurisdiction, firm_type.

### XRG-002 UK and EU diverge; groups run the stricter common denominator
kind: regulatory | jurisdiction: EU, UK | regime: cross_regime | scope: shared | status: active | v1.0
- **Statement:** The UK is outside DORA and the EU AI Act; it runs its own operational resilience, outsourcing and CTP regimes and has signalled a principles-led AI approach through existing rules. Groups spanning both markets commonly implement a single control set meeting the stricter applicable standard.
- **Buyer reading:** Ask early where the group's controls are set: a London buyer inside an EU group may demand DORA-grade terms anyway, and a Dublin buyer with a UK arm asks for the UK overlay. Selling to the entity but contracting to the group standard is the usual landing zone.
- **Authority:** Composite: DORA and Regulation (EU) 2024/1689 territorial scope; FSMA 2023; FCA/PRA operational resilience framework.
- **Applicability:** Prospect or its group operates in both UK and EU.
- **Inputs required:** jurisdiction, firm (group structure if known).

---

## Ireland (national layer over EU rules)

### IE-CBI-001 CBI outsourcing guidance layers over DORA
kind: regulatory | jurisdiction: IE | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** The Central Bank of Ireland's Cross-Industry Guidance on Outsourcing (December 2021) sets supervisory expectations for regulated firms: board-approved outsourcing strategy and policy, risk assessment and due diligence before onboarding, outsourcing registers, notification expectations for critical or important arrangements, and oversight of sub-outsourcing and intragroup arrangements. It runs alongside DORA for ICT arrangements.
- **Buyer reading:** An Irish buyer's vendor process speaks CBI guidance language even where DORA covers the same ground. Expect register entries, board-level sign-off for critical arrangements, and possible notification to the CBI before go-live. Answer in both vocabularies; it is one evidence pack.
- **Authority:** CBI Cross-Industry Guidance on Outsourcing, December 2021.
- **Applicability:** CBI-regulated prospect; the service is an outsourcing or ICT arrangement.
- **Inputs required:** firm_type, regulator, ai_touchpoint.

### IE-CBI-002 CBI operational resilience guidance
kind: regulatory | jurisdiction: IE | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** The CBI's Cross-Industry Guidance on Operational Resilience (December 2021) expects firms to identify critical or important business services, set impact tolerances, map dependencies including third parties, and test severe but plausible scenarios.
- **Buyer reading:** The Irish mirror of the UK regime. If the AI sits in a business-service dependency map, the resilience team asks about availability, degradation behaviour and substitutes, in CBI terms as well as DORA testing terms.
- **Authority:** CBI Cross-Industry Guidance on Operational Resilience, December 2021.
- **Applicability:** CBI-regulated prospect; ai_touchpoint sits in a customer-serving service chain.
- **Inputs required:** ai_touchpoint, firm_type.

### IE-IAF-003 SEAR: a named Irish executive owns the call
kind: regulatory | jurisdiction: IE | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** The Individual Accountability Framework (Central Bank (Individual Accountability Framework) Act 2023) imposes conduct standards across regulated firms and, for in-scope firms (banks, certain insurers and investment firms first, applied from 1 July 2024), the Senior Executive Accountability Regime: statements of responsibility, inherent and prescribed responsibilities, and a duty to take reasonable steps.
- **Buyer reading:** The Irish counterpart of FCA-SMCR-004. The executive who signs the vendor decision carries personal accountability and over-documents by design. Sell the reasonable-steps file to the person whose name is on it.
- **Authority:** Central Bank (Individual Accountability Framework) Act 2023; CBI SEAR regulations and guidance; initial application 1 July 2024.
- **Applicability:** CBI-regulated prospect; SEAR depth where the firm is in initial scope.
- **Inputs required:** firm_type, buyer_persona.

### IE-CPC-004 The revised Consumer Protection Code reads retail AI
kind: regulatory | jurisdiction: IE | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** The CBI's revised Consumer Protection Code applies from 24 March 2026, built on the obligation to secure customers' interests, with provisions on digitalisation, informing effectively, and customers in vulnerable circumstances. AI in retail journeys is read through it.
- **Buyer reading:** The Irish analogue of the Consumer Duty conversation, live now. The question is what happens to the customer when the model is wrong: escalation to humans, outcome monitoring and digital-journey design are the answers the desk is listening for.
- **Authority:** CBI revised Consumer Protection Code 2025 (regulations and code under the Central Bank Reform Act 2010), applying from 24 March 2026.
- **Applicability:** CBI-regulated prospect with retail customers; ai_touchpoint affects a retail journey.
- **Inputs required:** ai_touchpoint, firm_type.

### IE-DPC-005 The DPC and the Irish data protection layer
kind: regulatory | jurisdiction: IE | regime: GDPR | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** GDPR operates in Ireland through the Data Protection Act 2018 with the Data Protection Commission as supervisory authority; for vendors whose EU main establishment is Irish, the DPC is lead supervisory authority under the one-stop-shop.
- **Buyer reading:** The supervisor behind every GDPR question is the DPC, whose enforcement record against large technology firms makes Irish DPOs documentation-first and unmoved by informal assurance. Where the adopter's EU establishment is also Irish, the same authority supervises both sides of the table; a precise DPIA pack lands well.
- **Authority:** GDPR Arts 51 and 56; Data Protection Act 2018 (Ireland).
- **Applicability:** Irish prospect processing personal data through the service.
- **Inputs required:** data_classes.

### IE-AI-006 AI Act supervision lands with the Central Bank
kind: regulatory | jurisdiction: IE | regime: EU_AI_ACT | scope: shared | status: active | v1.0 (added in seam 1.1.0) | movement note attached
- **Statement:** Ireland is implementing the AI Act through existing sectoral regulators designated as national competent authorities, the Central Bank of Ireland for financial services among them, with a central coordinating National AI Office being established around the August 2026 milestone.
- **Buyer reading:** The AI Act supervisor for an Irish fintech is the same authority that authorises it, which folds AI Act posture into the ordinary supervisory relationship rather than a separate regime conversation. Expect AI Act questions asked in CBI language and logged in the supervisory file.
- **Authority:** Designation of competent authorities under Regulation (EU) 2024/1689 (initial Irish list announced 2025); National AI Office establishment in progress.
- **Applicability:** Irish prospect with AI Act exposure.
- **Inputs required:** jurisdiction, firm_type.
- **Movement note:** Verify the final designation list and the National AI Office stand-up at the 2 August 2026 milestone; re-author on confirmation.

---

## United States: federal layer

### US-TPR-001 The interagency third-party lifecycle
kind: regulatory | jurisdiction: US | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** The Interagency Guidance on Third-Party Relationships: Risk Management (OCC, Federal Reserve, FDIC, June 2023) sets the supervisory lifecycle for banking organisations' third-party relationships: planning, due diligence and selection, contract negotiation, ongoing monitoring and termination, with depth proportionate to the criticality of the relationship.
- **Buyer reading:** The US counterpart of the DORA and SS2/21 playbooks. Bank buyers run this lifecycle on the vendor, and bank-partnered fintechs inherit it. Arriving with the due-diligence pack pre-assembled against the lifecycle stages is the velocity play.
- **Authority:** Interagency Guidance on Third-Party Relationships: Risk Management (June 2023).
- **Applicability:** US banking prospect or fintech operating through bank partners.
- **Inputs required:** firm_type, jurisdiction.

### US-MRM-002 Model risk management reaches vendor AI
kind: regulatory | jurisdiction: US | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** Supervisory guidance on model risk management (Federal Reserve SR 11-7; OCC Bulletin 2011-12; adopted by the FDIC) requires banks to inventory, validate, document and monitor models, vendor models included, with effective challenge and ongoing performance monitoring.
- **Buyer reading:** The AI lands in their model inventory on day one. Expect demands for documentation sufficient for independent validation, development evidence, performance metrics and monitoring support. The vendor pack that feeds validation is the unlock at this desk.
- **Authority:** Fed SR 11-7 / OCC 2011-12, Supervisory Guidance on Model Risk Management.
- **Applicability:** US banking prospect; AI used in decisioning or risk processes.
- **Inputs required:** firm_type, ai_touchpoint.

### US-GLBA-003 GLBA safeguards and service-provider oversight
kind: regulatory | jurisdiction: US | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** GLBA and its implementing rules (Regulation P; the FTC Safeguards Rule for non-bank financial institutions; the banking agencies' security guidelines) require financial institutions to protect nonpublic personal information, maintain a written information security programme, and oversee service providers by contract.
- **Buyer reading:** NPI in the AI flow triggers service-provider clauses and security-programme diligence: encryption, access control, incident response, contractual safeguarding commitments. The US cousin of the GDPR Art 28 conversation, security-led rather than rights-led.
- **Authority:** 15 U.S.C. §§ 6801-6809; 16 CFR Part 314 (Safeguards Rule, as amended); interagency security guidelines.
- **Applicability:** US prospect; nonpublic personal information touches the service.
- **Inputs required:** data_classes, deployment_model.

### US-ECOA-004 Adverse-action reasons must survive the model
kind: regulatory | jurisdiction: US | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** ECOA and Regulation B require creditors to give applicants accurate statements of the principal reasons for adverse action; the CFPB has confirmed this applies in full when complex algorithms are used, and that generic or post-hoc reasons do not comply.
- **Buyer reading:** Credit AI must produce decision-level reason codes a compliance officer can defend. Explainability here is a statutory output requirement, not a philosophy debate. Demonstrated reason-code generation closes the fair-lending desk.
- **Authority:** 15 U.S.C. § 1691; 12 CFR Part 1002; CFPB Circular 2022-03 and subsequent adverse-action guidance.
- **Applicability:** ai_touchpoint is credit affecting US applicants.
- **Inputs required:** ai_touchpoint.

### US-FCRA-005 Consumer-report data carries FCRA duties
kind: regulatory | jurisdiction: US | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** Where consumer reports feed the AI, the Fair Credit Reporting Act governs: permissible purpose for obtaining reports, adverse-action notices naming the reporting agency, and accuracy and dispute duties. A vendor whose outputs function as consumer reports risks consumer-reporting-agency status with the full obligation set.
- **Buyer reading:** Two questions arrive together: does the AI consume report data (their permissible-purpose chain must hold), and could the vendor's output itself be a consumer report (their lawyers will probe; the adopter needs a written position before the meeting).
- **Authority:** 15 U.S.C. § 1681 et seq.
- **Applicability:** ai_touchpoint involves credit, onboarding or screening using report data on US consumers.
- **Inputs required:** ai_touchpoint, data_classes.

### US-UDAP-006 UDAAP reads customer-facing AI failures
kind: regulatory | jurisdiction: US | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** The CFPB's authority over unfair, deceptive or abusive acts and practices, and FTC Act Section 5 for non-banks, reach customer-facing conduct irrespective of the technology; supervisory attention has covered AI surfaces including chatbots that obstruct answers, misstate terms or trap customers in loops.
- **Buyer reading:** The same desk as the UK Consumer Duty conversation, with US enforcement teeth: what happens to the customer when the model is wrong. Escalation to humans, accuracy controls on stated terms and complaint-handling design are the purchase criteria.
- **Authority:** 12 U.S.C. § 5531; 15 U.S.C. § 45; CFPB chatbot Issue Spotlight (2023).
- **Applicability:** US prospect; customer-facing AI surface.
- **Inputs required:** ai_touchpoint.

### US-BSA-007 AML AI is welcomed in principle, examined in depth
kind: regulatory | jurisdiction: US | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** Bank Secrecy Act and FinCEN obligations require risk-based AML programmes; the agencies have encouraged responsible innovation in AML technology while expecting governance, validation and explainable suspicious-activity decisioning consistent with model-risk expectations, examined through the FFIEC manual.
- **Buyer reading:** The BSA officer buys headroom against alert backlogs but answers to examiners, so the sale must hold up in an exam: validation evidence, tuning documentation, audit trail from alert to disposition. Pair with US-MRM-002; it is one pack.
- **Authority:** 31 U.S.C. § 5311 et seq.; FinCEN regulations; Joint Statement on Innovative Efforts to Combat Money Laundering (December 2018); FFIEC BSA/AML Examination Manual.
- **Applicability:** ai_touchpoint is onboarding_aml or transaction monitoring at a US prospect.
- **Inputs required:** ai_touchpoint, firm_type.

### US-BAAS-008 The sponsor bank behind the fintech
kind: regulatory | jurisdiction: US | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** An unchartered US fintech operating through bank partnerships is reached by the banking agencies via its partner bank, whose third-party programme must cover the fintech's own critical vendors; enforcement against sponsor banks has pushed oversight demands down the chain.
- **Buyer reading:** The real reviewer may be the bank behind the buyer. Expect flow-down questionnaires in the bank's format and more approval steps than the buyer's size suggests. Ask early which bank partner sits behind the programme and what its vendor demands are.
- **Authority:** Interagency Guidance on Third-Party Relationships (2023); interagency statements on bank-fintech arrangements (2024); public enforcement actions against sponsor banks.
- **Applicability:** US fintech prospect without its own charter, operating via bank partners.
- **Inputs required:** firm_type, deal_state.

### US-AI-009 Federal AI posture: no statute, live preemption pressure
kind: regulatory | jurisdiction: US | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0) | movement note attached
- **Statement:** There is no omnibus federal AI statute; supervision of AI in financial services flows through the existing rules in this corpus. Federal policy under Executive Order 14179 (January 2025) favours removing regulatory barriers, and a December 2025 executive order directed agencies, the Department of Justice among them, toward a minimally burdensome national standard and challenges to state AI laws. State statutes remain in force unless and until displaced.
- **Buyer reading:** Two errors to correct, gently. Waiting for a federal AI approval gate misreads the system: there is none, and existing financial regulation applies now. Assuming state AI law will be preempted away is a prediction, not a compliance position: state law applies now and the federal-state contest is a watch item.
- **Authority:** EO 14179 (January 2025); December 2025 executive order on state AI law; absence of an omnibus federal AI statute.
- **Applicability:** US prospect where permission or preemption framing arises.
- **Inputs required:** jurisdiction.
- **Movement note:** Verify the status of federal preemption measures and related litigation; re-author on any enacted federal AI framework or controlling judgment.

---

## New York (state and city)

### NY-DFS-001 Part 500 cybersecurity flows into vendor contracts
kind: regulatory | jurisdiction: US-NY | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** NYDFS-regulated entities must run a cybersecurity programme under 23 NYCRR Part 500 (as amended November 2023, phased through 2025): third-party service provider policies, access controls and multi-factor authentication, incident notice to DFS within 72 hours, and CISO accountability. The DFS industry letter of 16 October 2024 addresses AI-related risks within the Part 500 framework, AI-enabled social engineering and the securing of AI systems and data among them.
- **Buyer reading:** Licensees flow Part 500 into vendor paper: a security questionnaire keyed to the regulation, MFA and access-control attestations, and contractual incident notice tight enough to feed their 72-hour clock. The 2024 letter means AI-pointed security questions arrive pre-formed.
- **Authority:** 23 NYCRR Part 500 (Second Amendment, November 2023); NYDFS Industry Letter on Cybersecurity Risks Arising from Artificial Intelligence (16 October 2024).
- **Applicability:** NYDFS-licensed prospect (banking, insurance, money transmission, virtual currency).
- **Inputs required:** firm_type, regulator.

### NY-INS-002 AI in underwriting and pricing: Circular Letter 7
kind: regulatory | jurisdiction: US-NY | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** NYDFS Insurance Circular Letter No. 7 (2024) requires insurers using external consumer data and AI in underwriting or pricing to demonstrate the data and models do not produce unfair or unlawful discrimination, to maintain governance with senior accountability, and to remain responsible for third-party vendor tools and data.
- **Buyer reading:** A New York insurer cannot delegate fairness to the vendor. Expect demands for testing evidence, documentation that feeds their own proxy-analysis file, and contractual cooperation duties. The vendor pack that feeds their fairness file is the sale.
- **Authority:** NYDFS Insurance Circular Letter No. 7 (11 July 2024).
- **Applicability:** New York-licensed insurer; ai_touchpoint is underwriting or pricing.
- **Inputs required:** firm_type, ai_touchpoint.

### NYC-AEDT-003 Local Law 144 on automated hiring tools
kind: regulatory | jurisdiction: US-NYC | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** New York City Local Law 144 (enforced from 5 July 2023) prohibits using an automated employment decision tool for hiring or promotion decisions on NYC candidates unless the tool has had an independent bias audit within the year, a summary of results is published, and candidates receive notice.
- **Buyer reading:** Fires only where the AI touches employment decisions. If the service is anywhere near screening or promotion at an NYC buyer, the bias audit and notice mechanics are the first questions; where there is no employment touch, leave it out of the conversation.
- **Authority:** NYC Admin. Code § 20-870 et seq. (Local Law 144 of 2021); DCWP rules, enforcement from 5 July 2023.
- **Applicability:** Prospect employs in NYC and ai_touchpoint includes employment decisions.
- **Inputs required:** ai_touchpoint, firm.

### NY-AI-004 RAISE Act: the frontier diligence question
kind: regulatory | jurisdiction: US-NY | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** New York's RAISE Act (signed 19 December 2025; chapter amendment finalised 27 March 2026; effective 1 January 2027) imposes safety-protocol, transparency and 72-hour incident-reporting duties on large frontier-model developers, revenue-thresholded after amendment, with attorney-general enforcement and an oversight office within DFS.
- **Buyer reading:** For most adopters a diligence question rather than a direct obligation: buyers ask whether the adopter or any model in its chain is a covered frontier developer and how incident notice would flow. A one-paragraph written position answers it. The DFS connection means New York financial buyers hear about this law early.
- **Authority:** RAISE Act, S6953-B/A6453-B as amended (chapter amendment signed 27 March 2026); effective 1 January 2027.
- **Applicability:** New York prospect running frontier-model diligence on the vendor chain.
- **Inputs required:** service_sold, deployment_model.

---

## California

### CA-CCPA-001 CCPA reaches the data GLBA does not
kind: regulatory | jurisdiction: US-CA | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** The CCPA as amended grants California consumers rights over personal information with service-provider contract requirements, enforced by the CPPA and the Attorney General. Its exemption for GLBA-covered data is data-level, not entity-level: a financial firm stays in scope for personal information outside its GLBA flows, such as web and app analytics, marketing and prospect data.
- **Buyer reading:** A California fintech privacy team runs a two-track map: GLBA data on one side, CCPA data on the other. The vendor's data map must support the split, and service-provider terms must satisfy CCPA restrictions for the CCPA-track data.
- **Authority:** Cal. Civ. Code § 1798.100 et seq.; § 1798.145(e) (GLBA data-level exemption).
- **Applicability:** Prospect serves California consumers; personal information beyond GLBA flows touches the service.
- **Inputs required:** data_classes, jurisdiction.

### CA-ADMT-002 CPPA automated decisionmaking rules with 2027 deadlines
kind: regulatory | jurisdiction: US-CA | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** CPPA regulations effective 1 January 2026 regulate automated decisionmaking technology used for decisions in the regulations' defined categories, financial or lending services among them: by 1 January 2027 businesses must give pre-use notice, offer an opt-out subject to exceptions including a human-appeal route, and answer access requests about the logic and outputs. Risk assessments are required for such processing, with pre-existing activities assessed by 31 December 2027 and summaries to the CPPA from 1 April 2028.
- **Buyer reading:** A dated compliance runway the buyer is already on. Lending and account decisions sit inside the defined categories, so the buyer needs vendor support for notices, the human-review alternative, access-response content and the risk-assessment file. The 1 January 2027 date is the urgency anchor for California deals.
- **Authority:** CCPA regulations (CPPA; OAL approval 23 September 2025; effective 1 January 2026), automated decisionmaking compliance by 1 January 2027.
- **Applicability:** Prospect uses the AI for consumer-affecting decisions on California residents.
- **Inputs required:** ai_touchpoint, data_classes.

### CA-AI-003 The California transparency cluster
kind: regulatory | jurisdiction: US-CA | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** Three disclosure-type duties recur in California diligence: the Bolstering Online Transparency Act requires disclosure when a bot communicates commercially with Californians; AB 2013 (from 1 January 2026) requires developers of generative AI made available to Californians to publish training-data documentation; SB 53 (2025) imposes safety-framework and incident duties on large frontier developers.
- **Buyer reading:** Buyers convert these into three vendor questions: does the chatbot disclose itself, where is the training-data documentation, and is anyone in the chain SB 53-covered. Pre-written answers close the thread in one email.
- **Authority:** Cal. Bus. & Prof. Code § 17940 et seq.; AB 2013 (2024); SB 53 (2025), Transparency in Frontier Artificial Intelligence Act.
- **Applicability:** Prospect serves Californians through or alongside the AI service.
- **Inputs required:** service_sold, ai_touchpoint.

### CA-DFPI-004 DFPI supervision of California fintechs
kind: regulatory | jurisdiction: US-CA | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** The California Consumer Financial Protection Law gives the DFPI authority over unfair, deceptive and abusive practices by covered persons, reaching many fintechs outside traditional charters, with registration regimes for defined products and active supervision.
- **Buyer reading:** An unchartered California fintech is not unsupervised: the DFPI can examine it, so its compliance function behaves like a supervised one. Run the same review-first approach as for chartered buyers.
- **Authority:** Cal. Fin. Code § 90001 et seq. (CCFPL).
- **Applicability:** California fintech prospect outside bank charters.
- **Inputs required:** firm_type, regulator.

---

## Texas

### TX-AI-001 TRAIGA: intent-framed AI duties with a sandbox
kind: regulatory | jurisdiction: US-TX | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** The Texas Responsible Artificial Intelligence Governance Act (effective 1 January 2026) applies to developers and deployers doing business in Texas: prohibitions framed around intent, including intentional unlawful discrimination, manipulation toward self-harm or crime, social scoring and defined biometric misuse; attorney-general enforcement with a 60-day cure period; and a regulatory sandbox.
- **Buyer reading:** Texas buyers cite TRAIGA early. The intent framing makes the defence file documentary: stated purpose, design intent and testing records. The cure period and sandbox lower the temperature; the documented-intent pack answers the desk.
- **Authority:** TRAIGA (HB 149, 2025), effective 1 January 2026.
- **Applicability:** Prospect or deployment does business in Texas.
- **Inputs required:** jurisdiction, service_sold.

### TX-PRIV-002 TDPSA exempts GLBA entities at entity level
kind: regulatory | jurisdiction: US-TX | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** The Texas Data Privacy and Security Act (in force from 1 July 2024) is the state's comprehensive privacy law, but it exempts GLBA-covered financial institutions at entity level, so many regulated fintech buyers fall outside it entirely while remaining under GLBA.
- **Buyer reading:** The contrast with California is the useful fact: a GLBA-covered Texas buyer may owe nothing under TDPSA where a California peer owes CCPA duties on non-GLBA data. Confirm the buyer's GLBA status before raising TDPSA; misapplied state-privacy framing reads as a seller who has not done the perimeter work.
- **Authority:** Tex. Bus. & Com. Code Ch. 541 (TDPSA); financial-institution entity-level exemption.
- **Applicability:** Texas prospect; applies in the negative for GLBA entities.
- **Inputs required:** firm_type, data_classes.

### TX-BIO-003 Biometric capture needs consent under CUBI
kind: regulatory | jurisdiction: US-TX | regime: cross_regime | scope: shared | status: active | v1.0 (added in seam 1.1.0)
- **Statement:** The Texas Capture or Use of Biometric Identifier Act requires notice and consent before capturing a biometric identifier for a commercial purpose, restricts sale and retention, and is enforced by the attorney general, who has pursued headline actions against large technology firms.
- **Buyer reading:** Fires where onboarding or fraud workflows use face or voice verification on Texans. The buyer asks who captures, where consent sits in the flow, and retention and deletion mechanics. The consent-flow diagram is the artefact that answers it.
- **Authority:** Tex. Bus. & Com. Code § 503.001 (CUBI).
- **Applicability:** ai_touchpoint includes biometric capture or verification of Texas consumers.
- **Inputs required:** ai_touchpoint, data_classes.
