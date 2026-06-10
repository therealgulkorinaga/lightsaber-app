# Seam: Approved Claims (tenant template)

Seam component version: 1.0.0 (template, 2026-06-10). Scope: tenant. Kind: claim.

**Tenant:** _template (copy this directory to `seam/_tenant/<your-firm>/` and author there).

This file is the only source from which the engine may assert your product capabilities, certifications, security posture, deployments, references, traction figures or processing locations. While it holds no `active` rules, the engine abstains on every such assertion and the artifact says so. That is correct behaviour: an empty file produces honest output, an invented claim produces a dead deal and a liability.

## Authoring rules

1. One claim per rule. A claim is one checkable sentence.
2. Every claim carries provenance: who approved it, on what evidence, on what date. If you cannot fill provenance, the claim is not ready.
3. Numbers carry their measurement basis and an as-at date.
4. Claims that age (certifications, deployments, figures) get a review date; the engine treats a claim past review as stale.
5. Retire claims, never delete them; audit needs the history.
6. ID format: CLM-NNN, sequential, never reused.

## Claim categories and templates

Uncomment and complete. Keep the field shape exact; the engine parses it.

### Capability claims
<!--
### CLM-001 [one-line capability]
kind: claim | scope: tenant | status: active | v1.0 | approved by: [name, role] | approved: [date] | review: [date]
- **Statement:** [The product does X, stated as one checkable sentence.]
- **Evidence:** [What proves it: demo script, documentation section, test report.]
-->

### Security, certifications and processing locations
<!--
### CLM-101 [certification or posture item]
kind: claim | scope: tenant | status: active | v1.0 | approved by: [name, role] | approved: [date] | review: [date]
- **Statement:** [For example: ISO 27001 certified, certificate number, expiry. Or: all processing in EEA regions, named provider and regions. Or: customer data is not used to train models, contractual commitment reference.]
- **Evidence:** [Certificate, architecture doc, contract clause reference.]
-->

### Deployments and references
<!--
### CLM-201 [deployment or reference]
kind: claim | scope: tenant | status: active | v1.0 | approved by: [name, role] | approved: [date] | review: [date]
- **Statement:** [Named or anonymised deployment, stage stated honestly: pilot, production, design partner. Reference permission status.]
- **Evidence:** [Contract, LOI, written reference permission.]
-->

### Figures
<!--
### CLM-301 [metric]
kind: claim | scope: tenant | status: active | v1.0 | approved by: [name, role] | approved: [date] | review: [date]
- **Statement:** [Figure, measurement basis, as-at date.]
- **Evidence:** [Where the number comes from.]
-->
