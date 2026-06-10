# Reference: Seam Schema and Authoring Guide

For humans extending the seam without touching the engine. The engine reads `SKILL.md`; everything here is for authors.

## The rule object

Every seam entry, whatever its kind, carries:

| Field | Meaning |
|---|---|
| `rule_id` | Stable unique ID, never reused. Format below. |
| `kind` | regulatory, icp, objection, claim, messaging. |
| `jurisdiction` | Tag set: UK, EU, member-state codes (IE, DE, FR, NL, ...), US for the federal layer, US state codes (US-NY, US-CA, US-TX), city codes (US-NYC). EU means the union-level instrument; US means the federal layer. ICP, messaging, objection and claim rules may omit it where they apply everywhere the skill operates. |
| `regime` | For regulatory rules: FCA, PRA, MiCA, DORA, EU_AI_ACT, GDPR, cross_regime. |
| `title` | Short label. |
| `Statement` | The substance the engine may assert. The load-bearing field for grounding. |
| `Buyer reading` | How the buyer's compliance function reads this in a buying decision. The load-bearing field for selling. |
| `Authority` | The instrument the statement rests on, at article level where the author is certain, instrument level otherwise. Never invented. |
| `Applicability` | Conditions under which the rule fires. |
| `Inputs required` | Prospect-object fields the engine needs before applying the rule. Drives the coverage gate. |
| `scope` | shared or tenant. |
| `status` | active, stale, retired. |
| `version` and provenance | Author, date, change note on every change. |

## ID conventions

- Regulatory: `<REGIME>-<TOPIC>-NNN` (DORA-CON-003, AIA-TML-007, GDPR-TRF-004, FCA-CD-003, MICA-OUT-002, XRG-001 for cross-regime, UK-CTP-001 for UK cross-sector).
- ICP: ICP-NNN; disqualifiers ICP-DQ-NNN.
- Objection: OBJ-NNN. Messaging: MSG-NNN. Claims: CLM-NNN (tenant files).
- IDs are permanent. A superseded rule is retired and its replacement takes a new ID, with the old ID named in the new rule's provenance note.

## Jurisdiction resolution (how the engine reads your tags)

A rule applies when its tag set intersects the prospect's jurisdiction set. Tags layer. EU-tagged rules cover all member states, with member-state tags (IE, DE, ...) layering national rules on top. US-tagged rules form the federal layer, with state tags (US-NY, US-CA, US-TX) layering on top and city tags (US-NYC) most local. Layers stack: a Dublin prospect matches EU and IE rules together; a Manhattan prospect matches US, US-NY and US-NYC together. Where two matched rules address the same matter, the engine prefers the most local and records which it used. To author a national, state or city layer, write new rules under the local tag; do not edit the parent-layer rule to carry the divergence.

## Status lifecycle

- **active:** citable.
- **stale:** the underlying regime moved or a movement note matured. Citable only with an explicit staleness warning. Mark stale the moment movement is known; re-author promptly with a new version.
- **retired:** superseded or wrong. Never citable. Kept in the file for audit, under a Retired heading at the bottom.

## Movement notes and reactivation

A rule whose substance has a known pending event (a dated application, a bill in passage, an adopted-but-unpublished amendment) carries a **Movement note** naming the event and the action on maturity. AIA-TML-007 is the live example. When a movement note matures: mark the rule stale, re-author, version up, then re-run any artifact that relied on it.

## Authoring quality bar

1. One rule, one assertable unit. If the Statement carries two independent obligations, split it.
2. Statement states the law's effect; Buyer reading states the buying behaviour it produces. Do not blur them. Buyer reading is where the selling value lives; write it from deal experience.
3. Authority at the precision you can defend. Article number if certain; instrument and title if not. An unverifiable citation is a seam defect of the worst kind: it teaches the engine to assert what cannot be traced.
4. Inputs required must name real prospect-object fields, or the coverage gate cannot do its work.
5. Regime depth grows rule by rule. Deepening means adding rules under a regime (a new RTS, a member-state divergence, a supervisory statement), not bloating an existing Statement.
6. Voice: terse declarative British English. No em dashes. Never use: Actually, Really, Quietly, Genuine, Interesting, Specific, Significant, Essentially, Straightforward, Just, Momentum.

## What goes where

| You learned... | Author it as |
|---|---|
| A regime point buyers raise | regulatory rule |
| A new objection from a live deal | objection rule, mapped to regulatory IDs (author those first if missing) |
| A qualification signal that predicts wins | icp rule with weight and anchors |
| A framing that lands at a desk | messaging rule |
| A fact about the adopter's product | claim rule, tenant file only |
| A commercial position (pricing, liability) | not seam material; it lives with the adopter's deal desk |

## Versioning

The seam versions independently of the engine. Each seam file carries its component version line; bump on any rule change and record author, date, change note in the rule's provenance. Artifacts pin the versions they used, so an output can be reproduced and defended later.
