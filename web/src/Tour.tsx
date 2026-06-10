// The overlay guide: a spotlight tour of the whole journey, from authoring a
// rule through review, the gate, publish, deploy, the regime moving, and the
// loop closing. Steps navigate the real screens; targets are data-tour
// attributes. Practice roles get the full walk; a tenant admin gets the
// portal walk. Nothing here touches data.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './primitives.tsx';
import type { User } from './api.ts';

export interface TourStep {
  route: string;
  target?: string; // data-tour attribute; absent = centred card
  title: string;
  body: string;
}

const PRACTICE_TOUR: TourStep[] = [
  {
    route: 'authoring',
    title: 'Welcome to the back office',
    body:
      'This is where the rulebook is written and maintained: the regulatory rules, scoring signals, objection answers and messaging that every client\u2019s sales engine relies on. The database here is the single source of truth; what clients run is generated from it, exactly, on every release. This tour walks the whole journey. Esc leaves at any point.',
  },
  {
    route: 'authoring',
    target: 'user-switcher',
    title: 'Four people, one discipline',
    body:
      'R. Hale writes rules. A. Okafor is the second pair of eyes; nothing goes live without an approver who did not write it. M. Brennan runs releases and clients. J. Park handles the running of things and can never approve a rule. Switch between them here as the tour mentions them.',
  },
  {
    route: 'authoring',
    target: 'seam-pill',
    title: 'The published rulebook',
    body:
      'The version clients can be running right now. Everything you are about to see funnels toward moving this number safely: two people and five automatic checks stand between a draft and this badge.',
  },
  {
    route: 'authoring',
    target: 'rule-picker',
    title: '01 \u00b7 Write rules',
    body:
      'Pick any rule to read or revise it, or start a new one. Reference numbers write themselves: give a short topic code and the system files the rule in the right place with the next number. You never have to invent one.',
  },
  {
    route: 'authoring',
    target: 'form',
    title: 'Substance first',
    body:
      'The form reads the way a lawyer works: what the rule says, what law it rests on, and where and when it applies. The place and the regulation keep each other honest \u2014 a UK-only regulation will not pair with an EU-only place.',
  },
  {
    route: 'authoring',
    target: 'review-panel',
    title: 'Checks run as you type',
    body:
      'Style problems, banned words, a missing legal source, an unknown place: each one raises a flag, and a flag blocks the rule from going for approval until it is fixed or kept with a reason that goes on the record. The same checks run again before anything ships, so nothing slips through.',
  },
  {
    route: 'authoring',
    target: 'assist',
    title: 'The assistant helps; people decide',
    body:
      'It can find sources for you to read, or shape your rough text into the form. For regulation rules it deliberately gives you sources without conclusions, so you reach the conclusion yourself. A suggestion without a source is thrown away before you ever see it. Anything you take from it cannot go for approval until you have opened and ticked every source as read.',
  },
  {
    route: 'authoring',
    target: 'actions',
    title: 'Save, then send',
    body:
      'Drafts are private to you until you send them. Sending an unchanged rule is refused \u2014 there would be nothing to approve. Once sent, the exact wording is frozen; the approval that follows is for those words and no others.',
  },
  {
    route: 'review',
    target: 'queue-card',
    title: '02 \u00b7 Approvals',
    body:
      'The second human. An approver reads each item and approves it or sends it back with notes; nobody can approve their own work, and the system enforces that even outside this screen. Client product facts queue here too. \u201cAsk the assistant\u201d gives the approver an advisory second read \u2014 is the legal source checkable, does the rule overclaim, has it drifted into giving legal advice \u2014 and records that the approver saw it.',
  },
  {
    route: 'releases',
    target: 'publish-bar',
    title: '05 \u00b7 Releases',
    body:
      'A draft release gathers everything approved since the last one. Five checks must all pass before it can go out, and there is genuinely no way to publish a failing release \u2014 the block is built into the system, not this button. On day one it caught a real defect in the shipped rulebook: a test still referred to a rule that had been retired.',
  },
  {
    route: 'releases',
    target: 'gate-checks',
    title: 'Every check, every case',
    body:
      'Open a check to see the individual cases. The test scenarios are written by people only; the assistant has no way to write or change them, so a drafted rule can never bend the test meant to catch it.',
  },
  {
    route: 'releases',
    target: 'changelog',
    title: 'What a release says about itself',
    body:
      'Added, changed, marked out of date, rewritten, retired \u2014 by reference. Once published, a release is locked for good and can be reproduced exactly, forever. When a document cites a release, an audit reads those locked words, never the current ones.',
  },
  {
    route: 'tenants',
    target: 'fleet',
    title: '06 \u00b7 Clients',
    body:
      'Each client runs a fixed version of the rulebook. You can see at a glance who is up to date, who has an upgrade waiting, and whose running rules have been overtaken by a change in the law. Each client\u2019s product facts live in their own sealed space.',
  },
  {
    route: 'tenants',
    target: 'tenant-detail',
    title: 'Product facts, deliveries, upgrades',
    body:
      'A product fact is one checkable sentence with evidence, approved like everything else. A delivery packages the rulebook with exactly this client\u2019s facts \u2014 never anyone else\u2019s, checked on every delivery \u2014 plus an access key their installation uses, which can do precisely one thing: report questions it could not answer. Upgrades show what changed before anyone commits.',
  },
  {
    route: 'watch',
    target: 'watch-list',
    title: '03 \u00b7 Watchlist',
    body:
      'Where we track the law changing. Each alert ties an expected change \u2014 a start date, a bill in passage \u2014 to the rules that depend on it. Mark a change as happened, or let the date checks catch it.',
  },
  {
    route: 'watch',
    target: 'watch-detail',
    title: 'One change, handled end to end',
    body:
      'When a change happens, everything follows in one step: the affected rules are marked out of date, a rewrite task opens for each, the response clocks start for every affected client, and this report names exactly who and what is touched \u2014 including past documents that relied on those rules. Approving the rewrite closes the task; publishing carries the fix to everyone.',
  },
  {
    route: 'coverage',
    target: 'matrix',
    title: '04 \u00b7 Coverage',
    body:
      'How many rules cover each place and regulation, how fresh they are, and where the blanks are. A dash means that regulation simply does not apply there.',
  },
  {
    route: 'coverage',
    target: 'backlog',
    title: 'Built from real deals',
    body:
      'Whenever a client\u2019s sales engine has to say \u201cnot covered\u201d in a live deal, the question lands here automatically \u2014 stripped of anything identifying, by design. They are sorted, ranked by how often they come up times the deal value at risk, and close on their own when the covering rule ships.',
  },
  {
    route: 'coverage',
    target: 'critic',
    title: 'The checker flags; people fix',
    body:
      'It looks for rules that contradict each other, references to rules that no longer exist, and places where coverage is lopsided. It writes nothing itself, and every flag you wave away keeps the reason you gave.',
  },
  {
    route: 'authoring',
    target: 'search',
    title: 'And the rest',
    body:
      '\u2318K finds any rule from anywhere. Evidence reports reconstruct exactly which rules and legal sources a past document rested on, as they stood at the time \u2014 and say whether each rule was written by a person or accepted from an assistant draft. Switch to D. Osei to see what a client sees. That is the whole loop: write, approve, check, publish, deliver, watch the law, rewrite.',
  },
];

const PORTAL_TOUR: TourStep[] = [
  {
    route: 'portal',
    title: 'Your rulebook',
    body:
      'This page is your whole view: the rulebook version your sales engine runs, whether anything in it has gone out of date, the facts it may state about your product, and the audit trail. Your product facts are yours alone.',
  },
  {
    route: 'portal',
    target: 'portal-claims',
    title: 'The only source of facts about you',
    body:
      'Your sales engine may state a capability, a certificate or a number only if it is approved here, with evidence and a second pair of eyes. While this list is empty it says nothing about your product at all \u2014 honest by default.',
  },
  {
    route: 'portal',
    target: 'portal-defensibility',
    title: 'Evidence on demand',
    body:
      'Give a document reference and the rules it cited; the report reconstructs the exact rule wording and legal sources that were in force in your version at the time, even after the rules have since moved. Mark a report as tied to a closed deal and it counts toward the success line.',
  },
  {
    route: 'portal',
    target: 'portal-gaps',
    title: 'Questions it could not answer',
    body:
      'Every time your engine has to say \u201cnot covered\u201d in a live deal, the question appears here \u2014 with nothing identifying the prospect \u2014 and feeds the practice\u2019s writing backlog. Gaps close when the covering rule reaches you.',
  },
];

export function tourFor(actor: User | null): TourStep[] {
  return actor?.role === 'tenant_admin' ? PORTAL_TOUR : PRACTICE_TOUR;
}

const DONE_KEY = 'lsb_tour_done';
export const tourSeen = () => localStorage.getItem(DONE_KEY) === '1';
export const markTourSeen = () => localStorage.setItem(DONE_KEY, '1');

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function Tour({
  steps,
  step,
  onStep,
  onClose,
  setRoute,
}: {
  steps: TourStep[];
  step: number;
  onStep: (n: number) => void;
  onClose: () => void;
  setRoute: (r: string) => void;
}) {
  const s = steps[step];
  const [rect, setRect] = useState<Rect | null>(null);
  const tries = useRef(0);

  const finish = useCallback(() => {
    markTourSeen();
    onClose();
  }, [onClose]);

  // Navigate, then find the target; screens load data, so retry briefly.
  useEffect(() => {
    setRoute(s.route);
    setRect(null);
    tries.current = 0;
    if (!s.target) return;
    let cancelled = false;
    const look = () => {
      if (cancelled) return;
      const el = document.querySelector(`[data-tour="${s.target}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 || r.height > 0) {
          el.scrollIntoView({ block: 'nearest' });
          const r2 = el.getBoundingClientRect();
          setRect({ top: r2.top, left: r2.left, width: r2.width, height: r2.height });
          return;
        }
      }
      if (tries.current++ < 40) setTimeout(look, 100); // up to ~4s for data to land
    };
    look();
    return () => {
      cancelled = true;
    };
  }, [step, s.route, s.target, setRoute]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight' && step < steps.length - 1) onStep(step + 1);
      if (e.key === 'ArrowLeft' && step > 0) onStep(step - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, steps.length, onStep, finish]);

  const pad = 8;
  const spot = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  // Card placement: below the spotlight when there is room, else above; centred when no target.
  const cardW = 420;
  let cardStyle: React.CSSProperties;
  if (spot) {
    const below = spot.top + spot.height + 16;
    const fitsBelow = below + 220 < window.innerHeight;
    cardStyle = {
      position: 'fixed',
      top: fitsBelow ? below : undefined,
      bottom: fitsBelow ? undefined : window.innerHeight - spot.top + 16,
      left: Math.max(16, Math.min(spot.left, window.innerWidth - cardW - 16)),
      width: cardW,
    };
  } else {
    cardStyle = { position: 'fixed', top: '24vh', left: '50%', transform: 'translateX(-50%)', width: 480 };
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      {/* Backdrop: a dim wash, with a hole over the target when there is one. */}
      {spot ? (
        <div
          style={{
            position: 'fixed',
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            borderRadius: 10,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.45)',
            border: '1.5px solid var(--accent, #6366F1)',
            pointerEvents: 'none',
            transition: 'all 200ms ease',
          }}
        />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)' }} onClick={finish} />
      )}

      <div
        style={{
          ...cardStyle,
          background: 'var(--white, #fff)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 24px 64px rgba(15,23,42,0.3)',
          padding: '18px 20px',
          zIndex: 201,
        }}
      >
        <div style={{ font: '600 10.5px/1 var(--font-sans)', letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent-700, #4F46E5)', marginBottom: 8 }}>
          Step {step + 1} of {steps.length}
        </div>
        <div style={{ font: '600 15px/1.3 var(--font-sans)', color: 'var(--text-1)', marginBottom: 8 }}>{s.title}</div>
        <div style={{ font: '400 12.5px/1.65 var(--font-sans)', color: 'var(--text-2)', marginBottom: 14 }}>{s.body}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={finish}>
            {step === steps.length - 1 ? 'Close' : 'Skip tour'}
          </Button>
          <span style={{ flex: 1 }} />
          {step > 0 && (
            <Button variant="secondary" size="sm" onClick={() => onStep(step - 1)}>
              Back
            </Button>
          )}
          {step < steps.length - 1 ? (
            <Button variant="primary" size="sm" iconRight="arrowRight" onClick={() => onStep(step + 1)}>
              Next
            </Button>
          ) : (
            <Button variant="primary" size="sm" icon="check" onClick={finish}>
              Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
