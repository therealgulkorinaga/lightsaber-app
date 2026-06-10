// Phase 2/3 surfaces: present in the rail per the design, honest about
// scope. Tables exist in the data model; the surfaces ship later.

import { Icn } from '../icons.tsx';
import { ScreenHead } from '../primitives.tsx';

export function Placeholder({
  title,
  intro,
  phase,
  items,
}: {
  title: string;
  intro: string;
  phase: string;
  items: string[];
}) {
  return (
    <div className="scr-scroll">
      <div className="scr scr-wide">
        <ScreenHead title={title} intro={<span>{intro}</span>} />
        <div className="card" style={{ padding: '26px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <Icn name="clock" size={18} color="var(--text-3)" />
            <span style={{ font: '600 13.5px/1.2 var(--font-sans)', color: 'var(--text-1)' }}>Ships in {phase}</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, font: '400 13px/1.9 var(--font-sans)', color: 'var(--text-2)' }}>
            {items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          <p style={{ marginTop: 16, font: '400 12px/1.6 var(--font-sans)', color: 'var(--text-3)' }}>
            The data model behind this surface is already migrated; the workflows arrive with their components.
          </p>
        </div>
      </div>
    </div>
  );
}
