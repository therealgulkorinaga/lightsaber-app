// Shared atoms, ported from design/Primitives.jsx.

import type { ReactNode } from 'react';
import { Icn } from './icons.tsx';

export function Button({
  variant = 'secondary',
  size,
  icon,
  iconRight,
  children,
  ...rest
}: {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm';
  icon?: string;
  iconRight?: string;
  children?: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = ['btn', `btn-${variant}`, size && `btn-${size}`].filter(Boolean).join(' ');
  return (
    <button className={cls} {...rest}>
      {icon && <Icn name={icon} size={14} />}
      {children}
      {iconRight && <Icn name={iconRight} size={14} />}
    </button>
  );
}

export function Badge({
  tone = 'neutral',
  mono,
  children,
}: {
  tone?: string;
  mono?: boolean;
  children: ReactNode;
}) {
  const cls = ['badge', `badge-${tone}`, mono && 'badge-mono'].filter(Boolean).join(' ');
  return <span className={cls}>{children}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}

export function Avatar({ initials, variant }: { initials: string; variant?: string }) {
  const cls = ['avatar', variant && `avatar-${variant}`].filter(Boolean).join(' ');
  return (
    <span className={cls} style={{ width: 30, height: 30, fontSize: 11 }}>
      {initials}
    </span>
  );
}

// Rule-ID chip — stable monospace identity.
export function Rid({ children, size, ghost }: { children: ReactNode; size?: 'lg'; ghost?: boolean }) {
  const cls = ['rid', size === 'lg' && 'rid-lg', ghost && 'rid-ghost'].filter(Boolean).join(' ');
  return <span className={cls}>{children}</span>;
}

// Lifecycle status — colour and label by state, never size.
const STATUS_LABEL: Record<string, string> = {
  draft: 'draft',
  in_review: 'awaiting approval',
  returned: 'sent back',
  approved: 'approved',
  active: 'live',
  stale: 'out of date',
  retired: 'retired',
};

// Plain names for the rule types and release states the API uses.
export const KIND_LABEL: Record<string, string> = {
  regulatory: 'regulation',
  icp: 'fit scoring',
  objection: 'objection answer',
  messaging: 'messaging',
  claim: 'product fact',
};
export const RELEASE_STATUS_LABEL: Record<string, string> = {
  draft: 'in preparation',
  staged: 'ready for checks',
  eval_running: 'checks running',
  eval_passed: 'checks passed',
  eval_failed: 'checks failed',
  published: 'published',
  deprecated: 'superseded',
};

export function Status({ state }: { state: string }) {
  const cls = `status status-${state === 'returned' ? 'draft' : state}`;
  return (
    <span className={cls}>
      <span className="sd" />
      <span className="lbl">{STATUS_LABEL[state] ?? state}</span>
    </span>
  );
}

export function ScreenHead({ title, intro, children }: { title: string; intro?: ReactNode; children?: ReactNode }) {
  return (
    <div className="scr-head">
      <h1 className="scr-title">{title}</h1>
      {intro && <p className="scr-intro">{intro}</p>}
      {children && <div className="scr-stats">{children}</div>}
    </div>
  );
}

export function Stat({ n, label, tone }: { n: ReactNode; label: string; tone?: string }) {
  return (
    <div className={'stat' + (tone ? ' stat-' + tone : '')}>
      <div className="stat-n">{n}</div>
      <div className="stat-l">{label}</div>
    </div>
  );
}

export function CardHead({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="card-head">
      <div>
        <h3>{title}</h3>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {right}
    </div>
  );
}
