// Screen 01 — Rule Authoring Workspace (Component A), wired to the API.
// Schema form (left) + gate-first review with inline diff (right), per the
// design. Lint runs as you type; structural validation comes back from every
// save; submission is blocked while anything stands (FR-A.5).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { lintText } from '@lightsaber/voice-lint';
import { Icn } from '../icons.tsx';
import { Button, Rid, Status } from '../primitives.tsx';
import { wordDiff, type DiffPart } from '../diff.ts';
import { get, post, put, ApiError, type User } from '../api.ts';

const TEXT_KEYS = ['statement', 'buyer_reading', 'authority_summary', 'applicability'] as const;

interface Meta {
  jurisdictions: { tag: string; parent_tag: string | null; layer_depth: number; display_name: string }[];
  regimes: { code: string; name: string }[];
  prospect_fields: string[];
}

interface DraftState {
  rule_id: string;
  kind: string;
  regime: string;
  title: string;
  statement: string;
  buyer_reading: string;
  authority_summary: string;
  applicability: string;
  inputs_required: string[];
  jurisdiction_tags: string[];
  movement_note: string;
  kind_fields: Record<string, any>;
  sources: { citation: string; source_type: string; url?: string }[];
  change_note: string;
}

const EMPTY: DraftState = {
  rule_id: '',
  kind: 'regulatory',
  regime: 'DORA',
  title: '',
  statement: '',
  buyer_reading: '',
  authority_summary: '',
  applicability: '',
  inputs_required: [],
  jurisdiction_tags: [],
  movement_note: '',
  kind_fields: {},
  sources: [],
  change_note: '',
};

function versionToDraft(rule: any, v: any, sources: any[]): DraftState {
  return {
    rule_id: rule.rule_id,
    kind: rule.kind,
    regime: rule.regime ?? '',
    title: v.title ?? '',
    statement: v.statement ?? '',
    buyer_reading: v.buyer_reading ?? '',
    authority_summary: v.authority_summary ?? '',
    applicability: v.applicability ?? '',
    inputs_required: v.inputs_required ?? [],
    jurisdiction_tags: v.jurisdiction_tags ?? [],
    movement_note: v.movement_note ?? '',
    kind_fields: v.kind_fields ?? {},
    sources: sources.filter((s) => s.rule_version_id === v.id),
    change_note: v.change_note ?? '',
  };
}

function DiffInline({ parts }: { parts: DiffPart[] }) {
  return (
    <span className="chg-text">
      {parts.map((p, i) =>
        p.t === 'del' ? (
          <span key={i} className="di-del">
            {p.s}
          </span>
        ) : p.t === 'ins' ? (
          <span key={i} className="di-ins">
            {p.s}
          </span>
        ) : (
          <span key={i}>{p.s}</span>
        ),
      )}
    </span>
  );
}

function Field({
  label,
  changed,
  help,
  children,
}: {
  label: string;
  changed?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <div className="field-head">
        <label>{label}</label>
        {changed && <span className="edited-tag">edited</span>}
      </div>
      {children}
      {help && <div className="fc-help">{help}</div>}
    </div>
  );
}

function TagChips({
  tags,
  meta,
  onAdd,
  onRemove,
  layered,
}: {
  tags: string[];
  meta?: Meta | null;
  onAdd: (t: string) => void;
  onRemove: (t: string) => void;
  layered?: boolean;
}) {
  const layerOf = (t: string) => {
    const j = meta?.jurisdictions.find((x) => x.tag === t);
    if (!j) return 'unknown';
    return ['union', 'national', 'local'][j.layer_depth] ?? `layer ${j.layer_depth}`;
  };
  return (
    <div className="jtags">
      {tags.map((t) => (
        <span key={t} className={'jtag' + (layered && meta?.jurisdictions.find((x) => x.tag === t && !x.parent_tag) ? ' parent' : '')}>
          <span>{t}</span>
          {layered && <span className="lvl">{layerOf(t)}</span>}
          <span className="rm" title="remove" onClick={() => onRemove(t)} style={{ cursor: 'pointer' }}>
            <Icn name="x" size={11} />
          </span>
        </span>
      ))}
      <button
        className="jtag-add"
        title="add"
        onClick={() => {
          const v = window.prompt(layered ? 'Jurisdiction tag (e.g. EU, IE, US-NY):' : 'Prospect field:');
          if (v) onAdd(v.trim());
        }}
      >
        <Icn name="plus" size={13} />
      </button>
    </div>
  );
}

interface LintItem {
  level: 'block' | 'pass';
  key: string;
  title: string;
  loc?: string;
  desc?: string;
  fix?: string;
  overridable?: { field: string; word: string };
}

function computeClientLint(draft: DraftState, meta: Meta | null): LintItem[] {
  const items: LintItem[] = [];
  const lintable: Record<string, string> = {
    statement: draft.statement,
    buyer_reading: draft.buyer_reading,
    authority_summary: draft.authority_summary,
    applicability: draft.applicability,
    title: draft.title,
    movement_note: draft.movement_note,
  };
  for (const [field, text] of Object.entries(lintable)) {
    for (const hit of lintText(text || '')) {
      if (hit.type === 'em_dash') {
        items.push({
          level: 'block', key: `emdash-${field}`, title: 'Em-dash found', loc: field,
          desc: 'The seam voice allows no em-dashes. Auto-resolve swaps it for a comma.', fix: 'emdash',
          overridable: { field, word: 'em_dash' },
        });
      } else {
        items.push({
          level: 'block', key: `banned-${field}-${hit.word}`, title: `Kill-list word: “${hit.word}”`, loc: field,
          desc: `“${hit.word}” is on the voice kill-list. Auto-resolve rewrites it.`, fix: 'banned',
          overridable: { field, word: hit.word! },
        });
      }
    }
  }

  const badTags = draft.jurisdiction_tags.filter((t) => !meta?.jurisdictions.some((j) => j.tag === t));
  items.push(
    badTags.length
      ? { level: 'block', key: 'tags', title: 'Unknown jurisdiction tag', loc: 'Jurisdiction', desc: `${badTags.join(', ')} is not in the registry.` }
      : { level: 'pass', key: 'tags', title: 'Jurisdiction tags valid' },
  );
  items.push(
    draft.kind !== 'regulatory' || draft.authority_summary.trim()
      ? { level: 'pass', key: 'auth', title: 'Authority present' }
      : { level: 'block', key: 'auth', title: 'Authority missing', loc: 'Authority', desc: 'Every regulatory rule must carry an authority.' },
  );
  const badInputs = draft.inputs_required.filter((f) => !meta?.prospect_fields.includes(f));
  items.push(
    badInputs.length
      ? { level: 'block', key: 'inputs', title: 'Unknown input field', loc: 'Inputs', desc: `${badInputs.join(', ')} is not a prospect field.` }
      : { level: 'pass', key: 'inputs', title: 'Inputs mapped' },
  );
  items.push(
    draft.kind !== 'regulatory' || draft.buyer_reading.trim()
      ? { level: 'pass', key: 'buyer', title: 'Buyer reading set' }
      : { level: 'block', key: 'buyer', title: 'Buyer reading missing', loc: 'Buyer reading', desc: 'The selling read must be authored.' },
  );
  items.push(
    draft.kind !== 'regulatory' || draft.sources.length
      ? { level: 'pass', key: 'source', title: 'Authority source attached' }
      : { level: 'block', key: 'source', title: 'No authority source', loc: 'Sources', desc: 'A regulatory rule with no source cannot be submitted (FR-A.6).' },
  );
  return items;
}

function ReviewPanel({
  items,
  serverFindings,
  onResolve,
  onOverride,
}: {
  items: LintItem[];
  serverFindings: { code: string; field: string | null; message: string }[];
  onResolve: (fix: string) => void;
  onOverride: (field: string, word: string) => void;
}) {
  const issues = items.filter((i) => i.level !== 'pass');
  const passed = items.filter((i) => i.level === 'pass').length;
  const blocks = issues.length + serverFindings.length;
  const ok = blocks === 0;
  return (
    <div className={'gate-card ' + (ok ? 'ok' : 'block')}>
      <div className="gate-head">
        <Icn name={ok ? 'checkCircle' : 'alertCircle'} size={18} />
        {ok ? 'Ready for review' : `${blocks} ${blocks === 1 ? 'thing' : 'things'} to fix before review`}
      </div>
      {(issues.length > 0 || serverFindings.length > 0) && (
        <div className="gate-issues">
          {issues.map((it) => (
            <div key={it.key} className="gate-issue">
              <div className="gi-top">
                <Icn name="alertCircle" size={15} color="var(--block)" />
                <span className="gi-title">{it.title}</span>
                {it.loc && <span className="gi-where">{it.loc}</span>}
              </div>
              {it.desc && <p className="gi-desc">{it.desc}</p>}
              <div className="gi-act" style={{ display: 'flex', gap: 8 }}>
                {it.fix && (
                  <Button variant="secondary" size="sm" icon="refresh" onClick={() => onResolve(it.fix!)}>
                    Auto-resolve
                  </Button>
                )}
                {it.overridable && (
                  <Button variant="ghost" size="sm" onClick={() => onOverride(it.overridable!.field, it.overridable!.word)}>
                    Override with reason…
                  </Button>
                )}
              </div>
            </div>
          ))}
          {serverFindings.map((f, i) => (
            <div key={`srv-${i}`} className="gate-issue">
              <div className="gi-top">
                <Icn name="alertCircle" size={15} color="var(--block)" />
                <span className="gi-title">{f.code.replaceAll('_', ' ')}</span>
                {f.field && <span className="gi-where">{f.field}</span>}
              </div>
              <p className="gi-desc">{f.message}</p>
            </div>
          ))}
        </div>
      )}
      <div className="gate-passed">
        <Icn name="check" size={14} color="var(--ok)" />
        <span>
          <b>{passed} checks passed</b> — validation runs again at submission and at the release gate
        </span>
      </div>
    </div>
  );
}

function ChangesPanel({ draft, baseline }: { draft: DraftState; baseline: DraftState | null }) {
  if (!baseline) {
    return (
      <div className="changes">
        <div className="changes-head">
          <h3>What changed</h3>
          <span className="vs">new rule</span>
        </div>
        <div className="chg-unchanged" style={{ borderTop: 'none', paddingTop: 4 }}>
          First version. Everything here is new; the review panel is the gate.
        </div>
      </div>
    );
  }
  const rows: { key: keyof DraftState; label: string; join?: boolean }[] = [
    { key: 'statement', label: 'Statement' },
    { key: 'authority_summary', label: 'Authority' },
    { key: 'buyer_reading', label: 'Buyer reading' },
    { key: 'applicability', label: 'Applicability' },
    { key: 'movement_note', label: 'Movement note' },
    { key: 'jurisdiction_tags', label: 'Jurisdiction', join: true },
    { key: 'inputs_required', label: 'Inputs required', join: true },
  ];
  const ser = (v: unknown) => (Array.isArray(v) ? v.join('|') : String(v ?? ''));
  const changed = rows.filter((r) => ser(draft[r.key]) !== ser(baseline[r.key]));
  const unchanged = rows.filter((r) => ser(draft[r.key]) === ser(baseline[r.key]));
  return (
    <div className="changes">
      <div className="changes-head">
        <h3>What changed</h3>
        <span className="vs">draft vs active</span>
      </div>
      {changed.length === 0 && (
        <div className="chg-unchanged" style={{ borderTop: 'none', paddingTop: 4 }}>
          No edits yet — change a field and it appears here. An unchanged submission is rejected (FR-A.7).
        </div>
      )}
      {changed.map((r) => (
        <div key={r.key} className="chg">
          <div className="chg-name">{r.label}</div>
          {r.join ? (
            <div className="chg-text">
              {(baseline[r.key] as string[]).join(', ')} <span className="di-ins">{(draft[r.key] as string[]).join(', ')}</span>
            </div>
          ) : (
            <DiffInline parts={wordDiff(baseline[r.key] as string, draft[r.key] as string)} />
          )}
        </div>
      ))}
      {unchanged.length > 0 && <div className="chg-unchanged">{unchanged.map((u) => u.label).join(' · ')} — unchanged</div>}
    </div>
  );
}

export function Authoring({ actor, onMutate }: { actor: User | null; onMutate: () => void }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [detail, setDetail] = useState<any>(null);
  const [draft, setDraft] = useState<DraftState>(EMPTY);
  const [baseline, setBaseline] = useState<DraftState | null>(null);
  const [openVersion, setOpenVersion] = useState<any>(null);
  const [serverFindings, setServerFindings] = useState<any[]>([]);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [newMode, setNewMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadRules = useCallback(async () => {
    const [m, r] = await Promise.all([get('/api/meta'), get('/api/rules')]);
    setMeta(m);
    setRules(r.rules);
    if (!selected && r.rules.length) {
      const first = r.rules.find((x: any) => x.rule_id === 'DORA-CON-003') ?? r.rules[0];
      setSelected(first.rule_id);
    }
  }, [selected]);

  useEffect(() => {
    loadRules().catch(console.error);
  }, [loadRules]);

  const loadDetail = useCallback(async (ruleId: string) => {
    if (!ruleId) return;
    const d = await get(`/api/rules/${ruleId}`);
    setDetail(d);
    const open = d.versions.find((v: any) => ['draft', 'returned', 'in_review'].includes(v.review_state));
    setOpenVersion(open ?? null);
    const current = d.versions.find((v: any) => v.id === d.rule.current_version_id) ?? d.versions.at(-1);
    const baseVersion = open?.supersedes_version_id
      ? d.versions.find((v: any) => v.id === open.supersedes_version_id)
      : open
        ? null
        : current;
    setBaseline(baseVersion ? versionToDraft(d.rule, baseVersion, d.sources) : null);
    setDraft(versionToDraft(d.rule, open ?? current, d.sources));
    setServerFindings([]);
    setBanner(null);
  }, []);

  useEffect(() => {
    if (selected && !newMode) loadDetail(selected).catch(console.error);
  }, [selected, newMode, loadDetail]);

  const lint = useMemo(() => computeClientLint(draft, meta), [draft, meta]);
  const blocks = lint.filter((i) => i.level === 'block').length + serverFindings.length;

  const set = (k: keyof DraftState, v: any) => setDraft((d) => ({ ...d, [k]: v }));

  const canAuthor = !!actor && ['author', 'reviewer', 'practice_lead'].includes(actor.role);
  const editable =
    canAuthor &&
    (newMode ||
      (openVersion && ['draft', 'returned'].includes(openVersion.review_state) && openVersion.author_id === actor?.id));
  const inReview = openVersion?.review_state === 'in_review';

  const resolve = (fix: string) =>
    setDraft((d) => {
      const n = { ...d };
      const fixText = (s: string) => {
        if (fix === 'emdash') return s.replace(/\s*—\s*/g, ', ').replace(/\s--\s/g, ', ');
        let out = s;
        for (const hit of lintText(s)) {
          if (hit.type === 'banned_word') out = out.replace(new RegExp(`\\b${hit.word}\\b`, 'i'), 'material');
        }
        return out;
      };
      for (const k of [...TEXT_KEYS, 'title', 'movement_note'] as const) n[k] = fixText(n[k]);
      return n;
    });

  const override = async (field: string, word: string) => {
    const reason = window.prompt(`Reason for keeping “${word === 'em_dash' ? 'the em dash' : word}” in ${field}:`);
    if (!reason) return;
    try {
      await post(`/api/rules/${draft.rule_id}/lint-overrides`, { field, word, reason });
      setBanner({ tone: 'ok', text: `Override recorded for ${field}. It clears at submission.` });
    } catch (e) {
      setBanner({ tone: 'err', text: (e as Error).message });
    }
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      const payload: any = { ...draft };
      if (draft.movement_note && !payload.kind_fields.watch) {
        payload.kind_fields = { ...payload.kind_fields, watch: { trigger_type: 'event', event_description: draft.movement_note, reverify_date: null } };
      }
      if (newMode) {
        await post('/api/rules', payload);
        setNewMode(false);
        setSelected(draft.rule_id);
        setBanner({ tone: 'ok', text: `${draft.rule_id} created as a private draft (FR-A.8).` });
      } else {
        const r = await put(`/api/rules/${draft.rule_id}/draft`, payload);
        setServerFindings(r.findings?.filter((f: any) => f.level === 'block') ?? []);
        setBanner({ tone: 'ok', text: 'Draft saved.' });
      }
      await loadRules();
      await loadDetail(draft.rule_id);
      onMutate();
    } catch (e) {
      const err = e as ApiError;
      setServerFindings(err.findings ?? []);
      const detail = err.findings?.map((f) => f.message).join(' · ');
      setBanner({ tone: 'err', text: detail ? `${err.message}: ${detail}` : err.message });
    } finally {
      setSaving(false);
    }
  };

  const openNewVersion = async () => {
    try {
      await post(`/api/rules/${selected}/versions`);
      await loadDetail(selected);
      onMutate();
    } catch (e) {
      setBanner({ tone: 'err', text: (e as Error).message });
    }
  };

  const submit = async () => {
    try {
      await post(`/api/rules/${draft.rule_id}/submit`);
      setBanner({ tone: 'ok', text: `Sent for review. ${draft.rule_id} is now in the review queue.` });
      await loadDetail(draft.rule_id);
      onMutate();
    } catch (e) {
      const err = e as ApiError;
      setServerFindings(err.findings ?? []);
      setBanner({ tone: 'err', text: err.message });
    }
  };

  const startNew = () => {
    setNewMode(true);
    setDetail(null);
    setOpenVersion(null);
    setBaseline(null);
    setDraft({ ...EMPTY, kind: 'regulatory' });
    setServerFindings([]);
    setBanner(null);
  };

  const ruleStatus = newMode ? 'draft' : (openVersion?.review_state ?? detail?.rule?.status ?? 'active');
  const provenance = openVersion ?? detail?.versions?.at(-1);

  return (
    <>
      <div className="ws-head">
        <div className="crumb" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Authoring</span>
          <span className="sep">/</span>
          <select
            className="fc-input"
            style={{ width: 'auto', padding: '4px 8px', font: '500 12px/1 var(--font-mono)' }}
            value={newMode ? '__new__' : selected}
            onChange={(e) => {
              if (e.target.value === '__new__') startNew();
              else {
                setNewMode(false);
                setSelected(e.target.value);
              }
            }}
          >
            {rules.map((r) => (
              <option key={r.rule_id} value={r.rule_id}>
                {r.rule_id} · {r.kind}
                {r.status === 'retired' ? ' · retired' : ''}
              </option>
            ))}
            <option value="__new__">+ New rule…</option>
          </select>
          <span style={{ marginLeft: 'auto' }}>
            <Button
              variant="ghost"
              size="sm"
              icon="plus"
              disabled={!canAuthor}
              title={!canAuthor ? `${actor?.role.replace('_', ' ') ?? 'This role'} cannot author substance (FR-9.7); switch user top-right` : undefined}
              style={!canAuthor ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
              onClick={() => canAuthor && startNew()}
            >
              New rule
            </Button>
          </span>
        </div>
        <div className="ws-title-row">
          <Rid size="lg">{newMode ? draft.rule_id || 'NEW-RULE-ID' : selected}</Rid>
          <Status state={ruleStatus} />
          {openVersion && (
            <span style={{ font: '500 11.5px/1 var(--font-mono)', color: 'var(--text-3)' }}>
              editing v{openVersion.semver_at_author}
              {baseline ? ` · active on file v${baseline ? (detail?.versions.find((v: any) => v.id === openVersion.supersedes_version_id)?.semver_at_author ?? '') : ''}` : ''}
            </span>
          )}
          <h1 style={{ width: '100%', marginTop: 8 }}>{draft.title || 'Untitled rule'}</h1>
        </div>
        <p className="ws-intro">
          <span className="hl">{newMode ? 'Author a new rule, then send it for review.' : 'Revise this rule, then send it for review.'}</span>{' '}
          Edit the fields on the left. The review panel flags anything that must be fixed and shows exactly what changed against
          the live version.
        </p>
        <div className="submeta" style={{ marginTop: 14 }}>
          <span>
            Regime <b>{draft.regime || '—'}</b>
          </span>
          <span style={{ color: 'var(--border-strong)' }}>·</span>
          <span>
            Jurisdiction <b>{draft.jurisdiction_tags.join(', ') || '—'}</b>
          </span>
          <span style={{ color: 'var(--border-strong)' }}>·</span>
          <span>
            Kind <b>{draft.kind}</b>
          </span>
        </div>
      </div>

      {banner && (
        <div
          style={{
            background: banner.tone === 'ok' ? 'var(--accent-50)' : 'var(--block-50, #FEF2F2)',
            borderBottom: '1px solid var(--accent-100)',
            padding: '12px 28px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            font: '500 12.5px/1.4 var(--font-sans)',
            color: banner.tone === 'ok' ? 'var(--accent-700)' : 'var(--block-text, #B91C1C)',
          }}
        >
          <Icn name={banner.tone === 'ok' ? 'checkCircle' : 'alertCircle'} size={16} />
          {banner.text}
          <a href="#" onClick={(e) => { e.preventDefault(); setBanner(null); }} style={{ marginLeft: 'auto', textDecoration: 'underline', color: 'inherit' }}>
            Dismiss
          </a>
        </div>
      )}

      <div className="editor">
        {/* LEFT — schema form */}
        <div className="pane pane-form">
          <div className="form-intro">
            <div>
              <h3>{newMode ? 'New rule' : 'Edit rule'}</h3>
              <p>
                {editable
                  ? 'Change any field. Edits are marked and mirrored in the review panel.'
                  : inReview
                    ? 'This version is in review. It is frozen until approved or returned.'
                    : 'No open draft. Open a new version to edit this rule.'}
              </p>
            </div>
            {!newMode && !openVersion && detail?.rule?.status !== 'retired' && (
              <Button variant="secondary" size="sm" icon="edit" onClick={openNewVersion}>
                Open new version
              </Button>
            )}
          </div>

          <Field
            label="Rule ID"
            help={
              newMode
                ? 'Convention: REGIME-TOPIC-NNN with a three-digit number, e.g. NY-AI-006 or DORA-CON-008. Uppercase. Never reused, retired IDs included.'
                : 'Stable and unique. Never reused — a superseded rule is retired and its replacement takes a new ID.'
            }
          >
            <input
              className="fc-input fc-mono"
              value={draft.rule_id}
              readOnly={!newMode}
              onChange={(e) => set('rule_id', e.target.value.toUpperCase())}
              placeholder="e.g. NY-AI-006"
              style={!newMode ? { background: 'var(--slate-50)', color: 'var(--text-2)' } : undefined}
            />
          </Field>

          <div className="field">
            <div className="fc-row">
              <div>
                <div className="field-head">
                  <label>Regime</label>
                </div>
                <select className="fc-input" value={draft.regime} disabled={!editable} onChange={(e) => set('regime', e.target.value)}>
                  {(meta?.regimes ?? []).map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="field-head">
                  <label>Title</label>
                </div>
                <input className="fc-input" value={draft.title} readOnly={!editable} onChange={(e) => set('title', e.target.value)} />
              </div>
            </div>
          </div>

          <Field label="Jurisdiction" help="Tags layer: EU covers every member state; member-state and city tags stack national rules on top.">
            <TagChips
              tags={draft.jurisdiction_tags}
              meta={meta}
              layered
              onAdd={(t) => editable && set('jurisdiction_tags', [...draft.jurisdiction_tags, t])}
              onRemove={(t) => editable && set('jurisdiction_tags', draft.jurisdiction_tags.filter((x) => x !== t))}
            />
          </Field>

          {draft.kind === 'regulatory' ? (
            <>
              <Field label="Statement" changed={baseline ? draft.statement !== baseline.statement : false} help="The single proposition the engine may assert. This is what grounds every cited claim.">
                <textarea className={'fc-area' + (baseline && draft.statement !== baseline.statement ? ' edited' : '')} rows={7} value={draft.statement} readOnly={!editable} onChange={(e) => set('statement', e.target.value)} />
              </Field>
              <Field label="Buyer reading" changed={baseline ? draft.buyer_reading !== baseline.buyer_reading : false} help="How a compliance buyer reads this in a deal. Where the selling value lives — kept separate from the Statement.">
                <textarea className={'fc-area' + (baseline && draft.buyer_reading !== baseline.buyer_reading ? ' edited' : '')} rows={4} value={draft.buyer_reading} readOnly={!editable} onChange={(e) => set('buyer_reading', e.target.value)} />
              </Field>
              <Field label="Authority" changed={baseline ? draft.authority_summary !== baseline.authority_summary : false} help="The instrument it rests on, at article level. Never invented.">
                <textarea className={'fc-area fc-mono' + (baseline && draft.authority_summary !== baseline.authority_summary ? ' edited' : '')} rows={2} value={draft.authority_summary} readOnly={!editable} onChange={(e) => set('authority_summary', e.target.value)} />
              </Field>
              <Field label="Applicability" changed={baseline ? draft.applicability !== baseline.applicability : false}>
                <textarea className={'fc-area' + (baseline && draft.applicability !== baseline.applicability ? ' edited' : '')} rows={3} value={draft.applicability} readOnly={!editable} onChange={(e) => set('applicability', e.target.value)} />
              </Field>
              <Field label="Inputs required" help="Prospect fields the engine needs before applying the rule. Drives the coverage gate.">
                <TagChips tags={draft.inputs_required} meta={meta} onAdd={(t) => editable && set('inputs_required', [...draft.inputs_required, t])} onRemove={(t) => editable && set('inputs_required', draft.inputs_required.filter((x) => x !== t))} />
              </Field>
              <Field label="Sources" help="The authority sources behind the rule (FR-A.6). Citation, type, optional URL.">
                {draft.sources.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                    <input className="fc-input fc-mono" style={{ flex: 1 }} value={s.citation} readOnly={!editable} onChange={(e) => set('sources', draft.sources.map((x, j) => (j === i ? { ...x, citation: e.target.value } : x)))} />
                    <select className="fc-input" style={{ width: 130 }} value={s.source_type} disabled={!editable} onChange={(e) => set('sources', draft.sources.map((x, j) => (j === i ? { ...x, source_type: e.target.value } : x)))}>
                      {['statute', 'regulation', 'guidance', 'RTS', 'circular', 'executive_order', 'case', 'other'].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                    {editable && (
                      <span style={{ cursor: 'pointer', color: 'var(--text-3)' }} onClick={() => set('sources', draft.sources.filter((_, j) => j !== i))}>
                        <Icn name="x" size={13} />
                      </span>
                    )}
                  </div>
                ))}
                {editable && (
                  <Button variant="ghost" size="sm" icon="plus" onClick={() => set('sources', [...draft.sources, { citation: '', source_type: 'guidance' }])}>
                    Add source
                  </Button>
                )}
              </Field>
              <Field label="Movement note" help="A pending dated or event-based change. Saving a movement note arms a watch item (FR-A.9).">
                <textarea className="fc-area" rows={2} value={draft.movement_note} readOnly={!editable} onChange={(e) => set('movement_note', e.target.value)} />
              </Field>
            </>
          ) : (
            <>
              {['substance', 'gap_text', 'test_raw', 'rationale_raw', 'anchors_raw', 'why_raw'].
                filter((k) => draft.kind_fields[k] !== undefined && draft.kind_fields[k] !== null).map((k) => (
                <Field key={k} label={k.replace(/_raw$/, '').replace('_', ' ')}>
                  <textarea className="fc-area" rows={5} value={draft.kind_fields[k] ?? ''} readOnly={!editable} onChange={(e) => set('kind_fields', { ...draft.kind_fields, [k]: e.target.value })} />
                </Field>
              ))}
            </>
          )}

          <Field label="Change note" help="Why this version exists. Travels with the provenance record (FR-G.2).">
            <textarea className="fc-area" rows={2} value={draft.change_note} readOnly={!editable} onChange={(e) => set('change_note', e.target.value)} />
          </Field>

          {provenance && (
            <div className="field" style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 22 }}>
              <div className="field-head">
                <label>Provenance</label>
              </div>
              <div className="prov">
                <div className="pv">
                  <span className="k">Author</span>
                  <span className="v">{provenance.author_name ?? '—'}</span>
                </div>
                <div className="pv">
                  <span className="k">Reviewer</span>
                  <span className="v" style={{ color: 'var(--text-3)' }}>{provenance.reviewer_name ?? 'Unassigned'}</span>
                </div>
                <div className="pv">
                  <span className="k">Created</span>
                  <span className="v mono">{provenance.created_at?.slice(0, 10)}</span>
                </div>
                <div className="pv">
                  <span className="k">Approved</span>
                  <span className="v mono">{provenance.approved_at?.slice(0, 10) ?? '—'}</span>
                </div>
              </div>
              {provenance.review_notes && (
                <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--warn-50)', border: '1px solid var(--warn-100)', borderRadius: 'var(--r-md)', font: '400 12.5px/1.55 var(--font-sans)', color: 'var(--text-2)' }}>
                  <span style={{ color: 'var(--warn-text)', fontWeight: 500 }}>Returned with notes · </span>
                  {provenance.review_notes}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT — review (gate first), then changes */}
        <div className="pane pane-side">
          <div className="side-intro">
            <h3>Review</h3>
            <p>Runs as you type. Clear the flags, then submit.</p>
          </div>
          <ReviewPanel items={lint} serverFindings={serverFindings} onResolve={resolve} onOverride={override} />
          <ChangesPanel draft={draft} baseline={baseline} />
        </div>
      </div>

      {/* action bar */}
      <div className="ws-actions">
        <span className="gate">
          <Icn name={blocks ? 'alertCircle' : 'checkCircle'} size={16} color={blocks ? 'var(--block)' : 'var(--ok)'} />
          {!canAuthor ? (
            <span>
              <b>{actor?.role.replace('_', ' ')}</b> cannot author substance (FR-9.7) — switch user top-right
            </span>
          ) : newMode ? (
            <span>
              <b>New rule.</b> Create the draft first; submit for review from the saved draft.
            </span>
          ) : blocks ? (
            <span>
              <b>
                {blocks} {blocks === 1 ? 'flag' : 'flags'}
              </b>{' '}
              to clear first
            </span>
          ) : (
            <span>
              <b>All clear.</b> Ready to send for review.
            </span>
          )}
        </span>
        <span className="spacer" />
        <Button variant="secondary" icon="download" disabled={!editable || saving} onClick={saveDraft}>
          {newMode ? 'Create draft' : 'Save draft'}
        </Button>
        <Button
          variant="primary"
          icon="send"
          disabled={newMode || !editable || blocks > 0}
          onClick={submit}
          style={newMode || !editable || blocks > 0 ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
        >
          Submit for review
        </Button>
      </div>
    </>
  );
}
