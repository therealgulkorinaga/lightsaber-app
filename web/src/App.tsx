import { useState } from 'react';
import { Topbar, Rail, useChromeData } from './chrome.tsx';
import { Authoring } from './screens/Authoring.tsx';
import { Review } from './screens/Review.tsx';
import { Releases } from './screens/Releases.tsx';
import { Watch } from './screens/Watch.tsx';
import { Placeholder } from './screens/Placeholder.tsx';

export function App() {
  const [route, setRoute] = useState('authoring');
  const [refreshKey, setRefreshKey] = useState(0);
  const chrome = useChromeData(refreshKey);
  const bump = () => setRefreshKey((k) => k + 1);

  const screen = () => {
    switch (route) {
      case 'review':
        return <Review actor={chrome.actor} onMutate={bump} />;
      case 'watch':
        return <Watch />;
      case 'coverage':
        return (
          <Placeholder
            title="Coverage & Gap Ledger"
            intro="Where the seam is deep, where it is thin, and what it is costing. The matrix reads depth and freshness across jurisdictions and regimes; the backlog ranks the gaps live deals are abstaining on."
            phase="Phase 3 (Component D)"
            items={[
              'Gap ingestion from deployed skills, against the bounded abstraction schema (FR-D.1, FR-9.5)',
              'Analyst triage: duplicate, backlog, reject (FR-D.2)',
              'Backlog ranked by frequency and deal-cost (FR-D.3)',
              'Coverage measured per jurisdiction and regime (FR-D.4)',
            ]}
          />
        );
      case 'releases':
        return <Releases actor={chrome.actor} onMutate={bump} />;
      case 'tenants':
        return (
          <Placeholder
            title="Tenant Fleet"
            intro="Who is running what. Each adopter pins a seam version; claims are isolated behind row-level security and never cross tenants."
            phase="Phase 2 (Component F)"
            items={[
              'Provision tenants with RLS-scoped claims namespaces (FR-F.1)',
              'Author and approve tenant claims through Review (FR-F.3)',
              'Pin, deploy and upgrade against published seam versions (FR-F.4 to FR-F.6)',
              'Read-only client portal with coverage, freshness and audit pulls (FR-H.3)',
            ]}
          />
        );
      default:
        return <Authoring key={chrome.actor?.id ?? 'anon'} actor={chrome.actor} onMutate={bump} />;
    }
  };

  return (
    <div className="loom">
      <Topbar data={chrome} onUserChange={bump} />
      <Rail route={route} onRoute={setRoute} data={chrome} />
      <div className="lm-main">{screen()}</div>
    </div>
  );
}
