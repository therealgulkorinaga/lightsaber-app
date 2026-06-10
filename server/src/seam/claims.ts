// Tenant claims: CLM allocation inside category blocks, claim-block rendering,
// and composition of seam/_tenant/<tenant>/approved-claims.md from the shipped
// template structure with the tenant's active claims slotted in (FR-F.3/F.4).

export const CLAIM_CATEGORIES = {
  capability: { base: 1, heading: '### Capability claims' },
  security_cert_residency: { base: 101, heading: '### Security, certifications and processing locations' },
  deployment_reference: { base: 201, heading: '### Deployments and references' },
  figure: { base: 301, heading: '### Figures' },
} as const;

export type ClaimCategory = keyof typeof CLAIM_CATEGORIES;

export function allocateClaimId(category: ClaimCategory, existingIds: string[]): string {
  const { base } = CLAIM_CATEGORIES[category];
  const ceiling = base + 99;
  let max = base - 1;
  for (const id of existingIds) {
    const n = Number(id.replace(/^CLM-/, ''));
    if (n >= base && n <= ceiling && n > max) max = n;
  }
  const next = max + 1;
  if (next > ceiling) throw new Error(`Category ${category} has exhausted its CLM block`);
  return `CLM-${String(next).padStart(3, '0')}`;
}

export interface ClaimRow {
  claim_id: string;
  title: string;
  version: number;
  statement: string;
  category: ClaimCategory;
  evidence: string | null;
  approved_by: string | null;
  approved_at: string | Date | null;
  review_date: string | Date | null;
  status: string;
}

function d(v: string | Date | null): string {
  if (!v) return 'none';
  return typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);
}

/** Render one claim block in the template's exact field shape. */
export function renderClaimBlock(c: ClaimRow): string {
  const meta =
    `kind: claim | scope: tenant | status: ${c.status} | v${c.version}.0 | ` +
    `approved by: ${c.approved_by ?? 'none'} | approved: ${d(c.approved_at)} | review: ${d(c.review_date)}`;
  const lines = [`### ${c.claim_id} ${c.title}`, meta, `- **Statement:** ${c.statement}`];
  if (c.evidence) lines.push(`- **Evidence:** ${c.evidence}`);
  return lines.join('\n');
}

/**
 * Compose the tenant's approved-claims.md from the template source: the tenant
 * line is named, and active (or stale, rendered as such) claims are inserted
 * under their category headings ahead of the template's commented examples.
 */
export function renderClaimsFile(templateSource: string, tenantName: string, claims: ClaimRow[]): string {
  let out = templateSource.replace(
    /\*\*Tenant:\*\* _template \(copy this directory to `seam\/_tenant\/<your-firm>\/` and author there\)\./,
    `**Tenant:** ${tenantName}.`,
  );
  for (const [category, cfg] of Object.entries(CLAIM_CATEGORIES)) {
    const mine = claims
      .filter((c) => c.category === category && ['active', 'stale'].includes(c.status))
      .sort((a, b) => a.claim_id.localeCompare(b.claim_id));
    if (!mine.length) continue;
    const blocks = mine.map(renderClaimBlock).join('\n\n');
    out = out.replace(cfg.heading, `${cfg.heading}\n\n${blocks}`);
  }
  return out;
}

/** Slug for the tenant's directory inside the bundle. */
export function tenantSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
