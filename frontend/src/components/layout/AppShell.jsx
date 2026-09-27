import { Suspense, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import ErrorBoundary from '../common/ErrorBoundary';
import { PageSkeleton } from '../common/Feedback';
import { Tooltip } from '../charts/Charts';

export default function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  const main = useRef(null);

  useEffect(() => {
    setNavOpen(false);
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <>
      <button type="button" className="sr" onClick={() => main.current?.focus()}>Skip to content</button>
      <div className="app">
        <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
        <div className="wrap">
          <TopBar onMenu={() => setNavOpen(true)} />
          <main className="main" id="view" tabIndex={-1} ref={main}>
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<PageSkeleton />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>
      <div id="navScrim" className={navOpen ? 'on' : ''} onClick={() => setNavOpen(false)} />
      <Tooltip />
    </>
  );
}
