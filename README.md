# Lightsaber Backoffice

The back office that authors, reviews, versions and ships the Lightsaber seam — the
authored corpus of regulatory rules, ICP scoring, objection responses and persona
messaging behind the `lightsaber-regulated-fintech-sales` skill.

The database is the source of truth. The skill bundle under `/skill` is a build
artifact: seeded in, regenerated on publish, byte-identical on the round trip.

## Layout

| Path | What it is |
|---|---|
| `docs/` | Product spec + PRD (the source of truth for behaviour) |
| `design/` | The exported Claude Design frontend (reference; do not edit) |
| `skill/lightsaber-regulated-fintech-sales/` | The shipped seam 1.1.0 bundle: seed source and export target |
| `server/` | Fastify API, SQL migrations, seed harness, gate, exporter |
| `web/` | Vite + React app, design CSS/components ported and wired |
| `packages/voice-lint/` | The voice kill-list lint, shared by editor and gate |

## Scope (built)

Phases 1–3 are implemented: the authoring backbone (A, B, E, G), tenancy and
deployment (F), regime watch and reactivation (C), the gap ledger and coverage
(D), the services layer and tenant portal (H), and the assisted-authoring
component (AI) inside its failure-mode guardrails (eval independence, source
read-ticks, sources-without-conclusions for high-risk research, ai_assisted
provenance through to defensibility reports). See
`docs/lightsaber-backoffice-phase23-prd.md` and
`docs/lightsaber-backoffice-issue-list.md` for the FR map and honest status
of every issue.

## Phase 1 scope (original)

Components **A** (Authoring Workspace), **B** (Review & Approval), **E** (Eval &
Release Gate), **G** (Provenance, Audit & Defensibility), single tenant. Tenancy,
the client portal, regime-watch automation and the gap ledger have their tables
migrated but their surfaces ship in Phases 2/3.

Enforced in the database, not just the application:

- Rule version history is append-only; approved versions are immutable (FR-G.1, FR-9.2)
- A version cannot become active without a recorded approval by someone other
  than its author (FR-B.1–B.4)
- No publish path exists for a red gate run — the `seam_release` state machine
  requires a green `eval_run` on the same candidate (FR-9.3)
- Tenant tables sit behind forced row-level security keyed on `tenant_id` (FR-7.1)

## Run it

Requires Node 20+ (native TypeScript), PostgreSQL running locally, and `createdb`
on the PATH.

```sh
npm install
npm run db:reset        # create + migrate + seed the 1.1.0 corpus, prove the round trip
npm run dev:server      # API on :4000
npm run dev:web         # UI on :5173 (proxies /api)
```

For a populated walkthrough, layer the demo data on top:

```sh
npm run db:reset-demo   # canonical seed, then the showcase driven through the real API
```

The demo leaves every surface live: four releases including one the gate
genuinely failed (the shipped eval-2 defect); three tenants in distinct states
(Meridian Pay pinned one release back with an upgrade diff waiting and a stale
rule in its bundle, Apex Lending upgraded with a claim in review, Volta Insure
provisioned but undeployed); claims across all four categories including one
aged stale; gaps in every triage state ranked by frequency × cost; the watch
list showing a resolved loop (IE-AI-006), a mid-loop re-authoring (US-AI-009)
and an overdue re-verify (AIA-TML-007); all three billing lines; audit pulls
feeding the impact reports; critic findings with one reasoned dismissal; an
AI-assisted rule with verified source ticks; and a rule plus a claim sitting
in the review queue. It prints the live deploy keys so you can POST real gap
events. Nothing in it bypasses an invariant: it drives the same API the UI
uses, so two-person review, the gate, RLS and the source-tick controls all
held while it ran. Tests never use it.

Seeding asserts that the regenerated bundle is byte-identical with `/skill`
before committing anything; it prints the bundle checksum.

Identity in Phase 1 is a dev user-switcher (top right): R. Hale (author),
A. Okafor (reviewer), M. Brennan (practice lead), J. Park (analyst). Roles are
enforced server-side regardless of the switcher (FR-9.7).

## Tests

```sh
npm test
```

Builds a fresh `lightsaber_backoffice_test` database, migrates, seeds, then runs:

- `00-roundtrip` — seeded counts; byte-identical export of release 1.1.0 and the
  live state; checksum stability (FR-E.9, FR-9.6, FR-G.3)
- `10-guards` — immutability, two-person rule, release state machine, publish
  gate, RLS isolation, all at the database layer
- `30-api-flow` — the Phase 1 definition of done end to end: author → lint →
  review → approve → candidate → gate blocks red → fix → green → publish →
  reproduce → defensibility report
- `40-tenants` — provision → engagement → claims under the two-person rule →
  deploy with claims slotted (FR-7.3) → isolation (FR-7.1/7.2) → upgrade with
  reproducibility across it (FR-7.4) → billing
- `50-watch-gaps` — trigger → stale cascade (overlay; history stays
  byte-stable) → impact report → re-author → resolve → publish closes SLA,
  retainer and gap; bounded gap ingestion; ranking; coverage matrix
- `60-assist` — refusal without credentials; deterministic critic; scaffold
  mechanics; eval-poisoning and anchoring controls; ai_assisted provenance
  through a release pin into the defensibility report

The gate runs genuinely red on the seeded corpus: eval case 2 still cites
ICP-DQ-001, which seam 1.1.0 retired. That block is correct behaviour; the flow
test fixes the eval through the API (audited) and publishes green.

## The eval runner

The gate's eval check is pluggable. The default **static** runner verifies
everything deterministically derivable from the corpus (referenced rules exist,
are active or staleness-warned, never retired; jurisdictions resolve; the claims
template ships empty). Executing each case's prompt against the candidate bundle
with a model and judging the behavioural assertions is the **claude** runner
(`EVAL_RUNNER=claude`), stubbed for Phase 1.
