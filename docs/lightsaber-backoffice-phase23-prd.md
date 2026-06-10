# Lightsaber Backoffice: Phases 2 and 3 — No-Constraints PRD

Version 1.0, 2026-06-10. Companion to `lightsaber-backoffice-prd.md` (the Phase 1
source of truth, all of whose invariants continue to hold). This document specifies
everything that remains to make Lightsaber Backoffice the complete delivery engine
of the practice: tenancy and deployment (Component F), regime watch and reactivation
(Component C), the coverage and gap ledger (Component D), the services and engagement
layer (Component H), the tenant portal, and the upgrades to Components A/B/E/G that
multi-tenancy demands. "No constraints" means scope is set by the product, not by a
phase boundary; sequencing lives in the issue list, not here.

Conventions follow the parent PRD: FR-x.n functional requirements with AC acceptance
criteria; **[A]** marks assumptions. Where this document refines a parent FR, the
refinement governs.

---

## 1. What Phase 1 delivered, and what this builds on

Phase 1 shipped the authoring backbone: the 1.1.0 corpus seeded into the database of
record with a byte-identical round trip; schema-enforced authoring with allocation,
lint and validation; two-person review; the five-check blocking release gate; pinned,
checksummed, reproducible releases; provenance, audit log and the defensibility
report. The tenant data model exists behind forced row-level security but has no
surface. This PRD activates it and closes every remaining FR.

Two operating principles carry over unchanged and bind everything below:

1. **The database is the source of truth; the bundle is a build artifact.** A tenant
   deployment is a generated bundle: the pinned release's shared corpus plus exactly
   that tenant's claims, slotted at deploy time.
2. **Substance takes two humans.** Tenant claims are substance. They pass through
   the same review machinery as regulatory rules, with the same author-is-not-
   reviewer guarantee, enforced at the database.

---

## 2. Personas, extended

**Adopter Admin** becomes a live persona: authenticated against exactly one tenant,
authoring that tenant's claims, reading that tenant's coverage and freshness, and
pulling defensibility reports for that tenant's artifacts. Sees nothing of any other
tenant and nothing of the shared corpus beyond what their deployed bundle carries.

**The deployed skill** becomes a live system actor: it authenticates with a
deployment key and writes gap events through one bounded endpoint. It can write
nothing else and read nothing at all.

---

## 3. Component F: Tenant and Deployment Manager

### FR-F.1 Provision tenant
Practice Lead creates a tenant: name, status, onboarded date. Provisioning creates
the tenant's isolated claims namespace (its `tenant_id` keyspace under RLS) and may
create the tenant's admin user (role `tenant_admin`, bound to that tenant).
AC: a freshly provisioned tenant has zero claims, no pin, no deployments; its admin
user authenticates into a portal scoped to that tenant only; no tenant role holds
write access to shared tables.

### FR-F.2 Scope engagement
Record jurisdictions, regimes, SLA tier (`standard` | `priority` | `critical`),
commercial-line flags (retainer, scoped, success) and start date per tenant.
AC: the engagement scope drives the tenant's coverage view and SLA windows; editing
scope is practice-lead only and audited.

### FR-F.3 Author and approve claims
Claims are versioned substance with the rule lifecycle (5.5): draft → in_review →
active → stale (review date passes) → retired. Authored by the Adopter Admin or a
practice author *for* a tenant; approved by a separate reviewer; provenance
(author, approver, evidence, dates) mandatory before active. Claim IDs allocate
within category blocks per the template convention: capability CLM-0xx, security/
certification/residency CLM-1xx, deployment/reference CLM-2xx, figure CLM-3xx.
Voice lint applies to claim text exactly as to rules.
AC: a claim cannot become active without evidence, a review date where it ages, and
an approval by someone other than its author; a banned word cannot reach an active
claim; the empty-claims tenant produces a bundle on which the engine abstains on all
traction.

### FR-F.4 Pin and deploy
Pin a tenant to a published release and deploy: the bundle is the release's exported
shared corpus with `seam/_tenant/<tenant>/approved-claims.md` generated from the
tenant's active claims (the template's structure, claims rendered uncommented under
their category headings). Each deployment carries a unique deployment key for the
gap endpoint and a checksum of the composed bundle.
AC: the deployed bundle contains the deploying tenant's claims and no other
tenant's, asserted automatically on every deploy (FR-7.3); the pin and the deploy
timestamp are recorded; deploying an unpublished release is impossible.

### FR-F.5 Fleet view
Every tenant with its pinned version, freshness (stale rules contained in that
pinned version), claims posture (active count, pending review), upgrade
availability, and last deployment.
AC: a staled rule in any tenant's pinned version flags that tenant; the view never
mixes one tenant's claims into another's row.

### FR-F.6 Upgrade
For a tenant pinned below the latest published release, show the diff (added,
changed, staled, re-authored, retired rule IDs between the two pinned sets). On
approval (Practice Lead, or Adopter Admin where policy allows **[A]** practice-lead
default), re-pin and re-deploy. Prior pins remain reproducible.
AC: an upgrade records prior and new version; a defensibility report against the
prior version still reproduces after the upgrade (FR-7.4).

---

## 4. Component C: Regime Watch and Reactivation

### FR-C.1 Watch items (held from Phase 1, now operable)
Movement notes arm watch items carrying dependent rules, trigger (date or named
event), owner, re-verify date and action, status, last-checked.

### FR-C.2 Trigger
A watch item triggers when an Author/Practice Lead marks its event occurred, or when
its trigger date arrives (surfaced by the deterministic check pass, run on demand
and on API start **[A]** no background daemon; the check is an idempotent endpoint).
On trigger, in one transaction: every dependent rule is set stale, the impact report
is generated, re-authoring tasks open, and SLA clocks start for affected tenants.
AC: triggering is atomic; re-running the check never double-triggers.

### FR-C.3 Impact report
The report names: the staled rules; the published releases whose pinned sets contain
those rules; the tenants pinned to those releases; and the audit pulls whose cited
rules intersect the staled set. Empty sections read "none".
AC: every affected tenant and rule ID is named; the report is retrievable for as
long as the watch item exists.

### FR-C.4 Stale behaviour
A staled rule stays in the corpus and remains citable only with a staleness warning.
The live export and any subsequent release render it `status: stale`, which the
engine honours. Fleet rows whose pinned version contains the rule flag stale.
AC: the next candidate after a trigger carries the stale status in its bundle;
tenant freshness reflects it without redeploy.

### FR-C.5 Re-authoring tasks
One task per staled rule, owner defaulting to the watch item's owner, open until a
new approved version supersedes the stale one. Approving the superseding version
closes the task; closing the last task resolves the watch item and returns it to
the maintenance record.
AC: a staled rule's task is open until a new approved version exists; the watch
item resolves exactly when its last task closes.

### FR-C.6 Scheduled re-verification
A re-verify date arriving with no action marks the item overdue, visible to the
Practice Lead, until checked (last-checked updated) or triggered.
AC: the check pass flips armed→overdue on the date; checking an overdue item
returns it to armed with last-checked recorded.

---

## 5. Component D: Coverage and Gap Ledger

### FR-D.1 Gap ingestion
A write-only endpoint accepts gap events from deployed skills, authenticated by
deployment key. The payload is the bounded abstraction schema and nothing else:
`gap_kind` (uncovered_objection | missing_jurisdiction | missing_input_pattern |
uncovered_regime), `abstention_text`, `jurisdiction` (registry tag or null),
`prospect_context` restricted to abstraction-level keys (firm_type, ai_touchpoint,
data_classes, deployment_model, buyer_persona, regulator), optional
`deal_cost_gbp` **[A]** tenant-reported, optional `occurred_at`.
AC: any unknown top-level or context field rejects the whole payload with the field
named; no raw prospect identity (names, domains, free firmographics) can enter; a
revoked deployment key stops ingesting.

### FR-D.2 Triage
Analyst moves each gap to duplicate (linked to a surviving gap), backlog, or
rejected (reason mandatory). Terminal states stay terminal except backlog →
in_authoring → closed.
AC: every gap reaches a terminal or backlog state; duplicates aggregate onto their
target's frequency; rejected keeps its reason.

### FR-D.3 Backlog ranking
Rank = frequency (the gap plus its duplicates, across tenants) × deal-cost signal
(max of tenant-reported and practice-estimated **[A]** both kept). Orderable by
rank, frequency, or cost.
AC: rank recomputes as duplicates accumulate; the practice can set/override the
cost estimate with the override recorded.

### FR-D.4 Coverage measurement
Per jurisdiction × regime: depth (active rules), freshness (stale count), and the
gap pressure (open gaps logged against that cell over a window). A jurisdiction in
scope with no rules reads 0, never blank. Cells outside a regime's footprint read
out-of-scope.
AC: the matrix is reportable for the practice and, filtered to engagement scope,
per tenant; trend = gaps over time per cell. (True abstention-rate coverage needs
volume telemetry from deployments; the gap-pressure proxy is explicit in the UI.)

### FR-D.5 Jurisdiction registry management
Adding a node requires a parent (roots fixed); additions are practice-lead only and
audited; the registry continues to drive validation, footprints and resolution.

---

## 6. Component H: Services and Engagement Layer

### FR-H.1 SLA tracking
Tier windows **[A]**: time-to-stale-flag / time-to-republish — standard 3d/30d,
priority 1d/14d, critical 4h/7d. On watch trigger, an SLA event opens per affected
tenant (trigger time, tier). The stale flag lands in the same transaction as the
trigger, so time-to-stale measures detection lag (event marked late), and
time-to-republish closes when a published release supersedes the staled rules.
AC: a breach (either window exceeded) flags the event and surfaces to the Practice
Lead with tenant, watch item and elapsed time.

### FR-H.2 Billing events
Loom emits, and never prices: `retainer` on publishing a release that re-authors
rules contained in a tenant's pinned version; `scoped` on deploying an upgrade that
delivers added coverage (new rules / jurisdictions) to a tenant; `success` on a
defensibility pull the tenant marks as tied to a closed deal.
AC: each event carries tenant, line, trigger reference and timestamp; no monetary
amount is stored.

### FR-H.3 Client portal
The tenant_admin's surface, read-mostly: pinned version and freshness (stale rules
in their bundle, upgrade available), their claims with lifecycle states (plus claim
authoring, FR-F.3), coverage filtered to their engagement scope, their gap log, and
the defensibility pull facility.
AC: the portal exposes only the tenant's own rows (proven under RLS with a
non-privileged database role) and the shared corpus only as reflected through their
pinned bundle; a tenant_admin cannot reach any practice surface or another tenant.

### FR-H.4 Practice operating view
For the Practice Lead: fleet freshness, authoring throughput (approved versions per
week by author), gate pass rate, open gaps by rank, SLA breaches, billing event
stream.
AC: aggregates never leak one tenant's claims to another; every number traces to
its instrument (audit log, sla_event, gap_log, eval_run).

---

## 7. Cross-cutting upgrades

### FR-X.1 Defensibility records audit pulls
Every defensibility report records an `audit_pull` (tenant-scoped when pulled by or
for a tenant; practice-scoped otherwise) carrying the artifact reference, cited
release, the resolved rule IDs, and the closed-deal flag where reported. Impact
reports and the success billing line read these records.

### FR-X.2 Claude eval runner
`EVAL_RUNNER=claude` executes each pinned eval case against the candidate bundle
with a model and judges the behavioural assertions, recording per-assertion
verdicts in the eval run. Without credentials the gate refuses to run in claude
mode rather than silently passing. The static runner remains the default and the
floor: claude-mode failures block exactly like static ones.

### FR-X.3 Search
⌘K searches rule IDs, titles, statements, authorities and claims (practice side) or
the tenant's bundle (portal side), returning navigable results.

### FR-X.4 Configuration of record
Retention period (**[A]** seven years), SLA tier windows, review policy and the
lint kill-list live in versioned configuration readable through the API; changes
are audited.

### FR-X.5 Notifications
In-app counters for: reviews awaiting you, watch items overdue, gaps untriaged,
SLA breaches. (Email/webhook delivery is an integration concern, out of scope.)

---

## 7b. Component AI: Assisted authoring and review

The assistant accelerates the scarce specialist; it never replaces either of the
two humans. Hard guardrails on every capability below: the assistant's output is
a draft or a flag, never an approval and never a silently-applied change; every
AI-drafted field is marked as such until a human edits or accepts it; research
output without a source attached is discarded, not shown; nothing the assistant
produces can reach a bundle except through the normal draft → review → approve →
gate path. Provenance records when a version began life AI-assisted. Where model
credentials are absent, assisted endpoints refuse clearly; the deterministic
subset (critic structure checks, scaffolding mechanics) still runs.

### FR-AI.1 Research and sourcing
Give it a regime (and optionally a jurisdiction layer or topic) to deepen; it
returns candidate authorities — article, section, guidance, with links — and for
each a draft Statement and draft Buyer reading, every claim tied to the specific
source it came from, so the lawyer verifies rather than trusts. The heaviest lift
across 59 rules and the layered jurisdictions, and the safest, because the source
is read before anything is accepted.
AC: every candidate carries at least one source with a citation (and URL where
one exists); accepting a candidate opens a pre-filled draft through the normal
authoring path with the sources attached; nothing is auto-submitted; a candidate
whose source the lawyer marks unverifiable is recorded as rejected with the
reason.

### FR-AI.2 Consistency and coverage critic
Point it at the whole corpus; it flags and never authors: contradictions between
rules; rules bundling two assertable units that should split; a member-state
divergence present in one regime but absent in a parallel one; orphaned
cross-references; jurisdiction-tag holes. Structural checks (orphans, tag holes,
parallel-layer asymmetries) run deterministically; semantic checks (contradiction,
bundled units) run through the model where available.
AC: the critic produces findings with rule IDs and reasons, each dismissible with
a recorded reason or convertible into an authoring task; it writes nothing to any
rule; deterministic findings are reproducible run over run.

### FR-AI.3 Schema scaffolding
The lawyer gives the substance rough; the assistant shapes the rule object: ID to
convention (the allocator), suggested jurisdiction tags and regime, a drafted
Applicability and Needed-facts list bound to real prospect fields, voice lint
pre-cleared. Mechanical, low risk.
AC: scaffolded output lands in the editor as an unsaved draft with every
AI-drafted field marked; lint on the scaffold is clean or the offending text is
shown unfixed (never silently rewritten beyond the existing auto-resolve rules);
the lawyer's substance text is never altered semantically.

### FR-AI.4 Gap to draft
From a gap-ledger item, draft the candidate objection rule: substance from the
abstention text, the regulatory rules it would rest on named explicitly, and for
each whether it exists in the corpus (with status) or is itself missing coverage.
AC: the draft opens through the authoring path linked back to the gap (gap moves
to in_authoring); rests-on rules that do not exist are flagged as blocking
prerequisites, not silently invented.

### FR-AI.5 Reviewer assist
Pre-screens a submitted version for the human reviewer: is the Authority checkable
as cited; does the Statement over-reach beyond what the source supports; has the
Buyer reading drifted into legal advice. A third advisory input, never one of the
two approvals.
AC: the assist renders alongside the diff in review; it cannot approve, return,
or alter the version; its advisory is stored with the review record so the
approval trail shows what the reviewer saw; a reviewer can approve against the
advisory (recorded).

### FR-AI.6 The quiet failure modes, designed against

**Eval poisoning.** If the same agent drafts a rule and the eval meant to test
it, the eval bends to pass the draft. Eval authoring is independent of the
agent's drafts by construction: the assist layer has no eval-writing capability,
eval cases record their human author, and the gate's coverage-pairing check
treats an eval as valid pairing only when human-authored.
AC: no assist capability can create or modify an eval case; `eval_case.created_by`
is a human user or null (the shipped suite); this is testable and tested.

**Anchoring.** A human reviewing a clean agent draft is a weaker check than
authoring from scratch; the pull is to rubber-stamp. Acceptance is therefore a
verification act, above all on the Authority: every source on an AI-assisted
version carries a read-tick, and the version cannot be submitted for review until
its author has ticked each source as read. For high-risk kinds (regulatory and
claim), research surfaces the source *without a pre-written conclusion* by
default — authority, location, relevance note; no drafted Statement — so the
lawyer reaches the conclusion themselves. Drafted text is an explicit opt-in,
recorded on the assist run.
AC: submitting an ai_assisted version with an unticked source is blocked naming
the source; research responses for regulatory/claim default to sources-only;
the opt-in is recorded.

**Moat erosion.** The moat is the practice's judgment, banked. If the agent
authors and humans stamp, the judgment stops being exercised and the moat
hollows while looking full. The agent keeps the lawyer authoring: scaffolding
never writes the Statement or Buyer reading (mechanics only); research defaults
to sources-only for substance kinds; and the operating view reports the
ai-assisted share of approved versions so erosion is visible, not quiet.
AC: scaffold output leaves substance fields exactly as the lawyer roughed them;
the operating view carries the ai_assisted share.

**The house pattern, applied to the agent itself.** The authoring agent runs on
the same discipline as the skill it serves: constrained to cite, abstaining
where it cannot find a source, never free-generating an authority. A research
response without a source is discarded server-side; where the model finds
nothing it can cite, the response is an explicit abstention — "no source found,
human input needed" — surfaced as such.
AC: no candidate without a source reaches a user; abstentions render as
abstentions; an invented-looking authority (cite-less assertion) is dropped and
logged.

**Provenance.** `ai_assisted` travels on the rule version from draft to release
pin, and the defensibility report distinguishes rules a human wrote from scratch
from rules a human accepted from a draft. Nothing about the gate, the two-person
rule or reproducibility changes; the agent sits inside them, not beside them.
AC: defensibility entries carry the flag; the flag survives release pinning.

---

## 8. State machines, added

**Claim** (refines 5.5): draft → in_review → (approved ≡ active on approval) →
stale (review_date passes) → retired. in_review → returned → draft. Retired is
terminal per claim_id; versions append.

**Watch item**: armed → triggered → reauthoring → resolved; armed → overdue →
armed (checked) | triggered. Triggered is reachable from overdue.

**Gap**: untriaged → duplicate | rejected (terminal) | backlog → in_authoring →
closed (a published release delivers the coverage).

**Deployment**: created (active) → superseded (a newer deploy for the tenant) →
revoked (key disabled). Bundle artifacts are immutable once written.

---

## 9. Data model deltas

- `tenant.claim` + `title`, `author_user_id`, `reviewer_user_id`, `review_state`,
  `review_notes`, `evidence` (existing), `submitted_at`.
- `tenant.deployment` + `deploy_key` (unique), `checksum`, `release_version`,
  `revoked`.
- `tenant.audit_pull`: `tenant_id` nullable (practice pulls), + `rule_ids text[]`,
  `deal_closed boolean`.
- `tenant.gap_log` + `deal_cost_gbp int`, `cost_estimated_gbp int`, `deployment_id`.
- `shared.reauthor_task`: watch_item_id, rule_id, owner, status (open | closed),
  closed_by_version_id, timestamps.
- `shared.watch_item` + `triggered_at`.
- `shared.app_config`: key, value jsonb, updated_by, updated_at (retention, SLA
  windows, policy).
- `shared.rule_version` + `ai_assisted boolean` (provenance of assisted drafts).
- `shared.assist_run`: capability (research | critic | scaffold | gap_draft |
  reviewer), requested_by, params jsonb, model, status, result jsonb, timestamps.
- `shared.assist_finding`: run_id, kind, rule_ids text[], detail jsonb, status
  (open | dismissed | accepted | task), resolution_reason, resolved_by.

All immutability and RLS regimes extend to the new columns and tables; tenant
tables keep forced RLS keyed on tenant_id.

---

## 10. Out of scope, still

No pricing. No raw prospect data. No legal advice. No CRM. No automated authoring
of substance. Email delivery of notifications. Horizon-scanning feeds (manual
source tracking stands).
