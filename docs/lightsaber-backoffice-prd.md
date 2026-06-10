# Loom: Seam Authoring Back Office

Product Requirements Document. Working title Loom. Version 1.0, 2026-06-10.

Companion to the Product Specification. This document is build-ready: personas, flows, numbered functional requirements with acceptance criteria, the data model, state machines, the eval and release gate, tenancy and isolation, provenance and audit, the services layer, non-functional requirements, milestones, risks and open decisions.

Conventions. FR-x.n is a functional requirement. AC is its acceptance criteria. Assumptions are marked **[A]**. The system under specification is Loom, the back office. The artifact it produces is the sales skill `lightsaber-regulated-fintech-sales`, currently at seam 1.1.0 with 59 regulatory rules, 10 ICP signals, 2 disqualifiers, 12 objections, 7 messaging rules, an empty tenant-claims template and 10 eval cases. Loom must read, write, version and ship that artifact and everything in it.

---

## 1. Personas

### 1.1 Authoring Legal Specialist (Author)
A qualified lawyer with the regulatory depth to author seam substance. Drafts regulatory, ICP, objection, messaging and tenant-claim rules. Owns the Statement, Buyer reading, Authority and Applicability of a rule. Cannot self-approve a substance rule. Scarce and expensive; the system's job is to keep this person on authoring and approval, not on mechanics.

### 1.2 Reviewer
A second qualified person who approves or returns a submitted rule version. Holds the two-person guarantee on substance. May be the practice lead or a peer specialist. Sees the diff, the authority and the validation result before deciding.

### 1.3 Practice Lead
Owns engagement strategy, the coverage backlog, release decisions and tenant relationships. Configures review policy and SLA tiers. Decides when a candidate version is released. Reads coverage, freshness and throughput. Often also a Reviewer.

### 1.4 Analyst
The productised-majority operator added once the playbook is set. Runs gap intake and triage, schema validation, eval runs, release execution and tenant deployment, all under the Author's and Reviewer's substance approvals. Cannot approve a substance rule. The persona the delegation target is built around.

### 1.5 Adopter Admin (tenant-scoped)
The client-side user at an adopter firm. Authors the tenant's approved-claims file (subject to Reviewer approval), sees the tenant's coverage and freshness, and pulls audit and defensibility reports. Strictly scoped to their own tenant. No access to the shared corpus internals beyond what their deployed bundle contains.

### 1.6 System actor: the deployed skill
Not a human, but a source of input. The skill running in a tenant deployment emits abstention and coverage-gate events that enter Loom as gap records. Read-path only; it never writes to the seam directly.

---

## 2. End-to-end flows

### 2.1 Author a new rule
Author opens the Workspace, selects rule kind and jurisdiction layer, drafts against the schema template, runs inline validation, resolves lint and completeness errors, attaches authority sources, submits for review. Reviewer sees the draft and its validation result, approves or returns with notes. On approval the version becomes active and enters the staging set for the next release. On return it goes back to the Author with the notes attached.

### 2.2 Deepen a regime or add a jurisdiction layer
Practice Lead scopes a coverage target (for example, German member-state layer over the EU rules, or the deeper FCA operational-resilience rules). Author creates a batch of new local-layer rules, each referencing the parent-layer rule it sits under, never editing the parent. Reviewer approves the batch. The batch stages for release. The eval suite gains cases for the new coverage before release (FR-5.6).

### 2.3 Regime moves (the reactivation loop)
A watch item triggers, by its date arriving or by an Author marking a named event as occurred (for example, the EU AI Act Omnibus formal adoption, watched on AIA-TML-007). Loom flags every dependent rule stale, generates an impact report (the stale rules, the tenants on versions including them, the audit-pulled artifacts that relied on them), and opens re-authoring tasks. Author re-authors each stale rule as a new version with a change note citing the movement; Reviewer approves; the rules return to active. The change stages for a release. On publish, affected tenants are notified per their SLA.

### 2.4 A live deal produces an abstention
The deployed skill abstains on an uncovered objection or a missing jurisdiction and logs a gap event. Loom ingests it as a gap record with the abstention text, the prospect context at abstraction level (no raw prospect data), the jurisdiction and the date. Analyst triages: duplicate, backlog or reject. Backlogged gaps rank by frequency and deal-cost signal. The Practice Lead pulls from the ranked backlog into authoring scope (flow 2.2).

### 2.5 Onboard a tenant
Practice Lead provisions a tenant, scopes its engagement (jurisdictions, regimes, SLA tier). Adopter Admin authors the tenant's claims file from the template; Reviewer approves each claim. Practice Lead pins the tenant to a published seam version, and Loom deploys the bundle (shared corpus at that version plus the tenant claims) to the tenant's environment. The tenant's running version is recorded.

### 2.6 Release a seam version
Practice Lead assembles the staging set (approved rule versions since the last release) into a candidate version. Loom runs the eval and release gate (FR-5). On a green run the candidate is published: pinned, versioned, changelogged, exported to a checksummed bundle. On a red run the candidate is blocked with the failing assertions named. Published versions become available for tenant pinning and upgrade.

### 2.7 Upgrade a tenant
On a new published version, Loom shows affected tenants a diff of what changed relative to their pinned version. Practice Lead (or Adopter Admin, per policy) approves the upgrade; Loom re-deploys the bundle at the new version and records the change. Tenants on a superseded version keep reproducibility of prior artifacts (FR-7.4).

### 2.8 Answer an audit request
An Adopter Admin or the Practice Lead requests a defensibility report for a sales artifact, identified by its artifact reference and the seam version it cited. Loom reconstructs the exact rule text, authority and status that was live in that version for every rule the artifact relied on, and produces a report. The report carries the not-legal-advice boundary and the version pin.

---

## 3. Functional requirements

### Component A: Authoring Workspace

**FR-A.1 Schema-enforced rule editor.** The editor presents the full rule object for the selected kind: rule_id, kind, jurisdiction tag set, regime (where applicable), title, Statement, Buyer reading, Authority, Applicability, Inputs required, scope, status, plus per-kind fields (ICP weight and anchors; objection mapped-rule IDs and claim-gap note; messaging body; claim evidence and review date).
AC: a rule cannot be submitted with any required field for its kind empty; per-kind fields appear only for that kind; scope defaults to shared for corpus kinds and tenant for claims.

**FR-A.2 ID allocation and uniqueness.** The system allocates or validates rule_id against the kind and regime conventions (REGIME-TOPIC-NNN, ICP-NNN, ICP-DQ-NNN, OBJ-NNN, MSG-NNN, CLM-NNN) and rejects any duplicate or reused ID, including IDs of retired rules.
AC: submitting a rule with an existing or retired ID is blocked with the conflicting ID named.

**FR-A.3 Jurisdiction tag validation.** Tags are validated against the jurisdiction registry (FR-D.5) and the layering model. A rule may carry several tags; tags must resolve to known nodes.
AC: an unknown tag is rejected; the editor shows the resolved layer (parent and locality) for each tag.

**FR-A.4 Inputs-required binding.** Inputs required must name fields that exist in the prospect object the engine builds (firm_type, jurisdiction, regulator, buyer_persona, service_sold, ai_touchpoint, data_classes, deployment_model, deal_state, firm).
AC: an inputs-required value not matching a known prospect field is flagged before submission.

**FR-A.5 Voice and banned-word lint.** The editor lints every free-text field for em dashes and the banned-word list (Actually, Really, Quietly, Genuine, Interesting, Specific, Significant, Essentially, Straightforward, Just, Momentum) and flags occurrences.
AC: a field containing an em dash or a banned word cannot be submitted until cleared or explicitly overridden by an Author with a recorded reason; the lint list is configurable by the Practice Lead.

**FR-A.6 Authority requirement.** Every regulatory and claim rule carries at least one authority source (citation, type, and where available a URL and retrieval date). Authority is the field the grounding guarantee rests on.
AC: a regulatory or claim rule with no source cannot be submitted.

**FR-A.7 Version diff.** On editing an existing rule, the editor shows a field-level diff against the current active version.
AC: the diff highlights every changed field; an unchanged submission is rejected as a no-op.

**FR-A.8 Draft privacy.** A draft is visible only to its Author and the Reviewers until submitted.
AC: drafts do not appear in coverage, release staging or any tenant-visible surface.

**FR-A.9 Movement-note authoring.** When authoring or editing a rule whose substance has a pending dated or event-based change, the Author can attach a movement note that creates a watch item (FR-C.1).
AC: a movement note requires a trigger type (date or event), a trigger value, and a re-verify action; saving the rule arms the watch item.

### Component B: Review and Approval

**FR-B.1 Submit for review.** An Author submits a draft version, which moves to in_review and notifies the eligible Reviewers.
AC: the Author of a version cannot be its Reviewer; the submission carries the diff, validation result and authority.

**FR-B.2 Approve or return.** A Reviewer approves (version becomes approved and stages for release) or returns with notes (version goes to returned, back to the Author).
AC: approval and return are recorded against the version with reviewer identity and timestamp; a returned version carries the reviewer notes.

**FR-B.3 Two-person rule by kind.** Regulatory and claim kinds require a separate Reviewer approval before becoming active. ICP and messaging kinds follow the configured policy. **[A]** default: ICP and messaging also require review, downgradable by the Practice Lead.
AC: a regulatory or claim version cannot become active without a recorded approval by someone other than its Author.

**FR-B.4 Approval immutability.** An approval is bound to the exact version content; any edit after approval creates a new unapproved version.
AC: editing an approved version returns it to draft and voids the prior approval.

### Component C: Regime Watch and Reactivation

**FR-C.1 Watch items.** Each movement note is a watch item with: the dependent rule(s), a trigger (date or named event), an owner, a re-verify action, a status, and a last-checked timestamp.
AC: the three current movement-noted rules (AIA-TML-007, IE-AI-006, US-AI-009) are representable without loss; a watch item lists every rule that depends on it.

**FR-C.2 Trigger.** A watch item triggers when its date arrives, or when an Author marks its named event as occurred.
AC: on trigger, the dependent rules are set stale and an impact report is generated within the same operation.

**FR-C.3 Impact report.** On trigger, Loom produces a report listing the staled rules, the published versions that include them, the tenants pinned to those versions, and the audit-pulled artifacts that relied on them.
AC: the report names every affected tenant and every staled rule ID; an empty section reads "none", never blank.

**FR-C.4 Stale behaviour.** A stale rule remains in the seam and remains citable by the engine only with a staleness warning until re-authored. Loom marks it and surfaces it in the re-authoring queue.
AC: a published version containing a stale rule is flagged in the release and tenant views; the bundle export carries the stale status so the engine honours it.

**FR-C.5 Re-authoring task.** Triggering opens a re-authoring task per staled rule, assigned to an owner, tracked to closure (a new approved version returning the rule to active).
AC: a staled rule's task is open until a new approved version supersedes it; closing the last task on a watch item resolves the item.

**FR-C.6 Scheduled re-verification.** Watch items with a re-verify date prompt the owner on that date even if not yet triggered, as a backstop against missed movement.
AC: a re-verify date arriving with no action raises an overdue flag visible to the Practice Lead.

### Component D: Coverage and Gap Ledger

**FR-D.1 Gap ingestion.** Loom ingests gap events from deployed skills: abstention text, abstraction-level prospect context, jurisdiction, kind of gap (uncovered objection, missing jurisdiction, missing input pattern, uncovered regime), tenant, timestamp.
AC: a gap event carries no raw prospect personal data; ingestion rejects any payload containing fields outside the agreed abstraction schema (FR-9.5).

**FR-D.2 Triage.** An Analyst triages each gap: duplicate (linked to an existing gap or backlog item), backlog (ranked), or reject (with reason).
AC: every gap reaches a terminal triage state; rejected gaps retain their reason.

**FR-D.3 Backlog ranking.** Backlogged gaps rank by frequency across tenants and a deal-cost signal **[A]** supplied by the tenant or the Practice Lead.
AC: the backlog is orderable by rank; rank recomputes as duplicates accumulate.

**FR-D.4 Coverage measurement.** Loom measures coverage per jurisdiction and regime as the share of incoming fact patterns addressed without abstention, over a window.
AC: coverage is reportable per jurisdiction and per regime and trends over time; a new jurisdiction with no rules reads 0, not blank.

**FR-D.5 Jurisdiction registry.** Loom holds the jurisdiction tree: nodes (UK, EU and member states, US and states and cities), each with a parent and a layer depth, mirroring the seam's layered model.
AC: adding a node requires a parent (except roots UK, EU, US); the registry drives FR-A.3 validation and the resolution order in the engine's bundle.

### Component E: Evaluation and Release Gate

**FR-E.1 Candidate assembly.** A candidate version is the set of approved rule versions as of an assembly point, across all kinds, plus the eval suite as it stands.
AC: a candidate captures exactly the approved versions at assembly; later approvals do not retroactively enter it.

**FR-E.2 Eval run.** Loom runs every eval case (the 10 in `evals.json` plus any added) against the candidate, asserting each case's checks.
AC: a run reports pass or fail per case and per assertion; a single failed assertion fails the run.

**FR-E.3 Citation-integrity check.** Loom verifies that every rule ID referenced anywhere (objection mapped-rule IDs, ICP driver references, eval expected outputs) exists in the candidate and is active or correctly staleness-warned, and that no reference points to a retired rule.
AC: a dangling or retired-pointing reference fails the gate with the offending reference named.

**FR-E.4 Grounding check.** Loom verifies that no eval output asserts a regulatory or claim proposition absent from the candidate seam, and that abstention fires where coverage is absent.
AC: an ungrounded assertion or a missing-but-expected abstention fails the gate.

**FR-E.5 Voice lint at gate.** The gate re-runs the voice and banned-word lint across the whole candidate.
AC: any em dash or banned-word occurrence (outside the explicitly recorded overrides and the voice-rule definition lines) fails the gate.

**FR-E.6 Coverage-paired evals.** New coverage (a new jurisdiction layer or deepened regime) cannot publish without at least one eval case exercising it.
AC: the gate fails if a jurisdiction or regime present in the candidate has no eval case touching it. **[A]** enforced for new layers; existing coverage grandfathered with a backlog to fill.

**FR-E.7 Publish.** On a green run the Practice Lead publishes: the candidate is pinned, versioned (semver: major for breaking schema or removed rules, minor for added rules or coverage, patch for corrections), changelogged, and exported to a checksummed bundle.
AC: a published version is immutable; its bundle checksum is recorded; the changelog lists added, changed, staled, re-authored and retired rules by ID.

**FR-E.8 Block on red.** A red run blocks publish and lists the failing cases and assertions.
AC: no bundle is produced for a red run; the block is visible with the failures named.

**FR-E.9 Bundle export.** Export generates the `SKILL.md` plus `seam/` markdown bundle from the database, identical in structure to the consumed artifact, with the tenant claims slotted at deploy time (FR-F.4).
AC: a round trip (export then re-import) of a published version is lossless against the database of record.

### Component F: Tenant and Deployment Manager

**FR-F.1 Provision tenant.** Create a tenant with name, status, onboarded date, and an isolated claims namespace.
AC: provisioning creates the tenant's RLS-scoped space; no shared-corpus write access is granted to the tenant.

**FR-F.2 Scope engagement.** Record the tenant's engagement: jurisdictions, regimes, SLA tier, commercial-line flags (retainer, scoped, success), start date.
AC: the engagement scope drives the tenant's coverage view and SLA tracking.

**FR-F.3 Author and approve claims.** The Adopter Admin authors claim rules from the template; they pass through Review (FR-B.3) like any substance rule.
AC: a claim cannot become active without provenance (approver, evidence, date) and Reviewer approval; the empty template produces a tenant on which the skill abstains on all traction.

**FR-F.4 Pin and deploy.** Pin the tenant to a published seam version and deploy a bundle composed of that version's shared corpus plus the tenant's active claims.
AC: the deployed bundle contains the tenant's own claims and no other tenant's; the pinned version is recorded with a deploy timestamp.

**FR-F.5 Track running version.** Loom records which published version each tenant runs and surfaces the fleet view.
AC: the fleet view lists every tenant and its pinned version; a staled rule in any tenant's version is flagged.

**FR-F.6 Upgrade.** Present the diff between a tenant's pinned version and a newer published version; on approval, re-deploy and record the change.
AC: an upgrade is recorded with prior and new version; the prior version remains reproducible for past artifacts.

### Component G: Provenance, Audit and Defensibility

**FR-G.1 Immutable history.** Every rule version is append-only and immutable once approved; edits create new versions; nothing is deleted.
AC: the full version history of any rule is retrievable, including retired versions.

**FR-G.2 Provenance on every version.** Author, reviewer, approval timestamp, change note and authority are recorded per version.
AC: no version reaches active without complete provenance.

**FR-G.3 Reproducibility.** Given a published version, Loom reproduces the exact rule text and status of every rule in it.
AC: reproducing a version yields content byte-identical to its exported bundle (modulo tenant claims).

**FR-G.4 Defensibility report.** Given an artifact reference and its cited seam version, Loom produces the live-at-the-time rule text, authority and status for every rule the artifact relied on.
AC: the report names each rule, its text and authority as of that version, and carries the not-legal-advice boundary; a rule that was stale at the time is shown as stale with its warning.

**FR-G.5 Retention.** History and audit records are retained to the configured legal standard. **[A]** seven years.
AC: records within the retention window are always retrievable; retention is configurable.

### Component H: Services and Engagement Layer

**FR-H.1 SLA tracking.** For each watched event, Loom tracks time from trigger to stale flag and from trigger to re-authored publish, against the tenant's SLA tier.
AC: an SLA breach is flagged to the Practice Lead with the event, the tenant and the elapsed time.

**FR-H.2 Billing events.** Loom emits events for the three commercial lines: maintenance activity (re-authoring releases affecting a tenant), scoped-authoring delivery (a new jurisdiction or regime delivered to a tenant), and success signals (audit pulls tied to closed deals, where the tenant reports the close). It holds no pricing. **[A]**
AC: each event carries the tenant, the line, the trigger and a timestamp; no monetary amount is stored in Loom.

**FR-H.3 Client portal.** A read-only tenant surface shows the tenant's coverage, freshness (stale rules in their version, pending upgrades), and an audit-pull facility.
AC: the portal exposes only the tenant's own data and its deployed bundle's coverage; no shared-corpus internals beyond the bundle are visible.

**FR-H.4 Coverage and freshness for the practice.** The Practice Lead sees coverage per jurisdiction and regime, the fleet's freshness, authoring throughput and the gap backlog in one operating view.
AC: the view aggregates across tenants for the practice and never leaks one tenant's claims to another.

---

## 4. Data model

One Postgres database of record. Shared corpus in a common schema; tenant data behind row-level security keyed on tenant_id. Version history append-only. Field names indicative.

### 4.1 Shared schema

**rule**: rule_id (PK), kind, regime, scope, current_version_id (FK), status (draft, in_review, approved, active, stale, retired), created_at.

**rule_version** (immutable, append-only): id (PK), rule_id (FK), semver_at_author, title, statement, buyer_reading, authority_summary, applicability, inputs_required (array), kind_fields (jsonb: ICP weight and anchors; objection mapped_rule_ids and claim_gap; messaging body; etc.), status_at_version, author_id, reviewer_id, approved_at, change_note, supersedes_version_id (FK, self).

**rule_jurisdiction**: rule_id (FK), jurisdiction_tag (FK). Many-to-many.

**jurisdiction**: tag (PK), parent_tag (FK, self, nullable for roots), layer_depth, display_name. Roots: UK, EU, US.

**regime**: code (PK: FCA, PRA, MiCA, DORA, EU_AI_ACT, GDPR, cross_regime, ...), name.

**source**: id (PK), rule_version_id (FK), citation, source_type (statute, regulation, guidance, RTS, circular, executive_order, case), url (nullable), retrieved_at.

**watch_item**: id (PK), trigger_type (date, event), trigger_date (nullable), event_description (nullable), reverify_date (nullable), status (armed, triggered, reauthoring, resolved, overdue), owner_id, last_checked_at.

**watch_rule**: watch_item_id (FK), rule_id (FK). Many-to-many (a movement can hit several rules).

**eval_case**: id (PK), prompt, expected_output, assertions (jsonb), jurisdiction_scope (array), added_in_version.

**eval_run**: id (PK), candidate_version, started_at, finished_at, passed (bool), results (jsonb per case and assertion).

**seam_release**: version (PK, semver), assembled_at, released_by (FK), eval_run_id (FK), changelog (jsonb: added/changed/staled/reauthored/retired by rule ID), status (draft, staged, published, deprecated), published_at.

**release_rule_version**: release_version (FK), rule_version_id (FK). The exact set of versions pinned in a release.

**bundle_export**: id (PK), release_version (FK), format, uri, checksum, exported_at.

**user**: id (PK), name, role (author, reviewer, practice_lead, analyst, tenant_admin), tenant_id (nullable; set for tenant_admin), status.

### 4.2 Tenant schema (RLS on tenant_id)

**tenant**: id (PK), name, status, onboarded_at.

**engagement**: tenant_id (FK), jurisdictions (array), regimes (array), sla_tier, line_flags (retainer, scoped, success), start_date.

**claim** (versioned like rules): claim_id, tenant_id (FK), version, statement, category (capability, security_cert_residency, deployment_reference, figure), evidence, approved_by, approved_at, review_date, status (draft, in_review, active, stale, retired), change_note.

**tenant_pin**: tenant_id (FK), release_version (FK), pinned_at.

**deployment**: id (PK), tenant_id (FK), environment, bundle_uri, deployed_at, active (bool).

**gap_log**: id (PK), tenant_id (FK), gap_kind, abstention_text, prospect_context_abstracted (jsonb, schema-bounded), jurisdiction, logged_at, triage_status (untriaged, duplicate, backlog, rejected), triage_reason, linked_backlog_id (nullable).

**audit_pull**: id (PK), tenant_id (FK), artifact_ref, cited_release_version (FK), requested_by, generated_at, report_uri.

**sla_event**: id (PK), tenant_id (FK), watch_item_id (FK), triggered_at, stale_flagged_at, republished_at, tier, breach (bool).

**billing_event**: id (PK), tenant_id (FK), line (retainer, scoped, success), trigger_ref, occurred_at.

### 4.3 Relationships that carry the guarantees

A published release pins an exact set of rule_versions (release_rule_version), which is what makes FR-G.3 reproducibility and FR-G.4 defensibility hold: an artifact cites a release version, and the report reads the pinned versions, not the current ones. A watch_item links to rules via watch_rule, which is what lets FR-C.3 name every affected rule and, through tenant_pin and release_rule_version, every affected tenant. The jurisdiction self-referencing tree is what the engine's layered resolution reads at bundle time.

---

## 5. State machines

### 5.1 Rule lifecycle
draft -> in_review (on submit) -> approved (on reviewer approval) -> active (on entering a published release) -> stale (on watch trigger) -> [re-authored: a new version goes draft -> in_review -> approved -> active, superseding] ; any active or stale rule -> retired (on Practice Lead decision, recorded, never deleted). in_review -> returned (on reviewer return) -> draft. retired is terminal for that rule_id; a replacement takes a new ID and names the retired ID in its change note.

### 5.2 Release lifecycle
draft (assembling) -> staged (candidate frozen) -> eval_running -> eval_passed | eval_failed. eval_failed -> draft (fix and reassemble). eval_passed -> published (on Practice Lead publish) -> deprecated (on a later version superseding, but remains reproducible). No path from staged to published bypasses eval.

### 5.3 Watch item lifecycle
armed -> triggered (date arrives or event marked) -> reauthoring (tasks open) -> resolved (all dependent rules re-authored and approved). armed -> overdue (re-verify date passes with no action) -> armed (on check) or triggered. 

### 5.4 Gap lifecycle
untriaged -> duplicate | backlog | rejected. backlog -> in_authoring (pulled into scope) -> closed (coverage delivered in a published release). rejected and duplicate are terminal.

### 5.5 Claim lifecycle
Mirrors the rule lifecycle (draft -> in_review -> active -> stale on review_date passing -> retired), tenant-scoped, with provenance mandatory before active.

---

## 6. The evaluation and release gate, in detail

The gate is the single point where a candidate becomes shippable. It runs five checks, all of which must pass.

One, the eval suite (FR-E.2): every case asserts its checks against the candidate. The current suite covers covered-objection grounding, jurisdiction-abstention, traction-abstention against the empty claims template, coverage-gate behaviour on thin input, timeline-rule currency with the movement note surfaced, commercial out-of-scope abstention, number-laundering refusal, and the two layered-jurisdiction cases (Dallas lender across federal, Texas and California; Dublin payments institution across EU and Ireland).

Two, citation integrity (FR-E.3): every rule ID referenced by another rule or by an eval exists in the candidate, is active or correctly staleness-warned, and is not retired.

Three, grounding (FR-E.4): no eval output asserts a regulatory or claim proposition absent from the candidate; abstention fires where coverage is absent.

Four, voice lint (FR-E.5): no em dash, no banned word, outside recorded overrides and the lines that define the voice rule.

Five, coverage-paired evals (FR-E.6): any new jurisdiction or regime in the candidate has at least one eval exercising it.

A green run is necessary, not sufficient. The two-person review (Component B) is what assures the substance is right; the gate assures the mechanics are sound. Both stand between an author's draft and a tenant's deployment. This separation is deliberate: a passing eval on a substantively wrong rule still ships a wrong rule, so substance is never delegated to the gate.

---

## 7. Tenancy and isolation

**FR-7.1 RLS on all tenant tables.** Every tenant table carries tenant_id and is protected by row-level security; a tenant session can read and write only its own rows.
AC: a query in one tenant's context returns zero rows from another tenant under test.

**FR-7.2 Shared corpus is read-only to tenants.** Tenants consume the shared corpus through their deployed bundle; they never read or write the common schema directly.
AC: no tenant role holds write access to shared tables, and no shared-internal endpoint is reachable from a tenant session.

**FR-7.3 Claims never cross.** A deployed bundle contains exactly one tenant's claims.
AC: a bundle's claim set matches the deploying tenant and no other; an eval asserts this on deploy (extends the traction-abstention case).

**FR-7.4 Reproducibility across upgrades.** A tenant that upgrades retains the ability to reproduce artifacts generated under its prior pinned version.
AC: a defensibility report for an artifact cited against the prior version reproduces from that version's pinned rule set after upgrade.

---

## 8. Provenance, audit and defensibility

Covered in FR-G.1 through FR-G.5. The load-bearing design choice: an artifact cites a release version, and every audit and defensibility operation reads the rule_versions pinned in that release (release_rule_version), not the live rules. This is what lets the practice answer an adopter's regulator-facing question precisely, after the live rule has moved, and what turns the reproducibility into both a sales asset and a liability shield. The not-legal-advice boundary is carried in every exported artifact and every defensibility report, matching the skill's footer and keeping the practice on the buyer-reading side of the line.

---

## 9. Non-functional requirements

**FR-9.1 Auditability.** Every state transition on a rule, release, watch item, claim and deployment is logged with actor and timestamp.
AC: an audit log reconstructs who did what and when for any object.

**FR-9.2 Immutability of history.** Approved rule versions, published releases and bundle exports are immutable.
AC: no update or delete path exists for these once final; corrections are new versions.

**FR-9.3 Gate enforcement.** The publish path is technically blocked, not merely discouraged, on a red gate.
AC: there is no operator action that publishes a red candidate.

**FR-9.4 Voice lint in the pipeline.** The lint runs both in the editor (FR-A.5) and at the gate (FR-E.5).
AC: a banned word cannot reach a published bundle.

**FR-9.5 Data minimisation on gap intake.** Gap records carry only abstraction-level context against a bounded schema; no raw prospect personal data enters Loom.
AC: an ingestion payload with fields outside the abstraction schema is rejected; the practice holds no tenant prospect personal data.

**FR-9.6 Reproducible exports.** Bundle exports are deterministic and checksummed.
AC: re-exporting a published version yields the same checksum.

**FR-9.7 Role-based access.** Roles (author, reviewer, practice_lead, analyst, tenant_admin) gate actions per the personas; analysts and tenant_admins cannot approve substance.
AC: an analyst or tenant_admin attempting a substance approval is denied.

---

## 10. Interfaces and surfaces

**Bundle export interface.** Loom writes the `SKILL.md` plus `seam/` markdown structure the skill consumes, slotting tenant claims at deploy. The structure matches the shipped 1.1.0 bundle exactly, so the engine reads Loom output with no change.

**Gap ingestion interface.** A bounded endpoint accepts gap events from deployed skills (FR-D.1) against the abstraction schema (FR-9.5).

**Defensibility output.** A report format carrying rule text, authority, status and the version pin for an artifact (FR-G.4).

**[A]** All surfaces are internal except the tenant portal (FR-H.3) and the gap endpoint; the portal is read-mostly and the endpoint write-only against the bounded schema.

---

## 11. Out of scope

No legal advice authoring; buyer-reading only. No sales execution; the skill does that. No raw prospect data storage. Not a CRM. No pricing logic; billing events only. No automated rule authoring; substance is authored by a qualified human and approved by a second. No public-internet horizon-scanning automation in the first releases (manual source tracking; feeds later, section 13 of the spec).

---

## 12. Success metrics and instrumentation

Authoring throughput: approved rules per analyst-week at fixed reviewer load (instrument: rule_version timestamps by role). Freshness: median trigger-to-stale and trigger-to-republish (instrument: sla_event). Grounding integrity: gate pass rate and sampled post-publish audit of assertions (instrument: eval_run, audit sampling). Coverage: abstention-free share per jurisdiction and regime over a window (instrument: gap_log against deployment volume). Defensibility: time-to-report and clean-reproduction rate (instrument: audit_pull). Reuse: shared-corpus share of a new engagement versus net-new authoring (instrument: engagement scope against rules authored for it).

---

## 13. Milestones

Phase 1, authoring backbone (Components A, B, E, G; single tenant). Exit: the 1.1.0 seam is reproduced in Loom from the database, edited, reviewed, eval-gated and exported losslessly, with full provenance and a defensibility report for a sample artifact.

Phase 2, tenancy and client surface (Component F; read-only G and H). Exit: two tenants onboarded with isolated, approved claims, pinned and deployed at a published version, each with a coverage-and-freshness portal and a working audit pull; cross-tenant isolation proven under test.

Phase 3, watch and services automation (Components C, D; active H). Exit: the three live movement-noted rules are armed as watch items, a triggered event produces a correct impact report and re-authoring loop through to republish, gap events from a deployment drive a backlog item to closed, and SLA and billing events emit correctly.

---

## 14. Risks and mitigations

Authoring bottleneck: schema, templates, two-person review and the analyst-runnable mechanics keep the scarce specialist on substance; the gap ledger points the scarce hours at real demand.

Regime-watch false negative: dual sourcing on watched items, mandatory re-verify dates with overdue flags (FR-C.6), and the engine's staleness-warning backstop.

Over-claiming in tenant claims: provenance gate on claims (FR-F.3), empty-by-default template, reviewer approval on the claim kind.

Scope creep into legal advice: field separation in the schema (Statement versus Buyer reading), the not-legal-advice boundary on every export and report.

Key-person concentration: recorded provenance and the banked corpus make the judgement legible; the reviewer role builds the second qualified pair of eyes by design.

Gate gaming: the gate is necessary not sufficient, and substance approval is never delegated to it; coverage-paired evals stop new coverage shipping untested.

---

## 15. Open decisions

1. Stack and hosting. **[A]** web app over managed Postgres.
2. Review scope for ICP and messaging kinds. **[A]** review on by default.
3. Retention period. **[A]** seven years.
4. External authoring contractors and their gating.
5. Horizon-scanning: manual first, feeds later. **[A]**
6. Tenant portal depth in Phase 2: app surface or delivered report.
7. Billing boundary. **[A]** Loom emits events, holds no pricing.
8. Deal-cost signal for backlog ranking: tenant-reported, practice-estimated, or both. **[A]** both.
