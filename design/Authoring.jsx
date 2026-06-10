// ──────────────────────────────────────────────────────────────
//  Loom · Screen 01 — Rule Authoring Workspace
//  Calm pass: schema form (left) + gate-first review with
//  inline diff (right). Fewer labels, more whitespace.
// ──────────────────────────────────────────────────────────────

const KINDS = ['regulatory', 'icp', 'objection', 'messaging', 'tenant-claim'];
const TEXT_KEYS = ['statement', 'buyer_reading', 'authority', 'applicability'];

// ── word-level diff (LCS) ─────────────────────────────────────
function tokenize(s) { return s.split(/(\s+)/); }
function wordDiff(a, b) {
  const A = tokenize(a || ''), B = tokenize(b || '');
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ t: 'same', s: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: 'del', s: A[i] }); i++; }
    else { out.push({ t: 'ins', s: B[j] }); j++; }
  }
  while (i < n) out.push({ t: 'del', s: A[i++] });
  while (j < m) out.push({ t: 'ins', s: B[j++] });
  return out;
}
// One calm block: unchanged text neutral, only the edits coloured.
function DiffInline({ parts }) {
  return (
    <span className="chg-text">
      {parts.map((p, i) =>
        p.t === 'del' ? <span key={i} className="di-del">{p.s}</span>
        : p.t === 'ins' ? <span key={i} className="di-ins">{p.s}</span>
        : <span key={i}>{p.s}</span>)}
    </span>
  );
}

// ── lint engine ───────────────────────────────────────────────
function fieldLabel(k) {
  return ({ statement: 'Statement', buyer_reading: 'Buyer reading', authority: 'Authority', applicability: 'Applicability' })[k] || k;
}
function computeLint(draft) {
  const { BANNED, JURIS, PROSPECT_FIELDS } = window.LOOM;
  const items = [];

  const emHits = TEXT_KEYS.filter(k => /—|\s--\s/.test(draft[k] || ''));
  if (emHits.length) {
    items.push({ level: 'block', key: 'emdash',
      title: 'Em-dash found', loc: fieldLabel(emHits[0]),
      desc: 'The seam voice allows no em-dashes. Auto-resolve swaps it for a comma.', fix: 'emdash' });
  }
  let bannedHit = null;
  for (const k of TEXT_KEYS) {
    for (const w of BANNED) {
      const re = new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      if (re.test(draft[k] || '')) { bannedHit = { field: k, word: w }; break; }
    }
    if (bannedHit) break;
  }
  if (bannedHit) {
    items.push({ level: 'block', key: 'banned',
      title: 'Kill-list word: \u201C' + bannedHit.word + '\u201D', loc: fieldLabel(bannedHit.field),
      desc: '\u201C' + bannedHit.word + '\u201D is on the voice kill-list. Auto-resolve rewrites it.', fix: 'banned' });
  }

  // structural checks (mostly passing)
  items.push({ level: 'pass', key: 'unique', title: 'Rule ID unique' });
  const badTags = (draft.jurisdiction || []).filter(t => !JURIS[t]);
  items.push(badTags.length
    ? { level: 'block', key: 'tags', title: 'Unknown jurisdiction tag', loc: 'Jurisdiction', desc: badTags.join(', ') + ' is not in the catalogue.' }
    : { level: 'pass', key: 'tags', title: 'Jurisdiction tags valid' });
  items.push((draft.authority || '').trim()
    ? { level: 'pass', key: 'auth', title: 'Authority present' }
    : { level: 'block', key: 'auth', title: 'Authority missing', loc: 'Authority', desc: 'Every regulatory rule must carry an authority.' });
  const badInputs = (draft.inputs || []).filter(f => !PROSPECT_FIELDS.includes(f));
  items.push(badInputs.length
    ? { level: 'block', key: 'inputs', title: 'Unknown input field', loc: 'Inputs', desc: badInputs.join(', ') + ' is not a prospect field.' }
    : { level: 'pass', key: 'inputs', title: 'Inputs mapped' });
  items.push((draft.buyer_reading || '').trim()
    ? { level: 'pass', key: 'buyer', title: 'Buyer reading set' }
    : { level: 'block', key: 'buyer', title: 'Buyer reading missing', loc: 'Buyer reading', desc: 'The selling read must be authored.' });
  items.push({ level: 'pass', key: 'unit', title: 'One assertable unit' });

  return items;
}

// ── form atoms ────────────────────────────────────────────────
function Field({ label, changed, help, children }) {
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

function JurisdictionField({ tags }) {
  const { JURIS } = window.LOOM;
  return (
    <Field label="Jurisdiction"
      help="Tags layer: EU covers every member state; member-state and city tags stack national rules on top.">
      <div className="jtags">
        {tags.map(t => (
          <span key={t} className={'jtag' + (JURIS[t] && !JURIS[t].parent ? ' parent' : '')}>
            <span>{t}</span>
            <span className="lvl">{JURIS[t] ? JURIS[t].layer : 'unknown'}</span>
            <span className="rm" title="remove"><Icn name="x" size={11} /></span>
          </span>
        ))}
        <button className="jtag-add" title="add tag"><Icn name="plus" size={13} /></button>
      </div>
      <div className="layer-res">
        <div className="lr-title">Resolves to</div>
        <div className="layer-tree">
          <div className="layer-node">
            <span className="glyph">EU</span>
            <span className="covers">Union layer · all EU financial entities</span>
            <span className="applies on">tagged</span>
          </div>
          <div className="layer-node child muted">
            <span className="glyph">IE</span>
            <span className="covers">national rules stack above for IE prospects</span>
            <span className="applies off">inherits</span>
          </div>
          <div className="layer-node child muted">
            <span className="glyph">DE</span>
            <span className="covers">national rules stack above for DE prospects</span>
            <span className="applies off">inherits</span>
          </div>
        </div>
      </div>
    </Field>
  );
}

function InputsField({ inputs }) {
  return (
    <Field label="Inputs required"
      help="Prospect fields the engine needs before applying the rule. Drives the coverage gate.">
      <div className="jtags">
        {inputs.map(f => (
          <span key={f} className="jtag">
            <span>{f}</span>
            <span className="rm" title="remove"><Icn name="x" size={11} /></span>
          </span>
        ))}
        <button className="jtag-add" title="add field"><Icn name="plus" size={13} /></button>
      </div>
    </Field>
  );
}

function Provenance() {
  const p = window.LOOM.PROVENANCE;
  return (
    <div className="field" style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 22 }}>
      <div className="field-head"><label>Provenance</label></div>
      <div className="prov">
        <div className="pv"><span className="k">Author</span><span className="v">{p.author} · <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>{p.author_role}</span></span></div>
        <div className="pv"><span className="k">Reviewer</span><span className="v" style={{ color: 'var(--text-3)' }}>{p.reviewer} <a href="#" onClick={e => e.preventDefault()} style={{ color: 'var(--brand)', marginLeft: 6, fontSize: 11 }}>assign</a></span></div>
        <div className="pv"><span className="k">Created</span><span className="v mono">{p.created}</span></div>
        <div className="pv"><span className="k">Last edited</span><span className="v mono">{p.edited}</span></div>
      </div>
      <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', font: '400 12.5px/1.55 var(--font-sans)', color: 'var(--text-2)' }}>
        <span style={{ color: 'var(--text-4)', fontWeight: 500 }}>Change note · </span>{p.change_note}
      </div>
    </div>
  );
}

// ── review panel (gate first) + changes ───────────────────────
function serial(v) { return Array.isArray(v) ? v.join('|') : v; }

function ReviewPanel({ items, onResolve }) {
  const issues = items.filter(i => i.level !== 'pass');
  const passed = items.filter(i => i.level === 'pass').length;
  const block = issues.filter(i => i.level === 'block').length;
  const ok = block === 0;
  return (
    <div className={'gate-card ' + (ok ? 'ok' : 'block')}>
      <div className="gate-head">
        <Icn name={ok ? 'checkCircle' : 'alertCircle'} size={18} />
        {ok ? 'Ready for review' : `${block} ${block === 1 ? 'thing' : 'things'} to fix before review`}
      </div>
      {issues.length > 0 && (
        <div className="gate-issues">
          {issues.map((it, i) => (
            <div key={i} className="gate-issue">
              <div className="gi-top">
                <Icn name="alertCircle" size={15} color="var(--block)" />
                <span className="gi-title">{it.title}</span>
                {it.loc && <span className="gi-where">{it.loc}</span>}
              </div>
              {it.desc && <p className="gi-desc">{it.desc}</p>}
              {it.fix && (
                <div className="gi-act">
                  <Button variant="secondary" size="sm" icon="refresh" onClick={() => onResolve(it.fix)}>Auto-resolve</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="gate-passed">
        <Icn name="check" size={14} color="var(--ok)" />
        <span><b>{passed} checks passed</b> — ID unique, authority present, tags valid, inputs mapped, buyer reading set</span>
      </div>
    </div>
  );
}

function ChangesPanel({ draft }) {
  const base = window.LOOM.BASELINE;
  const rows = [
    { key: 'statement', label: 'Statement' },
    { key: 'authority', label: 'Authority' },
    { key: 'buyer_reading', label: 'Buyer reading' },
    { key: 'applicability', label: 'Applicability' },
    { key: 'jurisdiction', label: 'Jurisdiction', join: true },
    { key: 'inputs', label: 'Inputs required', join: true },
  ];
  const changed = rows.filter(r => serial(draft[r.key]) !== serial(base[r.key]));
  const unchanged = rows.filter(r => serial(draft[r.key]) === serial(base[r.key]));
  return (
    <div className="changes">
      <div className="changes-head"><h3>What changed</h3><span className="vs">v1.1 vs active v1.0</span></div>
      {changed.length === 0 && (
        <div className="chg-unchanged" style={{ borderTop: 'none', paddingTop: 4 }}>No edits yet — change a field and it appears here.</div>
      )}
      {changed.map(r => (
        <div key={r.key} className="chg">
          <div className="chg-name">{r.label}</div>
          {r.join
            ? <div className="chg-text">{(base[r.key] || []).join(', ')} <span className="di-ins">{(draft[r.key] || []).join(', ')}</span></div>
            : <DiffInline parts={wordDiff(base[r.key], draft[r.key])} />}
        </div>
      ))}
      {unchanged.length > 0 && (
        <div className="chg-unchanged">{unchanged.map(u => u.label).join(' · ')} — unchanged</div>
      )}
    </div>
  );
}

// ── workspace ─────────────────────────────────────────────────
function Authoring() {
  const [draft, setDraft] = React.useState(() => Object.assign({}, window.LOOM.DRAFT));
  const [kind, setKind] = React.useState('regulatory');
  const [submitted, setSubmitted] = React.useState(false);
  const base = window.LOOM.BASELINE;

  const lint = computeLint(draft);
  const blocks = lint.filter(i => i.level === 'block').length;

  const set = (k, v) => setDraft(d => Object.assign({}, d, { [k]: v }));
  const reset = () => setDraft(Object.assign({}, window.LOOM.DRAFT));
  const resolve = (fix) => setDraft(d => {
    const n = Object.assign({}, d);
    if (fix === 'emdash') n.statement = n.statement.replace(/\s*—\s*/g, ', ').replace(/\s--\s/g, ', ');
    if (fix === 'banned') {
      const { BANNED } = window.LOOM;
      TEXT_KEYS.forEach(k => BANNED.forEach(w => {
        const re = new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        if (re.test(n[k])) n[k] = n[k].replace(re, 'material');
      }));
    }
    return n;
  });
  const edited = (k) => serial(draft[k]) !== serial(base[k]);

  return (
    <React.Fragment>
      {/* header */}
      <div className="ws-head">
        <div className="crumb">
          <span>Authoring</span><span className="sep">/</span>
          <span>Regulatory</span><span className="sep">/</span>
          <span>DORA</span><span className="sep">/</span>
          <span style={{ color: 'var(--text-1)' }}>DORA-CON-003</span>
        </div>
        <div className="ws-title-row">
          <Rid size="lg">DORA-CON-003</Rid>
          <Status state={submitted ? 'in_review' : 'draft'} />
          <span style={{ font: '500 11.5px/1 var(--font-mono)', color: 'var(--text-3)' }}>editing v1.1 · active on file v1.0</span>
          <h1 style={{ width: '100%', marginTop: 8 }}>Mandatory contractual provisions</h1>
        </div>
        <p className="ws-intro">
          <span className="hl">Revise this rule, then send it for review.</span> Edit the fields on the left.
          The review panel on the right flags anything that must be fixed and shows exactly what changed against the live version.
        </p>
        <div className="submeta" style={{ marginTop: 14 }}>
          <span>Regime <b>DORA</b></span>
          <span style={{ color: 'var(--border-strong)' }}>·</span>
          <span>Jurisdiction <b>EU</b></span>
          <span style={{ color: 'var(--border-strong)' }}>·</span>
          <span>Last edited <b>14:08 today</b></span>
        </div>
      </div>

      {submitted && (
        <div style={{ background: 'var(--accent-50)', borderBottom: '1px solid var(--accent-100)', padding: '12px 28px', display: 'flex', alignItems: 'center', gap: 12, font: '500 12.5px/1.4 var(--font-sans)', color: 'var(--accent-700)' }}>
          <Icn name="checkCircle" size={16} />
          Sent for review. DORA-CON-003 v1.1 is now in the review queue.
          <a href="#" onClick={e => { e.preventDefault(); setSubmitted(false); }} style={{ marginLeft: 'auto', color: 'var(--accent-700)', textDecoration: 'underline' }}>Undo</a>
        </div>
      )}

      {/* two-pane editor */}
      <div className="editor">
        {/* LEFT — schema form */}
        <div className="pane pane-form">
          <div className="form-intro">
            <div>
              <h3>Edit rule</h3>
              <p>Change any field. Edits are marked and mirrored in the review panel.</p>
            </div>
            <Button variant="ghost" size="sm" icon="refresh" onClick={reset}>Reset</Button>
          </div>

          <Field label="Rule ID" help="Stable and unique. Never reused — a superseded rule is retired and its replacement takes a new ID.">
            <input className="fc-input fc-mono" value={draft.rule_id} readOnly style={{ background: 'var(--slate-50)', color: 'var(--text-2)' }} />
          </Field>

          <Field label="Kind">
            <div className="seg">
              {KINDS.map(k => (
                <button key={k} data-on={kind === k || undefined} onClick={() => setKind(k)}>{k}</button>
              ))}
            </div>
          </Field>

          <div className="field">
            <div className="fc-row">
              <div>
                <div className="field-head"><label>Regime</label></div>
                <select className="fc-input" defaultValue="DORA">
                  {['DORA', 'EU_AI_ACT', 'GDPR', 'FCA', 'PRA', 'MiCA', 'cross_regime'].map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <div className="field-head"><label>Title</label></div>
                <input className="fc-input" value={draft.title} onChange={e => set('title', e.target.value)} />
              </div>
            </div>
          </div>

          <JurisdictionField tags={draft.jurisdiction} />

          <Field label="Statement" changed={edited('statement')}
            help="The single proposition the engine may assert. This is what grounds every cited claim.">
            <textarea className={'fc-area' + (edited('statement') ? ' edited' : '')} rows={7}
              value={draft.statement} onChange={e => set('statement', e.target.value)} />
          </Field>

          <Field label="Buyer reading" changed={edited('buyer_reading')}
            help="How a compliance buyer reads this in a deal. Where the selling value lives — kept separate from the Statement.">
            <textarea className={'fc-area' + (edited('buyer_reading') ? ' edited' : '')} rows={4}
              value={draft.buyer_reading} onChange={e => set('buyer_reading', e.target.value)} />
          </Field>

          <Field label="Authority" changed={edited('authority')}
            help="The instrument it rests on, at article level. Never invented.">
            <textarea className={'fc-area fc-mono' + (edited('authority') ? ' edited' : '')} rows={2}
              value={draft.authority} onChange={e => set('authority', e.target.value)} />
          </Field>

          <Field label="Applicability" changed={edited('applicability')}>
            <textarea className={'fc-area' + (edited('applicability') ? ' edited' : '')} rows={3}
              value={draft.applicability} onChange={e => set('applicability', e.target.value)} />
          </Field>

          <InputsField inputs={draft.inputs} />

          <Provenance />
        </div>

        {/* RIGHT — review (gate first), then changes */}
        <div className="pane pane-side">
          <div className="side-intro">
            <h3>Review</h3>
            <p>Runs as you type. Clear the flags, then submit.</p>
          </div>
          <ReviewPanel items={lint} onResolve={resolve} />
          <ChangesPanel draft={draft} />
        </div>
      </div>

      {/* action bar */}
      <div className="ws-actions">
        <span className="gate">
          <Icn name={blocks ? 'alertCircle' : 'checkCircle'} size={16} color={blocks ? 'var(--block)' : 'var(--ok)'} />
          {blocks
            ? <span><b>{blocks} {blocks === 1 ? 'flag' : 'flags'}</b> to clear first</span>
            : <span><b>All clear.</b> Ready to send for review.</span>}
        </span>
        <span className="spacer" />
        <Button variant="ghost" size="sm">Discard</Button>
        <Button variant="secondary" icon="download">Save draft</Button>
        <Button variant="primary" icon="send" disabled={blocks > 0 || submitted}
          onClick={() => setSubmitted(true)}
          style={blocks > 0 || submitted ? { opacity: 0.45, cursor: 'not-allowed' } : null}>
          Submit for review
        </Button>
      </div>
    </React.Fragment>
  );
}

window.Authoring = Authoring;
