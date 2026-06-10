# Lightsaber Backoffice — Phases 2/3 Issue List

Companion to `lightsaber-backoffice-phase23-prd.md`. Epics E1–E8, issues numbered
`E<epic>.<n>`. Every issue carries acceptance criteria (AC) and implementation
notes (IN). Status reflects this repository.

Legend: ✅ done · 🔶 partial (noted) · ⬜ open.

---

## E1 — Tenancy core (Component F)

**E1.1 Schema delta migration** ✅
Claims gain title/authorship/review machinery; deployments gain keys, checksum,
release and revocation; audit pulls gain rule_ids, deal_closed and nullable
tenant; gaps gain costs and deployment linkage; reauthor_task, assist tables,
app_config, watch triggered_at, rule_version.ai_assisted.
AC: migration applies on a Phase 1 database without data loss; RLS still forced
on every tenant table; immutability triggers unaffected.
IN: `server/migrations/007_phase23.sql`.

**E1.2 Provision tenant** ✅
POST /api/tenants (practice_lead): name → tenant row + optional admin user
(role tenant_admin bound to the tenant).
AC: fresh tenant has zero claims/pins/deployments; admin user authenticates and
is tenant-scoped; provisioning is audited.

**E1.3 Engagement scoping** ✅
PUT /api/tenants/:id/engagement: jurisdictions, regimes, sla_tier, line_flags,
start_date. Practice-lead only, audited.
AC: scope drives portal coverage filter and SLA windows.

**E1.4 Claim authoring with allocation** ✅
POST /api/tenants/:id/claims drafts a claim (title, statement, category,
evidence, review_date); CLM IDs allocate inside category blocks (0xx/1xx/2xx/
3xx); PUT updates a draft; voice lint runs on claim text.
AC: allocation never reuses an ID, retired included; lint findings block
submission, not drafting.

**E1.5 Claim review: two-person rule** ✅
submit / approve / return endpoints; approval requires reviewer ≠ author and
records provenance; approved ≡ active (claims do not wait for a release).
AC: self-approval impossible; analyst/tenant_admin cannot approve; return
carries notes; active claim shows approver and dates.

**E1.6 Claim lifecycle: stale and retire** ✅
Review-date passing marks active claims stale (check pass); retire is terminal
per claim_id; new versions append.
AC: a stale claim renders with its state; retired never renders.

**E1.7 Claims file renderer** ✅
Render `seam/_tenant/<tenant>/approved-claims.md` from the template structure
with the tenant's active claims uncommented under their category headings,
template authoring rules retained, tenant name slotted.
AC: empty tenant renders the template shape (engine abstains on all traction);
renderer output is deterministic.

**E1.8 Pin and deploy** ✅
POST /api/tenants/:id/deploy {release}: compose published release export +
tenant claims file; write bundle; record pin + deployment with unique deploy
key and checksum.
AC: deploying an unpublished release 422s; bundle contains exactly the
deploying tenant's claims (asserted in the deploy transaction, FR-7.3);
checksum recorded; audited.

**E1.9 Fleet view** ✅
GET /api/tenants: every tenant + pinned version, stale-rule count in that
version, claims posture, upgrade availability, last deployment.
AC: stale flag accurate per pinned set, not live state; no cross-tenant claim
leakage.

**E1.10 Upgrade diff and upgrade** ✅
GET /api/tenants/:id/upgrade-diff (pinned vs latest published: added/changed/
staled/reauthored/retired); POST /api/tenants/:id/upgrade re-pins + re-deploys.
AC: prior pins reproduce after upgrade (FR-7.4 test); upgrade audited with
prior and new versions; scoped billing event emitted when the diff adds
coverage.

**E1.11 Isolation proofs** ✅
Tests: two tenants, claims invisible across the boundary under the lsb_tenant
role; deployed bundles never mix claims; tenant_admin denied practice surfaces.
AC: FR-7.1/7.2/7.3 asserted in the suite.

**E1.12 Tenants UI (design port, wired)** ✅
Fleet list + detail (kv, freshness, claims, upgrade panel with diff), provision
and deploy actions, claims authoring/review per role.
AC: matches the design's Tenants screen layout; actions disabled with reasons
by role.

---

## E2 — Regime watch automation (Component C)

**E2.1 Mark-triggered + deterministic check pass** ✅
POST /api/watch/:id/trigger (author/practice_lead, event occurred);
POST /api/watch/check (idempotent): date triggers fire, overdue re-verify
flags, stale claims sweep.
AC: atomic; re-running never double-triggers; check is callable by analyst.

**E2.2 Stale cascade** ✅
Trigger sets every dependent rule stale (rule.status and a superseding stale
version marker on export), in the same transaction.
AC: live export carries `status: stale` for staled rules; the next candidate
inherits it.

**E2.3 Impact report** ✅
GET /api/watch/:id/impact: staled rules; published releases pinning them;
tenants pinned to those releases; audit pulls whose rule_ids intersect.
AC: every section names IDs; empty sections read none; report survives
resolution.

**E2.4 Re-authoring tasks** ✅
Trigger opens one task per staled rule; approving a superseding version closes
its task; last closure resolves the watch item.
AC: task states queryable; resolution exact; closing recorded with the closing
version id.

**E2.5 SLA clock start** ✅
Trigger opens sla_event per affected tenant with tier; republish closes; breach
computed against tier windows.
AC: see E4.1.

**E2.6 Watch UI: full surface** ✅
Trigger/mark/check actions, impact report panel (design's ImpactReport),
re-authoring task list with open-in-authoring links, overdue badges.
AC: matches design Watch screen including impact layout.

---

## E3 — Gap ledger and coverage (Component D)

**E3.1 Deploy-key auth for the skill** ✅
Gap endpoint authenticates X-Deploy-Key against active deployments; revoked
keys refuse.
AC: missing/unknown/revoked key → 401; key maps the event to tenant and
deployment.

**E3.2 Bounded ingestion schema** ✅
POST /api/gaps accepts exactly: gap_kind, abstention_text, jurisdiction?,
prospect_context{firm_type?, ai_touchpoint?, data_classes?, deployment_model?,
buyer_persona?, regulator?}, deal_cost_gbp?, occurred_at?.
AC: any unknown top-level or context field rejects the payload naming the
field (FR-9.5); no identity-bearing field exists to accept.

**E3.3 Triage** ✅
PATCH /api/gaps/:id: duplicate (with link), backlog, rejected (reason
mandatory); analyst or practice_lead.
AC: terminal states stick; duplicate aggregates frequency onto target;
audited.

**E3.4 Backlog ranking** ✅
GET /api/gaps?status=backlog ordered by rank = frequency × max(tenant cost,
practice estimate); practice estimate settable with override recorded.
AC: rank recomputes with duplicates; orderable by rank/freq/cost.

**E3.5 Coverage matrix** ✅
GET /api/coverage: jurisdiction × regime cells (depth, stale, open-gap
pressure), footprint-aware out-of-scope cells, engagement-scope filter for
tenants.
AC: in-scope empty cell reads 0; out-of-scope reads null; matches seeded
corpus counts.

**E3.6 Gap → authoring linkage** ✅
Backlog item pulls into scope: status in_authoring with the draft rule linked;
publishing the rule's release closes the gap.
AC: gap lifecycle terminal states correct; closure automatic on publish.

**E3.7 Coverage UI (design port, wired)** ✅
Matrix with depth/freshness legend; ranked backlog with triage actions and
"Author"/"Draft with assist" affordances.
AC: matches design Coverage screen layout.

---

## E4 — Services layer (Component H)

**E4.1 SLA events and breaches** ✅
Tier windows (standard 3d/30d, priority 1d/14d, critical 4h/7d) in app_config;
events open on trigger, close on republish; breach flag set when either window
exceeds.
AC: breach surfaces tenant, watch item, elapsed; windows configurable.

**E4.2 Billing events** ✅
retainer on publish of re-authored rules contained in a tenant's pinned
version; scoped on upgrade delivering added coverage; success on defensibility
pull flagged deal_closed.
AC: events carry tenant/line/trigger_ref/timestamp; no amounts anywhere.

**E4.3 Tenant portal** ✅
Portal view for tenant_admin: pinned version + freshness + upgrade banner,
claims (authoring per E1.4), engagement-scoped coverage, own gap log,
defensibility pull (records audit_pull with optional deal_closed).
AC: RLS-proven isolation; no practice surfaces reachable; portal-only rail.

**E4.4 Practice operating view** ✅
GET /api/operating: fleet freshness, authoring throughput, gate pass rate,
ranked gaps, SLA breaches, billing stream. Folded into the practice UI.
AC: numbers trace to instruments; no tenant claim content in aggregates.

**E4.5 Notifications counters** ✅
Rail badges: reviews awaiting you, overdue watch items, untriaged gaps, SLA
breaches.
AC: counters live, role-aware.

---

## E5 — Cross-cutting

**E5.1 Defensibility records audit pulls** ✅
Every report inserts audit_pull (tenant or practice scope) with artifact_ref,
release, resolved rule_ids, deal_closed?.
AC: impact reports and success billing read these rows.

**E5.2 app_config of record** ✅
retention_years, sla_windows, eval_runner, assist model config; GET
/api/config; practice-lead updates audited.
AC: config changes appear in the audit log.

**E5.3 ⌘K search** ✅
Client search over rules (ID, title, statement, authority) and claims
(practice side); portal searches the tenant's bundle scope.
AC: keyboard-openable, navigates to the hit.

**E5.4 Claude eval runner** 🔶
EVAL_RUNNER=claude executes pinned eval prompts against the candidate bundle
and judges assertions via the model; refuses without credentials.
AC: per-assertion verdicts recorded; red blocks publish identically.
Status: runner implemented with strict refusal and prompt-construction tests;
unexercised end-to-end in CI (no model credentials in the test environment).

**E5.5 README and docs refresh** ✅

---

## E6 — Assisted authoring (Component AI)

Guardrails on the whole epic: output is drafts and flags only; never an
approval; AI-drafted fields marked until human-edited; research output without
a source is discarded server-side; provenance records ai_assisted.

**E6.1 Assist plumbing** ✅
Anthropic client wrapper (model from app_config, JSON-schema'd outputs),
assist_run/assist_finding records, role gating (substance authors only),
clear 503 refusal without credentials.
AC: every assist call is recorded with capability, params, model, requester.

**E6.2 Research and sourcing (FR-AI.1)** 🔶
POST /api/assist/research {regime, jurisdiction?, topic?} → candidates
[{authority, url?, draft_statement, draft_buyer_reading, source_note}];
accept → pre-filled authoring draft with sources attached + ai_assisted;
reject → recorded with reason.
AC: candidate without a source never reaches the response; accept lands in
the normal draft path.
Status: implemented end-to-end; candidate quality depends on the model and is
verify-before-accept by design. Live-web link verification is the model's
citation, not a crawler check.

**E6.3 Consistency and coverage critic (FR-AI.2)** ✅ deterministic / 🔶 semantic
Deterministic: orphaned cross-references (corpus-wide), jurisdiction-tag holes
(footprint cells with parallel-layer asymmetries), member-state divergence
asymmetry (IE layered on a regime where a parallel regime lacks the layer),
two-assertable-units heuristic (statement conjunction analysis) marked
heuristic. Semantic (model): contradictions, bundled-units judgement.
AC: flags only; dismiss-with-reason or convert-to-task recorded; deterministic
findings reproducible.

**E6.4 Schema scaffolding (FR-AI.3)** ✅
POST /api/assist/scaffold {kind, regime?, jurisdiction_tags?, rough_text} →
shaped draft: allocated ID, suggested tags/regime (footprint-valid), drafted
Applicability + needed facts bound to prospect fields, lint pre-pass applied
via the existing auto-resolve rules only.
AC: substance text semantically untouched; result is an unsaved editor draft.
(Deterministic scaffold without credentials: allocation + lint + tag
suggestion from registry keywords; model adds the drafted Applicability.)

**E6.5 Gap to draft (FR-AI.4)** ✅
POST /api/assist/gap-draft {gap_id} → candidate objection draft with rests_on
IDs and an existence/status map; missing prerequisites flagged blocking; gap →
in_authoring on accept.
AC: rests_on never silently invents a rule.

**E6.6 Reviewer assist (FR-AI.5)** ✅
POST /api/assist/review/:ruleId on an in_review version → advisory: authority
checkability, statement over-reach vs cited source, buyer-reading drift toward
legal advice. Stored with the review record; approval against advisory is
recorded.
AC: cannot approve/return/alter; renders alongside the diff.

**E6.7 Assist UI** ✅
Authoring: Scaffold panel (new mode) + Research panel; Review: advisory card;
Coverage: "Draft with assist" on backlog items; Critic surface with findings
management.

**E6.8 Failure-mode controls (FR-AI.6)** ✅
Eval poisoning: assists cannot write evals (no capability exists); eval_case
records its human author; coverage-pairing counts human-authored evals only.
Anchoring: source read-ticks (POST /api/rules/:id/sources/:sid/verify);
ai_assisted versions blocked at submission until every source is ticked;
research defaults to sources-only (no drafted conclusion) for regulatory and
claim kinds, drafted text an explicit recorded opt-in.
Moat erosion: scaffold never touches substance fields; operating view reports
ai-assisted share of approved versions.
House pattern: source-less candidates discarded server-side and logged;
explicit "no source found, human input needed" abstentions surfaced.
Provenance: ai_assisted carried on the version into release pins and shown in
defensibility reports.
AC: each control individually tested.
IN: migration `008_assist_failure_modes.sql`.

---

## E7 — Hardening and tests

**E7.1 Test files 40/50/60** ✅
40-tenants: provision → engagement → claims (allocation, lint, two-person,
stale) → deploy (claims slotting, FR-7.3) → upgrade (FR-7.4) → isolation
(FR-7.1/7.2) → portal scope.
50-watch-gaps: trigger → stale cascade → impact → tasks → re-author → resolve;
overdue; gap ingest (bounded schema accept/reject, deploy-key auth) → triage →
ranking → closure; SLA + billing events; coverage matrix counts.
60-assist: run records, role gates, credential refusal, deterministic critic
findings on the seeded corpus, scaffold mechanics, gap-draft prerequisites.
AC: clean-room db:reset + full suite green.

**E7.2 Round-trip regression stands** ✅
1.1.0 byte-identity and checksum stability unaffected by every addition.

---

## E8 — Deferred (recorded, not lost)

**E8.1** Email/webhook delivery of notifications (in-app counters ship now).
**E8.2** Horizon-scanning feed integrations (manual source tracking stands).
**E8.3** SSO/real identity (dev user-switcher remains Phase-1-grade; roles are
enforced server-side throughout).
**E8.4** Web crawler verification of research URLs (lawyer verifies by reading
the source; that is the designed control).
**E8.5** Tenant-facing portal theming/white-label.
