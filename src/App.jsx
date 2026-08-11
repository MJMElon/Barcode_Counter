import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import Dashboard from './components/Dashboard.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { useLang } from './context/LanguageContext.jsx';
import { canScan } from './lib/access.js';

// Heavy modules (camera scanner, PDF generation, Supabase queries) are loaded
// on demand so the initial app shell stays small.
const ScanModule = lazy(() => import('./modules/scan/ScanModule.jsx'));
const DoModule = lazy(() => import('./modules/do/DoModule.jsx'));
const PlotStatusModule = lazy(() => import('./modules/plotstatus/PlotStatusModule.jsx'));
const MaintenanceModule = lazy(() => import('./modules/maintenance/MaintenanceModule.jsx'));

function Loading() {
  const { t } = useLang();
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050a0e]">
      <div className="text-emerald-400 font-mono text-xs uppercase tracking-[0.3em] animate-pulse">
        {t('common.loading')}
      </div>
    </div>
  );
}

// Gate for the authenticated area. Bounces to the login screen if there is no
// session or the ops-access check failed.
function Protected({ children }) {
  const { session, loading, allowed } = useAuth();
  if (loading) return <Loading />;
  if (!session || allowed === false) return <Navigate to="/" replace />;
  return children;
}

// Gate for a single module. The dashboard already hides the card, but the URL
// is still typeable and bookmarks outlive permissions, so the route has to
// refuse too. Waits for permissions to arrive rather than bouncing someone out
// of a page they are allowed to open.
function PageGate({ page, children }) {
  const { permissions } = useAuth();
  if (permissions === null) return <Loading />;
  if (!canScan(permissions, page, 'view')) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { session, loading, allowed } = useAuth();

  return (
    <Routes>
      <Route
        path="/"
        element={
          loading ? (
            <Loading />
          ) : // `allowed` is null until the ops gate answers. Waiting for it
          // here would show the login screen to somebody already signed in,
          // so only a definite NO keeps them on it.
          session && allowed !== false ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <AuthScreen />
          )
        }
      />
      <Route
        path="/dashboard"
        element={
          <Protected>
            <Dashboard />
          </Protected>
        }
      />
      <Route
        path="/scan"
        element={
          <Protected>
            <ErrorBoundary>
              <Suspense fallback={<Loading />}>
                <ScanModule />
              </Suspense>
            </ErrorBoundary>
          </Protected>
        }
      />
      <Route
        path="/do"
        element={
          <Protected>
            <ErrorBoundary>
              <Suspense fallback={<Loading />}>
                <DoModule />
              </Suspense>
            </ErrorBoundary>
          </Protected>
        }
      />
      <Route
        path="/plot-status"
        element={
          <Protected>
            <PageGate page="plot_status">
              <ErrorBoundary>
                <Suspense fallback={<Loading />}>
                  <PlotStatusModule />
                </Suspense>
              </ErrorBoundary>
            </PageGate>
          </Protected>
        }
      />
      <Route
        path="/maintenance"
        element={
          <Protected>
            <PageGate page="maintenance">
              <ErrorBoundary>
                <Suspense fallback={<Loading />}>
                  <MaintenanceModule />
                </Suspense>
              </ErrorBoundary>
            </PageGate>
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
