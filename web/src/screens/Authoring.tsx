// Screen 01 — Rule Authoring Workspace (Component A), wired to the API.
// Built for the authoring lawyer: substance first (what the rule says, what
// it rests on), mechanics last and mostly automatic. The system allocates
// rule IDs from a topic code; lint runs as you type; structural validation
// returns on every save; submission is blocked while anything stands.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { lintText } from '@lightsaber/voice-lint';
import { Icn } from '../icons.tsx';
import { Button, Rid, Status, KIND_LABEL } from '../primitives.tsx';
import { wordDiff, type DiffPart } from '../diff.ts';
import { get, post, put, ApiError, type User } from '../api.ts';

const TEXT_KEYS = ['statement', 'buyer_reading', 'authority_summary', 'applicability'] as const;

// Lawyer-facing labels for the per-kind body fields.
const KIND_FIELD_LABELS: Record<string, string> = {
  substance: 'Substance',
  gap_text: 'Claims gap',
  test_raw: 'Test',
  rationale_raw: 'Rationale',
  anchors_raw: 'Scoring anchors (0 / 1 / 2)',
  why_raw: 'Why it matters',
};

interface Meta {
  jurisdictions: { tag: string; parent_tag: string | null; layer_depth: number; display_name: string }[];
  regimes: { code: string; name: string; jurisdictions: string[] }[];
  prospect_fields: string[];
}

/** Walk a tag up the tree to its root (EU, UK, US). */
function rootOf(tag: string, meta: Meta | null): string | null {
  let cur = meta?.jurisdictions.find((j) => j.tag === tag);
  while (cur?.parent_tag) cur = meta?.jurisdictions.find((j) => j.tag === cur!.parent_tag);
  return cur?.tag ?? null;
}

/** Regimes whose footprint covers every chosen tag; all of them when no tags. */
function regimesFor(tags: string[], meta: Meta | null) {
  const all = meta?.regimes ?? [];
  if (!tags.length) return all;
  const roots = tags.map((t) => rootOf(t, meta)).filter(Boolean) as string[];
  return all.filter((r) => !r.jurisdictions?.length || roots.every((root) => r.jurisdictions.includes(root)));
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

function SectionLabel({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div
      style={{
        font: '600 10.5px/1 var(--font-sans)',
        letterSpacing: '0.09em',
        textTransform: 'uppercase',
        color: 'var(--text-4)',
        margin: first ? '4px 0 14px' : '28px 0 14px',
        paddingTop: first ? 0 : 20,
        borderTop: first ? 'none' : '1px solid var(--border)',
      }}
    >
      {children}
    </div>
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
  addPrompt,
}: {
  tags: string[];
  meta?: Meta | null;
  onAdd: (t: string) => void;
  onRemove: (t: string) => void;
  layered?: boolean;
  addPrompt: string;
}) {
  const layerOf = (t: string) => {
    const j = meta?.jurisdictions.find((x) => x.tag === t);
    if (!j) return 'unknown';
    return ['union', 'national', 'local'][j.layer_depth] ?? `layer ${j.layer_depth}`;
  };
  return (
    <div className="jtags">
      {tags.map((t) => (
        <span
          key={t}
          className={'jtag' + (layered && meta?.jurisdictions.find((x) => x.tag === t && !x.parent_tag) ? ' parent' : '')}
        >
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
          const v = window.prompt(addPrompt);
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
          level: 'block',
          key: `emdash-${field}`,
          title: 'Em dash found',
          loc: field,
          desc: 'House style allows no em dashes. Auto-fix swaps it for a comma.',
          fix: 'emdash',
          overridable: { field, word: 'em_dash' },
        });
      } else {
        items.push({
          level: 'block',
          key: `banned-${field}-${hit.word}`,
          title: `Banned word: “${hit.word}”`,
          loc: field,
          desc: `“${hit.word}” is on the banned-word list. Auto-fix rewrites it.`,
          fix: 'banned',
          overridable: { field, word: hit.word! },
        });
      }
    }
  }

  const badTags = draft.jurisdiction_tags.filter((t) => !meta?.jurisdictions.some((j) => j.tag === t));
  items.push(
    badTags.length
      ? {
          level: 'block',
          key: 'tags',
          title: 'Unknown place',
          loc: 'Where it applies',
          desc: `${badTags.join(', ')} is not a place this system knows.`,
        }
      : { level: 'pass', key: 'tags', title: 'Places recognised' },
  );

  if (draft.kind === 'regulatory' && draft.regime && draft.jurisdiction_tags.length) {
    const regime = meta?.regimes.find((r) => r.code === draft.regime);
    const outside = draft.jurisdiction_tags.filter((t) => {
      const root = rootOf(t, meta);
      return regime?.jurisdictions?.length && root && !regime.jurisdictions.includes(root);
    });
    items.push(
      outside.length
        ? {
            level: 'block',
            key: 'regime-scope',
            title: 'Place outside this regulation',
            loc: 'Where it applies',
            desc: `${draft.regime} does not apply in ${outside.join(', ')}. Pick a regulation that does (such as cross_regime), or correct the place.`,
          }
        : { level: 'pass', key: 'regime-scope', title: 'Regulation covers the places' },
    );
  }

  items.push(
    draft.kind !== 'regulatory' || draft.authority_summary.trim()
      ? { level: 'pass', key: 'auth', title: 'Authority present' }
      : {
          level: 'block',
          key: 'auth',
          title: 'Authority missing',
          loc: 'Authority',
          desc: 'Every regulation rule names the law it rests on.',
        },
  );
  const badInputs = draft.inputs_required.filter((f) => !meta?.prospect_fields.includes(f));
  items.push(
    badInputs.length
      ? {
          level: 'block',
          key: 'inputs',
          title: 'Unknown prospect fact',
          loc: 'What we must know',
          desc: `${badInputs.join(', ')} is not a fact the sales engine collects about a prospect.`,
        }
      : { level: 'pass', key: 'inputs', title: 'Prospect facts recognised' },
  );
  items.push(
    draft.kind !== 'regulatory' || draft.buyer_reading.trim()
      ? { level: 'pass', key: 'buyer', title: 'Buyer reading set' }
      : {
          level: 'block',
          key: 'buyer',
          title: 'Buyer reading missing',
          loc: 'Buyer reading',
          desc: 'The selling read must be authored.',
        },
  );
  items.push(
    draft.kind !== 'regulatory' || draft.sources.length
      ? { level: 'pass', key: 'source', title: 'Source attached' }
      : {
          level: 'block',
          key: 'source',
          title: 'No source',
          loc: 'Where to check it',
          desc: 'A regulation rule cannot go for approval without the document it rests on.',
        },
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
        {ok ? 'Ready to send for approval' : `${blocks} ${blocks === 1 ? 'thing' : 'things'} to fix first`}
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
                    Auto-fix
                  </Button>
                )}
                {it.overridable && (
                  <Button variant="ghost" size="sm" onClick={() => onOverride(it.overridable!.field, it.overridable!.word)}>
                    Keep it, with a reason…
                  </Button>
                )}
              </div>
            </div>
          ))}
          {serverFindings.map((f, i) => (
            <div key={`srv-${i}`} className="gate-issue">
              <div className="gi-top">
                <Icn name="alertCircle" size={15} color="var(--block)" />
                <span className="gi-title">{f.message}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="gate-passed">
        <Icn name="check" size={14} color="var(--ok)" />
        <span>
          <b>{passed} checks passed</b> — everything is checked again when you send it, and again before any release ships
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
          First version. Everything here is new; the checks on the right are what stand between it and approval.
        </div>
      </div>
    );
  }
  const rows: { key: keyof DraftState; label: string; join?: boolean }[] = [
    { key: 'statement', label: 'Statement' },
    { key: 'authority_summary', label: 'Authority' },
    { key: 'buyer_reading', label: 'Buyer reading' },
    { key: 'applicability', label: 'Applicability' },
    { key: 'movement_note', label: 'Upcoming change' },
    { key: 'jurisdiction_tags', label: 'Where it applies', join: true },
    { key: 'inputs_required', label: 'Prospect facts', join: true },
  ];
  const ser = (v: unknown) => (Array.isArray(v) ? v.join('|') : String(v ?? ''));
  const changed = rows.filter((r) => ser(draft[r.key]) !== ser(baseline[r.key]));
  const unchanged = rows.filter((r) => ser(draft[r.key]) === ser(baseline[r.key]));
  return (
    <div className="changes">
      <div className="changes-head">
        <h3>What changed</h3>
        <span className="vs">draft vs the live version</span>
      </div>
      {changed.length === 0 && (
        <div className="chg-unchanged" style={{ borderTop: 'none', paddingTop: 4 }}>
          No edits yet — change a field and it appears here. You cannot send an unchanged rule for approval.
        </div>
      )}
      {changed.map((r) => (
        <div key={r.key} className="chg">
          <div className="chg-name">{r.label}</div>
          {r.join ? (
            <div className="chg-text">
              {(baseline[r.key] as string[]).join(', ')}{' '}
              <span className="di-ins">{(draft[r.key] as string[]).join(', ')}</span>
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

function AssistPanel({
  draft,
  newMode,
  onPrefill,
}: {
  draft: DraftState;
  newMode: boolean;
  onPrefill: (p: Partial<DraftState> & { kind_fields?: any }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    setErr(null);
    try {
      setOut(await fn());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="changes" data-tour="assist" style={{ marginTop: 14 }}>
      <div className="changes-head">
        <h3>Assistant</h3>
        <span className="vs">it drafts and flags; people approve</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => post('/api/assist/research', { regime: draft.regime, jurisdiction: draft.jurisdiction_tags[0] }))}>
          Find sources for me
        </Button>
        {newMode && (
          <Button size="sm" variant="secondary" disabled={busy || !draft.statement.trim()} title="Shapes the mechanics around your rough substance" onClick={() => run(() => post('/api/assist/scaffold', { kind: draft.kind, regime: draft.regime, jurisdiction_tags: draft.jurisdiction_tags, rough: { title: draft.title, statement: draft.statement, buyer_reading: draft.buyer_reading } }))}>
          Shape my rough text into a rule
          </Button>
        )}
      </div>
      {err && <div style={{ font: '400 12px/1.5 var(--font-sans)', color: 'var(--warn-text)', marginBottom: 8 }}>{err}</div>}
      {out?.candidates && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ font: '400 11.5px/1.5 var(--font-sans)', color: 'var(--text-3)' }}>
            Sources for you to read yourself; the assistant deliberately writes no conclusions for regulation rules. {out.dropped_sourceless > 0 && `${out.dropped_sourceless} suggestion(s) without a source were discarded.`}
          </div>
          {out.candidates.map((c: any) => (
            <div key={c.finding_id} style={{ padding: '10px 12px', background: 'var(--slate-50)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
              <div style={{ font: '500 12px/1.5 var(--font-mono)' }}>{c.authority}</div>
              <div style={{ font: '400 12px/1.5 var(--font-sans)', color: 'var(--text-2)' }}>{c.relevance}</div>
              {c.url && <div style={{ font: '400 11px/1.5 var(--font-mono)', color: 'var(--text-3)' }}>{c.url}</div>}
              <div style={{ marginTop: 6 }}>
                <Button size="sm" variant="ghost" onClick={async () => {
                  const r = await post(`/api/assist/findings/${c.finding_id}/accept`);
                  onPrefill(r.prefill);
                }}>
                  Start a draft from this
                </Button>
                <Button size="sm" variant="ghost" onClick={async () => {
                  const reason = window.prompt('Rejecting because (e.g. could not verify the source):');
                  if (reason) { await post(`/api/assist/findings/${c.finding_id}/dismiss`, { reason }); setOut({ ...out, candidates: out.candidates.filter((x: any) => x.finding_id !== c.finding_id) }); }
                }}>
                  Reject
                </Button>
              </div>
            </div>
          ))}
          {(out.abstentions ?? []).map((a: string, i: number) => (
            <div key={i} style={{ font: '400 12px/1.5 var(--font-sans)', color: 'var(--text-3)', fontStyle: 'italic' }}>
              {a}
            </div>
          ))}
        </div>
      )}
      {out?.draft && (
        <div style={{ padding: '10px 12px', background: 'var(--slate-50)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
          <div style={{ font: '400 12px/1.5 var(--font-sans)', color: 'var(--text-2)', marginBottom: 6 }}>{out.note}</div>
          <Button size="sm" variant="secondary" onClick={() => onPrefill(out.draft)}>
            Use this shape
          </Button>
        </div>
      )}
    </div>
  );
}

export function Authoring({
  actor,
  onMutate,
  jumpTo,
  onJumped,
}: {
  actor: User | null;
  onMutate: () => void;
  jumpTo?: string | null;
  onJumped?: () => void;
}) {
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
  const [topic, setTopic] = useState('');
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

  // ⌘K landed here with a rule in hand.
  useEffect(() => {
    if (jumpTo) {
      setNewMode(false);
      setSelected(jumpTo);
      onJumped?.();
    }
  }, [jumpTo]);

  // The system allocates the rule ID from regime, jurisdiction and topic.
  useEffect(() => {
    if (!newMode) return;
    if (draft.kind === 'regulatory' && topic.trim().length < 2) {
      setDraft((d) => ({ ...d, rule_id: '' }));
      return;
    }
    const h = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          kind: draft.kind,
          regime: draft.regime,
          jurisdiction: draft.jurisdiction_tags[0] ?? '',
          topic: topic.trim(),
        });
        const r = await get(`/api/rules/suggest-id?${params}`);
        setDraft((d) => ({ ...d, rule_id: r.rule_id }));
      } catch {
        /* keep typing; allocation retries on the next change */
      }
    }, 300);
    return () => clearTimeout(h);
  }, [newMode, topic, draft.kind, draft.regime, draft.jurisdiction_tags.join(',')]);

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
    const reason = window.prompt(`Why keep “${word === 'em_dash' ? 'the em dash' : word}” in ${field}? Your reason goes on the record:`);
    if (!reason) return;
    try {
      await post(`/api/rules/${draft.rule_id}/lint-overrides`, { field, word, reason });
      setBanner({ tone: 'ok', text: `Noted. Your reason is on the record; this flag clears when you send it.` });
    } catch (e) {
      setBanner({ tone: 'err', text: (e as Error).message });
    }
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      const payload: any = { ...draft };
      if (draft.movement_note && !payload.kind_fields.watch) {
        payload.kind_fields = {
          ...payload.kind_fields,
          watch: { trigger_type: 'event', event_description: draft.movement_note, reverify_date: null },
        };
      }
      if (newMode) {
        await post('/api/rules', payload);
        setNewMode(false);
        setTopic('');
        setSelected(draft.rule_id);
        setBanner({ tone: 'ok', text: `${draft.rule_id} created. Only you can see it until you send it for approval.` });
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
      const detailText = err.findings?.map((f) => f.message).join(' · ');
      setBanner({ tone: 'err', text: detailText ? `${err.message}: ${detailText}` : err.message });
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
      setBanner({ tone: 'ok', text: `Sent for approval. ${draft.rule_id} is now in the Approvals queue.` });
      await loadDetail(draft.rule_id);
      onMutate();
    } catch (e) {
      const err = e as ApiError;
      setServerFindings(err.findings ?? []);
      const detailText = err.findings?.map((f) => f.message).join(' · ');
      setBanner({ tone: 'err', text: detailText ? `${err.message}: ${detailText}` : err.message });
    }
  };

  const startNew = () => {
    setNewMode(true);
    setTopic('');
    setDetail(null);
    setOpenVersion(null);
    setBaseline(null);
    setDraft({ ...EMPTY, kind: 'regulatory' });
    setServerFindings([]);
    setBanner(null);
  };

  const ruleStatus = newMode ? 'draft' : (openVersion?.review_state ?? detail?.rule?.status ?? 'active');
  const provenance = openVersion ?? detail?.versions?.at(-1);
  const compatible = regimesFor(draft.jurisdiction_tags, meta);
  const orphaned = draft.regime && !compatible.some((r) => r.code === draft.regime);

  const ch = (k: keyof DraftState) => (baseline ? String(draft[k] ?? '') !== String(baseline[k] ?? '') : false);

  return (
    <>
      <div className="ws-head">
        <div className="crumb" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Write rules</span>
          <span className="sep">/</span>
          <select
            className="fc-input"
            data-tour="rule-picker"
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
                {r.rule_id} · {KIND_LABEL[r.kind] ?? r.kind}
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
              title={!canAuthor ? `Rules are written by the legal specialists; switch who you are working as, top right` : undefined}
              style={!canAuthor ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
              onClick={() => canAuthor && startNew()}
            >
              New rule
            </Button>
          </span>
        </div>
        <div className="ws-title-row">
          <Rid size="lg">{newMode ? draft.rule_id || 'reference appears as you type' : selected}</Rid>
          <Status state={ruleStatus} />
          {openVersion && (
            <span style={{ font: '500 11.5px/1 var(--font-mono)', color: 'var(--text-3)' }}>
              editing v{openVersion.semver_at_author}
            </span>
          )}
          <h1 style={{ width: '100%', marginTop: 8 }}>{draft.title || 'Untitled rule'}</h1>
        </div>
        <p className="ws-intro">
          <span className="hl">{newMode ? 'Write the rule, then send it for approval.' : 'Revise the rule, then send it for approval.'}</span>{' '}
          Write the substance on the left. The panel on the right flags anything an approver would send back, and shows exactly what changed against the version on file.
        </p>
        <div className="submeta" style={{ marginTop: 14 }}>
          <span>
            Regulation <b>{draft.regime || '—'}</b>
          </span>
          <span style={{ color: 'var(--border-strong)' }}>·</span>
          <span>
            Applies in <b>{draft.jurisdiction_tags.join(', ') || '—'}</b>
          </span>
          <span style={{ color: 'var(--border-strong)' }}>·</span>
          <span>
            Type <b>{KIND_LABEL[draft.kind] ?? draft.kind}</b>
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
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setBanner(null);
            }}
            style={{ marginLeft: 'auto', textDecoration: 'underline', color: 'inherit' }}
          >
            Dismiss
          </a>
        </div>
      )}

      <div className="editor">
        {/* LEFT — substance first, mechanics last */}
        <div className="pane pane-form" data-tour="form">
          <div className="form-intro">
            <div>
              <h3>{newMode ? 'New rule' : 'Edit rule'}</h3>
              <p>
                {editable
                  ? 'Write what the rule says, what it rests on, and when it applies.'
                  : inReview
                    ? 'This version is with its approver. It is frozen until approved or sent back.'
                    : canAuthor
                      ? 'No open draft. Open a new version to revise this rule.'
                      : 'Read-only for your role.'}
              </p>
            </div>
            {!newMode && !openVersion && canAuthor && detail?.rule?.status !== 'retired' && (
              <Button variant="secondary" size="sm" icon="edit" onClick={openNewVersion}>
                Open new version
              </Button>
            )}
          </div>

          {/* ── What the rule says ─────────────────────────── */}
          <SectionLabel first>What the rule says</SectionLabel>

          <Field label="Title">
            <input
              className="fc-input"
              value={draft.title}
              readOnly={!editable}
              placeholder="A short name, e.g. Mandatory contract terms"
              onChange={(e) => set('title', e.target.value)}
            />
          </Field>

          {draft.kind === 'regulatory' ? (
            <>
              <Field
                label="Statement"
                changed={ch('statement')}
                help="The one thing this rule says the law requires. One rule makes one point; if it makes two, split it."
              >
                <textarea
                  className={'fc-area' + (ch('statement') ? ' edited' : '')}
                  rows={7}
                  value={draft.statement}
                  readOnly={!editable}
                  onChange={(e) => set('statement', e.target.value)}
                />
              </Field>
              <Field
                label="Buyer reading"
                changed={ch('buyer_reading')}
                help="What this means in practice for the customer's compliance team when they are deciding whether to buy. Written from deal experience."
              >
                <textarea
                  className={'fc-area' + (ch('buyer_reading') ? ' edited' : '')}
                  rows={4}
                  value={draft.buyer_reading}
                  readOnly={!editable}
                  onChange={(e) => set('buyer_reading', e.target.value)}
                />
              </Field>

              {/* ── What it rests on ──────────────────────────── */}
              <SectionLabel>What it rests on</SectionLabel>

              <Field
                label="Authority"
                changed={ch('authority_summary')}
                help="The law or guidance this rests on, down to the exact article where you are sure. Never guessed."
              >
                <textarea
                  className={'fc-area fc-mono' + (ch('authority_summary') ? ' edited' : '')}
                  rows={2}
                  value={draft.authority_summary}
                  readOnly={!editable}
                  onChange={(e) => set('authority_summary', e.target.value)}
                />
              </Field>
              <Field
                label="Where to check it"
                help={
                  openVersion?.ai_assisted
                    ? 'The assistant drafted this, so you confirm the homework: open and read each source, then tick it. Nothing goes for approval until every source is ticked.'
                    : 'The documents an approver or an auditor would open to check this rule is right.'
                }
              >
                {draft.sources.map((s: any, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                    {openVersion?.ai_assisted && s.id && (
                      s.verified_by ? (
                        <span title={`Read and ticked ${s.verified_at?.slice(0, 10)}`} style={{ color: 'var(--ok)', display: 'inline-flex' }}>
                          <Icn name="checkCircle" size={15} />
                        </span>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={async () => {
                          try {
                            await post(`/api/rules/${draft.rule_id}/sources/${s.id}/verify`);
                            await loadDetail(draft.rule_id);
                          } catch (e) { setBanner({ tone: 'err', text: (e as Error).message }); }
                        }}>
                          Mark read
                        </Button>
                      )
                    )}
                    <input
                      className="fc-input fc-mono"
                      style={{ flex: 1 }}
                      value={s.citation}
                      readOnly={!editable}
                      placeholder="Citation"
                      onChange={(e) =>
                        set('sources', draft.sources.map((x, j) => (j === i ? { ...x, citation: e.target.value } : x)))
                      }
                    />
                    <select
                      className="fc-input"
                      style={{ width: 130 }}
                      value={s.source_type}
                      disabled={!editable}
                      onChange={(e) =>
                        set('sources', draft.sources.map((x, j) => (j === i ? { ...x, source_type: e.target.value } : x)))
                      }
                    >
                      {['statute', 'regulation', 'guidance', 'RTS', 'circular', 'executive_order', 'case', 'other'].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                    {editable && (
                      <span
                        style={{ cursor: 'pointer', color: 'var(--text-3)' }}
                        onClick={() => set('sources', draft.sources.filter((_, j) => j !== i))}
                      >
                        <Icn name="x" size={13} />
                      </span>
                    )}
                  </div>
                ))}
                {editable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="plus"
                    onClick={() => set('sources', [...draft.sources, { citation: '', source_type: 'guidance' }])}
                  >
                    Add source
                  </Button>
                )}
              </Field>

              {/* ── Where and when it applies ─────────────────── */}
              <SectionLabel>Where and when it applies</SectionLabel>

              <Field label="Where it applies" help="Places stack: EU covers every member country; adding a country or city layers local rules on top.">
                <TagChips
                  tags={draft.jurisdiction_tags}
                  meta={meta}
                  layered
                  addPrompt="Place code (e.g. EU, IE, US-NY):"
                  onAdd={(t) => editable && set('jurisdiction_tags', [...draft.jurisdiction_tags, t])}
                  onRemove={(t) => editable && set('jurisdiction_tags', draft.jurisdiction_tags.filter((x) => x !== t))}
                />
              </Field>

              <Field
                label="Regulation"
                help={
                  draft.jurisdiction_tags.length
                    ? `Only regulations that apply in ${draft.jurisdiction_tags.join(', ')} are offered.`
                    : 'All regulations; the list narrows once you set where the rule applies.'
                }
              >
                <select className="fc-input" value={draft.regime} disabled={!editable} onChange={(e) => set('regime', e.target.value)}>
                  {orphaned && <option value={draft.regime}>{draft.regime} (does not apply in these places)</option>}
                  {compatible.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.code}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Applicability"
                changed={ch('applicability')}
                help="When this rule kicks in for a given prospect."
              >
                <textarea
                  className={'fc-area' + (ch('applicability') ? ' edited' : '')}
                  rows={3}
                  value={draft.applicability}
                  readOnly={!editable}
                  onChange={(e) => set('applicability', e.target.value)}
                />
              </Field>

              <Field
                label="What we must know about the prospect"
                help="If any of these are unknown, the sales engine will not use this rule; it says what is missing instead of guessing."
              >
                <TagChips
                  tags={draft.inputs_required}
                  meta={meta}
                  addPrompt={`Fact about the prospect (one of: ${meta?.prospect_fields.join(', ') ?? ''})`}
                  onAdd={(t) => editable && set('inputs_required', [...draft.inputs_required, t])}
                  onRemove={(t) => editable && set('inputs_required', draft.inputs_required.filter((x) => x !== t))}
                />
              </Field>

              {/* ── Lifecycle ─────────────────────────────────── */}
              <SectionLabel>Keeping it current</SectionLabel>

              <Field
                label="Upcoming change"
                help="A change you already know is coming: a start date, a bill going through, an amendment not yet in force. Saving this puts the rule on the watchlist."
              >
                <textarea
                  className="fc-area"
                  rows={2}
                  value={draft.movement_note}
                  readOnly={!editable}
                  onChange={(e) => set('movement_note', e.target.value)}
                />
              </Field>
            </>
          ) : (
            <>
              {Object.keys(KIND_FIELD_LABELS)
                .filter((k) => draft.kind_fields[k] !== undefined && draft.kind_fields[k] !== null)
                .map((k) => (
                  <Field key={k} label={KIND_FIELD_LABELS[k]}>
                    <textarea
                      className="fc-area"
                      rows={5}
                      value={draft.kind_fields[k] ?? ''}
                      readOnly={!editable}
                      onChange={(e) => set('kind_fields', { ...draft.kind_fields, [k]: e.target.value })}
                    />
                  </Field>
                ))}
              <SectionLabel>Keeping it current</SectionLabel>
            </>
          )}

          <Field label="Why this change" help="One line on why this version exists. It stays with the rule's history forever.">
            <textarea
              className="fc-area"
              rows={2}
              value={draft.change_note}
              readOnly={!editable}
              onChange={(e) => set('change_note', e.target.value)}
            />
          </Field>

          {newMode && (
            <>
              <SectionLabel>Reference number</SectionLabel>
              <Field
                label="Topic code"
                help="Two to six letters naming the topic, e.g. CON for contracts, OUT for outsourcing. The reference number writes itself from the regulation, the place and your topic."
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    className="fc-input fc-mono"
                    style={{ width: 120 }}
                    value={topic}
                    maxLength={6}
                    placeholder="e.g. CON"
                    onChange={(e) => setTopic(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  />
                  <span style={{ font: '500 12px/1 var(--font-mono)', color: draft.rule_id ? 'var(--text-1)' : 'var(--text-4)' }}>
                    {draft.rule_id ? `→ will be filed as ${draft.rule_id}` : 'the reference appears here'}
                  </span>
                </div>
              </Field>
            </>
          )}

          {provenance && !newMode && (
            <div className="field" style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 22 }}>
              <div className="field-head">
                <label>History</label>
              </div>
              <div className="prov">
                <div className="pv">
                  <span className="k">Author</span>
                  <span className="v">{provenance.author_name ?? '—'}</span>
                </div>
                <div className="pv">
                  <span className="k">Reviewer</span>
                  <span className="v" style={{ color: 'var(--text-3)' }}>
                    {provenance.reviewer_name ?? 'Unassigned'}
                  </span>
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
                <div
                  style={{
                    marginTop: 14,
                    padding: '10px 12px',
                    background: 'var(--warn-50)',
                    border: '1px solid var(--warn-100)',
                    borderRadius: 'var(--r-md)',
                    font: '400 12.5px/1.55 var(--font-sans)',
                    color: 'var(--text-2)',
                  }}
                >
                  <span style={{ color: 'var(--warn-text)', fontWeight: 500 }}>Sent back with notes · </span>
                  {provenance.review_notes}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT — review (gate first), then changes */}
        <div className="pane pane-side">
          <div className="side-intro">
            <h3>Checks</h3>
            <p>Run as you type. Clear the flags, then send it for approval.</p>
          </div>
          <div data-tour="review-panel">
            <ReviewPanel items={lint} serverFindings={serverFindings} onResolve={resolve} onOverride={override} />
          </div>
          <ChangesPanel draft={draft} baseline={baseline} />
          {canAuthor && (
            <AssistPanel
              draft={draft}
              newMode={newMode}
              onPrefill={(prefill) => {
                setDraft((d) => ({ ...d, ...prefill, kind_fields: { ...d.kind_fields, ...(prefill.kind_fields ?? {}) } }));
                setBanner({ tone: 'ok', text: 'Assistant draft loaded. Read and tick each source; the rule cannot go for approval until you have.' });
              }}
            />
          )}
        </div>
      </div>

      {/* action bar */}
      <div className="ws-actions" data-tour="actions">
        <span className="gate">
          <Icn name={blocks ? 'alertCircle' : 'checkCircle'} size={16} color={blocks ? 'var(--block)' : 'var(--ok)'} />
          {!canAuthor ? (
            <span>
              Rules are written and approved by the legal specialists — switch who you are working as, top right
            </span>
          ) : newMode ? (
            <span>
              <b>New rule.</b> Save the draft first; you send it for approval from there.
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
              <b>All clear.</b> Ready to send for approval.
            </span>
          )}
        </span>
        <span className="spacer" />
        <Button variant="secondary" icon="download" disabled={!editable || saving || (newMode && !draft.rule_id)} onClick={saveDraft}>
          {newMode ? 'Create draft' : 'Save draft'}
        </Button>
        <Button
          variant="primary"
          icon="send"
          disabled={newMode || !editable || blocks > 0}
          onClick={submit}
          style={newMode || !editable || blocks > 0 ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
        >
          Send for approval
        </Button>
      </div>
    </>
  );
}
