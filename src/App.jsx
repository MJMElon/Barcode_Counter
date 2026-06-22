import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import Dashboard from './components/Dashboard.jsx';

// Heavy modules (camera scanner, PDF generation, Supabase queries) are loaded
// on demand so the initial app shell stays small.
const ScanModule = lazy(() => import('./modules/scan/ScanModule.jsx'));
const DoModule = lazy(() => import('./modules/do/DoModule.jsx'));

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050a0e]">
      <div className="text-emerald-400 font-mono text-xs uppercase tracking-[0.3em] animate-pulse">
        Loading…
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

export default function App() {
  const { session, loading, allowed } = useAuth();

  return (
    <Routes>
      <Route
        path="/"
        element={
          loading ? (
            <Loading />
          ) : session && allowed ? (
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
            <Suspense fallback={<Loading />}>
              <ScanModule />
            </Suspense>
          </Protected>
        }
      />
      <Route
        path="/do"
        element={
          <Protected>
            <Suspense fallback={<Loading />}>
              <DoModule />
            </Suspense>
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
