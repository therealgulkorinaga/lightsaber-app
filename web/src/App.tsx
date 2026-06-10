import { useEffect, useState } from 'react';
import { Topbar, Rail, useChromeData } from './chrome.tsx';
import { Search } from './Search.tsx';
import { Authoring } from './screens/Authoring.tsx';
import { Review } from './screens/Review.tsx';
import { Releases } from './screens/Releases.tsx';
import { Watch } from './screens/Watch.tsx';
import { Coverage } from './screens/Coverage.tsx';
import { Tenants } from './screens/Tenants.tsx';
import { Portal } from './screens/Portal.tsx';

export function App() {
  const [route, setRoute] = useState('authoring');
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [jumpRule, setJumpRule] = useState<string | null>(null);
  const chrome = useChromeData(refreshKey);
  const bump = () => setRefreshKey((k) => k + 1);

  // Tenant admins land in, and stay in, the portal.
  useEffect(() => {
    if (chrome.actor?.role === 'tenant_admin') setRoute('portal');
    else if (route === 'portal') setRoute('authoring');
  }, [chrome.actor?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const screen = () => {
    switch (route) {
      case 'portal':
        return <Portal actor={chrome.actor} onMutate={bump} />;
      case 'review':
        return <Review actor={chrome.actor} onMutate={bump} />;
      case 'watch':
        return <Watch actor={chrome.actor} onMutate={bump} />;
      case 'coverage':
        return <Coverage actor={chrome.actor} onMutate={bump} />;
      case 'releases':
        return <Releases actor={chrome.actor} onMutate={bump} />;
      case 'tenants':
        return <Tenants actor={chrome.actor} onMutate={bump} />;
      default:
        return (
          <Authoring
            key={chrome.actor?.id ?? 'anon'}
            actor={chrome.actor}
            onMutate={bump}
            jumpTo={jumpRule}
            onJumped={() => setJumpRule(null)}
          />
        );
    }
  };

  return (
    <div className="loom">
      <Topbar data={chrome} onUserChange={bump} onSearch={() => setSearchOpen(true)} />
      <Rail route={route} onRoute={setRoute} data={chrome} />
      <div className="lm-main">
        {chrome.actor ? (
          screen()
        ) : chrome.error ? (
          <div style={{ padding: 28, font: '400 13px/1.6 var(--font-sans)', color: 'var(--block-text, #B91C1C)' }}>
            <b>Cannot load.</b> {chrome.error}{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); bump(); }} style={{ color: 'inherit', textDecoration: 'underline' }}>
              Retry
            </a>
          </div>
        ) : (
          <div style={{ padding: 28, font: '400 13px/1.6 var(--font-sans)', color: 'var(--text-3)' }}>Signing in…</div>
        )}
      </div>
      <Search
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPick={(ruleId) => {
          setJumpRule(ruleId);
          setRoute('authoring');
        }}
      />
    </div>
  );
}
