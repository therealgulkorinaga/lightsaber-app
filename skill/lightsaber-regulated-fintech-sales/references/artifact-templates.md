# Reference: Artifact Templates

One template per stage. Every artifact carries the five fixed sections; the footer block is verbatim from SKILL.md's output schema. PARTIAL artifacts state PARTIAL on the first line of the Body with one line on why. Inline citations use square brackets: [RULE-ID].

## Qualify

```
# Qualification: [firm]
[PARTIAL line if applicable]
Band: Pursue | Develop | Park   Score: NN% (scored signals only)
Drivers: [three lines, each: signal, score x weight, rule ID]
Disqualifiers: [fired ICP-DQ rules, or none]
Regime exposure: [each plausible regulatory rule in one line: what it means for this prospect, rule ID]
What would sharpen this: [the missing inputs, each with the rule that needs it]
---
[fixed footer block]
```

## Discover

```
# Discovery set: [firm]
[Grouped by desk per MSG-001 sequence: DPO and data; TPRM and resilience; Model risk; Procurement and legal]
Each question: one line, probing the buyer's state not the law, tagged [RULE-ID]. Twelve maximum, ranked by the prospect's top ICP drivers.
Close: the one question that finds the prior corpse, if ICP-004 scored.
---
[fixed footer block]
```

## Reach out

```
# Outreach: [firm], [persona facet], [channel]
[The message. Cold outreach under 150 words. Structure per MSG-002 and MSG-003: the review gate first, the regime pressure named with its rule cited, the evidence-pack or design-partner offer per MSG-004 or MSG-005, one scoped ask with a date.]
[Subject line if email.]
---
[fixed footer block]
```

## Handle objection

```
# Objection response: [firm]
Objection as stated: [verbatim]
Matched: [OBJ-ID and title, or "No seam coverage" leading to abstention]
Response: [the substance, grounded, citations inline]
Offer next: [the named artefact to the named desk]
Claim gaps: [vendor facts needed from the tenant file, marked TO EVIDENCE, or none]
---
[fixed footer block]
```

## Business case

```
# Business case: [firm], one page
The constraint: [the buyer's review gate and regime pressure, cited]
Status quo cost: [only from operator-supplied structured inputs, each with its source; otherwise this section states what inputs are needed and the artifact is PARTIAL]
The value: [variance and velocity per MSG-006, tied to the buyer's named workflow]
Why now: [dated triggers; timeline rules with staleness state]
The ask: [scoped, dated]
---
[fixed footer block]
```

## Navigate review

```
# Review checklist: [firm]
[Ordered by MSG-001 review sequence. Each item: the demand, the rule it comes from [RULE-ID], status READY (evidenced by a cited CLM rule) or TO PREPARE.]
---
[fixed footer block]
```

## Fixed footer block (verbatim)

```
---
Rules relied on: [comma-separated rule IDs]
Abstentions: [each gap in one line, or "None"]
Missing inputs: [each missing input and which rule needs it, or "None"]
Seam version: [version line from each seam file read]
This artifact frames how a buyer's compliance function reads the named regimes in a buying decision. It is not legal advice.
```
