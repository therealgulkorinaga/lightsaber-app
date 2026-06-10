# Loom: Seam Authoring Back Office

Product Specification. Working title Loom. Version 1.0, 2026-06-10.

This document covers the what and the why. The companion PRD covers the how at build-ready depth.

---

## 0. Document control

Version 1.0. Author: Lightsaber. Scope: the back-office system that authors, improves, versions, maintains and ships the Lightsaber seam, operated as the production engine of a legal-specialist services practice. The product under specification is the authoring and operations system, not the sales skill itself. The sales skill (`lightsaber-regulated-fintech-sales`, seam 1.1.0) is the artifact this system produces and maintains.

Assumptions are marked **[A]** throughout and listed in section 11 for correction.

---

## 1. Summary

Loom is the back office for a deal-velocity legal practice that sells review-ready selling into regulated fintechs. The practice's banked asset is the seam: the authored corpus of regulatory rules, ICP scoring, objection responses and persona messaging that grounds every sales artifact and lets the skill abstain rather than improvise. The seam is the moat, and a moat needs a forge.

Loom is that forge. It is where a legal specialist drafts and reviews seam rules under an enforced schema, tracks the regulatory sources behind each rule, catches regime movement and re-authors the affected rules, runs the anti-hallucination gate before any release, ships versioned seam bundles to adopters, and proves to an adopter's compliance function that a given sales artifact rested on a named rule on a named date. It turns the authoring craft from a person's habit into a controlled, auditable, repeatable operation that one analyst can run the bulk of once the playbook is set.

The throughline from the practice: every intelligent legal implementation is only as good as its model of what the legal data means, and that model requires legal knowledge to author. Loom is the place that knowledge is authored, kept current, and proven.

---

## 2. The services context

The practice closes regulated-tech deals that stall at compliance review. It sells one outcome through three moves: answer the hard regulatory question blocking the deal, fix the implementation so it survives scrutiny, and arm the sales room so compliance becomes a closing tool. The seam productises the first and third moves: it is the reusable IP captured from every engagement (questionnaire libraries, objection patterns, regime maps, governance positions) rather than re-derived per client.

The commercial model the back office must support has three lines: a retainer for keeping a tenant's seam current as regimes move, scoped fees for authoring new coverage (a new jurisdiction, a deeper regime), and a success-linked line tied to deals the tenant closes. Loom instruments all three: maintenance work is the regime-watch and re-authoring loop, scoped authoring is the rule-creation pipeline, and the success line needs the audit trail that ties closed deals to the artifacts and seam version that supported them.

The staffing path is solo and high-margin first, then one analyst running the productised majority of the work. Loom's design target is that the legal specialist authors and approves substance while an analyst runs intake, triage, validation, eval and release. The schema, the two-person review and the eval gate are what make that delegation safe.

The moat is not the corpus alone. It is the corpus plus the accumulated authoring workflow and the banked engagement knowledge across deployments. Loom is where both accumulate.

---

## 3. Problem

Today the seam exists as markdown files edited by hand. That works for one author and one version. It does not survive the practice scaling, and it carries four risks that a legal-specialist service cannot run on.

Authoring drift. Hand-edited rules diverge from the schema, lose provenance, or assert authority no one can trace. A single ungrounded rule poisons the grounding guarantee that is the whole product.

Stale corpus. Regimes move (the EU AI Act Omnibus, the Irish AI Act competent-authority designation, the US federal preemption contest are three live examples already carrying movement notes). A seam that silently goes stale produces confident, wrong selling and a liability for the practice. Catching movement by memory does not scale past a handful of rules.

No release discipline. There is no gate that stops a flawed seam reaching a tenant, no reproducible record of what shipped when, and no clean upgrade path across tenants on different versions.

No defensibility surface. When an adopter's compliance function asks which rule a sales claim rested on, the practice cannot reconstruct the exact rule text that was live for that artifact. That reconstruction is both a sales asset and a liability shield, and it does not exist.

---

## 4. Users and buyer

Loom has internal users and a tenant-facing surface.

Internal: the authoring legal specialist (drafts and owns substance), the reviewer (second legal sign-off), the practice lead (engagement strategy, coverage backlog, releases), and over time the analyst (intake, triage, validation, eval, release execution under the specialist's approval).

Tenant-facing: the adopter admin, who authors the tenant's approved-claims file, sees their coverage and freshness, and pulls audit trails. Tenant access is read-mostly and strictly scoped to their own tenant.

The buyer of the service is the adopter firm: a regulated-services vendor whose seller drives deals into fintechs. They buy current, grounded, defensible selling. They do not buy access to author the shared corpus; that is the practice's craft and moat.

---

## 5. Product principles

The schema is law. Every rule conforms to the rule object or it does not enter the seam. The engine's guarantees rest on the schema holding.

Provenance is non-optional. Every rule version records author, date, change note and the authority it rests on. A rule whose authority cannot be traced is a defect, not a draft.

Two humans for substance. Legal substance is approved by an author and a separate reviewer. The eval gate is necessary, not sufficient; a passing eval on a wrong rule still ships a wrong rule.

Nothing ships through a red gate. No seam version reaches a tenant without a passing eval run, citation-integrity check and voice lint. The gate is enforced, not advisory.

Reproducibility over recency in audit. A pinned seam version reproduces the exact rule text that supported a past artifact, even after the live rule has moved. Recency drives selling; reproducibility drives defensibility; the system keeps both.

The corpus is shared, the claims are isolated. The regulatory, ICP, objection and messaging corpus is one banked asset across tenants. A tenant's claims are theirs alone and never cross the boundary.

Author once, layer locally. Jurisdiction coverage grows by adding local-layer rules (member state, US state, city), never by overwriting a parent-layer rule. The data model mirrors the seam's layered tags.

---

## 6. Components

Loom is eight components over one database of record.

### A. Authoring Workspace
Where rules are drafted, edited and diffed under the enforced schema. Schema-complete editing for every rule kind (regulatory, ICP, objection, messaging, and tenant claims). Inline validation: ID uniqueness, authority present, valid jurisdiction tags, inputs-required naming real prospect fields, voice and banned-word lint. Version diffing against the current active version. Drafts are private until submitted for review.

### B. Review and Approval
Two-person sign-off on substance. An author submits a rule version; a separate reviewer approves or returns it with notes. Approval is recorded against the version. Until approved, a version cannot become active. The practice lead can configure which kinds need which reviewer seniority. **[A]** the two-person rule is mandatory for regulatory and claim kinds, configurable for ICP and messaging.

### C. Regime Watch and Reactivation
The maintenance engine. Each rule's authority is backed by tracked sources. Movement notes are first-class watch items with a trigger (a date, or a named event such as an Official Journal publication). When a watch item triggers, the system flags the dependent rules stale, produces an impact report listing the rules, the tenants on versions that include them and any audit-pulled artifacts that relied on them, and opens re-authoring tasks. This component is the retainer line made operational.

### D. Coverage and Gap Ledger
The demand-driven backlog. Abstentions logged by the skill in live deals (an uncovered objection, a missing jurisdiction, an absent input pattern) flow back as gap records. Coverage is measured per jurisdiction and regime. The backlog is ranked by how often a gap appears and whether it cost a deal, so authoring effort follows real demand rather than guesswork. This component feeds the scoped-authoring line.

### E. Evaluation and Release Gate
The quality wall. Runs the eval suite (the ten cases in `evals/evals.json` plus any added) against a candidate seam version. Checks: zero ungrounded assertions, citation integrity (every referenced rule ID exists and is active or correctly staleness-warned), abstention correctness, coverage-gate behaviour, and voice lint. A release is a pinned, versioned, eval-passed seam, exported as a skill bundle with a checksum. No publish without a green run.

### F. Tenant and Deployment Manager
Onboarding and operations per adopter. Provision a tenant, scope its engagement (which jurisdictions and regimes, which SLA tier), author and approve its claims file, pin it to a seam version, and deploy the bundle. Track which version each tenant runs and manage the upgrade path when a new version publishes.

### G. Provenance, Audit and Defensibility
The legal-grade record. Immutable version history for every rule. Reproducible pinned versions. On request, given an artifact reference and the seam version it cited, produce the exact rule text and authority that was live, as a defensibility report an adopter's compliance function can hold. Retention to a legal standard. **[A]** seven-year retention pending the practice's own policy.

### H. Services and Engagement Layer
The practice's operating surface. Engagement scoping tied to coverage. SLA tracking on regime movement (time from a watched event to stale flag, and to re-authored release). Billing hooks for the three lines (retainer, scoped authoring, success). A read-only client portal showing coverage, freshness and audit pulls. This component turns Loom from internal tooling into the delivery engine of the service.

---

## 7. Architecture summary

One database of record. The seam lives in Postgres with row-level security, multi-tenant, versioned schemas, per the practice's standing architecture preference. The shared corpus sits in a common schema; tenant claims and overlays sit behind RLS keyed on tenant ID. Rule history is append-only and immutable.

The skill bundle is a build artifact, not the source. Loom exports a published seam version to the `SKILL.md` plus `seam/` bundle format the skill consumes, with a checksum. The markdown bundle that exists today becomes a generated output of the database, which resolves the current folder-level isolation into real RLS while keeping the bundle as the deployment unit.

The feedback loop closes through the gap ledger. The skill, running in a tenant's deployment, logs abstentions and coverage-gate misses; those flow back into Loom as gap records that drive the authoring backlog. Production usage shapes authoring priority.

**[A]** Loom is a web application over the Postgres database, internal-first, with the tenant portal as a scoped read-mostly surface added in a later phase. Hosting and stack choice are open (section 11).

---

## 8. Scope and non-goals

In scope: authoring, review, versioning, regime watch, gap intake, eval and release, tenant and claims management, deployment of bundles, and the audit and services surfaces above.

Out of scope. Loom does not author legal advice; it authors how a buyer's compliance function reads a regime in a buying decision, the same boundary the skill carries. It does not run the sales motion; the skill does that in the tenant's environment. It does not store tenant prospect data; prospect inputs live in the tenant's deployment, and only abstraction-level gap records flow back. It is not a CRM. It does not set commercial terms; billing hooks instrument the lines but pricing sits with the deal desk. It does not replace the legal specialist; it makes their judgement scalable and auditable, and the substance still comes from a qualified human.

---

## 9. Success metrics

Authoring throughput: rules authored and approved per analyst-week at fixed reviewer load, the measure of whether the productised majority is delegable.

Freshness: median time from a watched regime event to a stale flag, and to a re-authored published release. This is the retainer's quality signal and an SLA basis.

Grounding integrity: zero ungrounded or untraceable assertions in any published version, enforced by the gate, audited by sampling.

Coverage: share of live-deal fact patterns the seam addresses without abstaining, per jurisdiction and regime, trending up as the gap ledger drives authoring.

Defensibility: time to produce a defensibility report for a given artifact, and the share of audit pulls that reproduce cleanly.

Reuse: share of a new engagement served by the existing shared corpus versus net-new authoring, the measure of whether the moat compounds.

---

## 10. Phasing

Phase 1, the authoring backbone. Components A, B, E and G over the database of record, single tenant (the practice's own seam). Outcome: the seam is authored, reviewed, versioned, eval-gated and exported from Loom rather than by hand, with a full provenance trail. This is the minimum that de-risks the moat.

Phase 2, tenancy and the client surface. Components F and the read-only parts of G and H. Onboard adopters, author and approve their claims, pin and deploy, and give them a coverage-and-freshness portal with audit pulls. Outcome: the practice can serve multiple adopters with isolation and a defensibility surface.

Phase 3, watch and services automation. Components C, D and the active parts of H. Regime-watch triggers, the gap-ledger feedback loop, SLA tracking and billing hooks. Outcome: the retainer and scoped-authoring lines run as instrumented operations, and authoring follows production demand.

---

## 11. Open decisions

1. Stack and hosting for Loom. **[A]** web app over managed Postgres; the stack choice is open.
2. Two-person review scope. **[A]** mandatory for regulatory and claim kinds; confirm for ICP and messaging.
3. Audit retention period. **[A]** seven years; confirm against the practice's policy and any tenant contractual minimums.
4. External authoring contractors: whether anyone beyond the core specialists can author, and how their work is gated (reviewer-only, or restricted rule kinds).
5. Horizon scanning for regime watch: manual source tracking first, or a feed integration. **[A]** manual in Phase 3, feeds later.
6. Tenant portal depth: a true application surface, or a generated and delivered report in Phase 2.
7. Billing: whether Loom holds billing logic or only emits the events a billing system consumes. **[A]** emit events, hold no pricing.

---

## 12. Risks

Authoring bottleneck. Only a credible legal specialist can author substance, which caps throughput. Mitigation: the schema, templates and two-person review let an analyst run intake, validation, eval and release, leaving the specialist to author and approve; the gap ledger keeps the scarce hours on the highest-demand coverage.

Regime-watch false negative. A missed movement leaves a stale rule selling confident, wrong positions. Mitigation: dual sourcing on watched items, scheduled re-verification dates on every movement note, and the staleness warning behaviour in the skill as a backstop.

Over-claiming in tenant claims. A tenant asserts a capability or certification it cannot evidence, and the skill repeats it. Mitigation: the provenance gate on claim rules, the empty-by-default claims template, and reviewer approval on the claim kind.

Scope creep into legal advice. The product drifts from buyer-reading into advising on the law, raising the practice's liability. Mitigation: the not-legal-advice boundary enforced in the schema's field separation and in every exported artifact's footer.

Single-author key-person risk. The moat concentrates in one person's judgement. Mitigation: the banked corpus and recorded provenance make the judgement legible and transferable, and the reviewer role builds a second qualified pair of eyes by design.
