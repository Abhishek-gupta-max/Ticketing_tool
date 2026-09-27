import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import ProtectedRoute from './routes/ProtectedRoute';
import { UIProvider } from './context/UIContext';
import { useAuth } from './context/AuthContext';
import { LoadingSpinner } from './components/common/Feedback';
import Login from './pages/Auth/Login';
import { ForgotPassword, ResetPassword } from './pages/Auth/PasswordReset';

// Every page is code-split and loaded on first visit.
const Overview = lazy(() => import('./pages/Dashboard/Overview'));
const TicketList = lazy(() => import('./pages/Tickets/TicketList'));
const TicketDetails = lazy(() => import('./pages/Tickets/TicketDetails'));
const Incidents = lazy(() => import('./pages/Incidents/Incidents'));
const TaskList = lazy(() => import('./pages/Tasks/TaskList'));
const TaskDetails = lazy(() => import('./pages/Tasks/TaskDetails'));
const RequestsPage = lazy(() => import('./pages/Requests/RequestsPage'));
const RequestDetails = lazy(() => import('./pages/Requests/RequestDetails'));
const ProblemList = lazy(() => import('./pages/Problems/ProblemList'));
const ProblemDetails = lazy(() => import('./pages/Problems/ProblemDetails'));
const ChangeList = lazy(() => import('./pages/Changes/ChangeList'));
const ChangeDetails = lazy(() => import('./pages/Changes/ChangeDetails'));
const Approvals = lazy(() => import('./pages/Approvals/Approvals'));
const Reports = lazy(() => import('./pages/Reports/Reports'));
const AssetList = lazy(() => import('./pages/Assets/AssetList'));
const AssetDetails = lazy(() => import('./pages/Assets/AssetDetails'));
const KbList = lazy(() => import('./pages/KnowledgeBase/KbList'));
const KbArticle = lazy(() => import('./pages/KnowledgeBase/KbArticle'));
const Settings = lazy(() => import('./pages/Settings/Settings'));

const TITLES = { overview: 'Overview', tickets: 'Tickets', incidents: 'Incidents', tasks: 'Tasks', requests: 'Service requests', problems: 'Problems', changes: 'Changes', approvals: 'Approvals', reports: 'Reports', assets: 'Assets', kb: 'Knowledge base', settings: 'Settings' };

function useDocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const [sec, id] = pathname.split('/').filter(Boolean);
    document.title = [id ? decodeURIComponent(id) : null, TITLES[sec], 'Veltrixsecure Service Desk'].filter(Boolean).join(' - ');
  }, [pathname]);
}

function Home() {
  const { can } = useAuth();
  return <Navigate to={can('dashboard:view') ? '/overview' : '/tickets'} replace />;
}

const guard = (el, permission) => <ProtectedRoute permission={permission}>{el}</ProtectedRoute>;

export default function App() {
  useDocumentTitle();
  const { status } = useAuth();
  if (status === 'loading') return <LoadingSpinner label="Loading" />;
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={guard(<UIProvider><AppShell /></UIProvider>)}>
          <Route index element={<Home />} />
          <Route path="overview" element={guard(<Overview />, 'dashboard:view')} />
          <Route path="tickets" element={guard(<TicketList />, 'ticket:view')} />
          <Route path="tickets/:number" element={guard(<TicketDetails />, 'ticket:view')} />
          <Route path="incidents" element={guard(<Incidents />, 'ticket:view_all')} />
          <Route path="tasks" element={guard(<TaskList />, 'task:view')} />
          <Route path="tasks/:number" element={guard(<TaskDetails />, 'task:view')} />
          <Route path="requests" element={guard(<RequestsPage />, 'request:view')} />
          <Route path="requests/:number" element={guard(<RequestDetails />, 'request:view')} />
          <Route path="problems" element={guard(<ProblemList />, 'problem:view')} />
          <Route path="problems/:number" element={guard(<ProblemDetails />, 'problem:view')} />
          <Route path="changes" element={guard(<ChangeList />, 'change:view')} />
          <Route path="changes/:number" element={guard(<ChangeDetails />, 'change:view')} />
          <Route path="approvals" element={guard(<Approvals />, 'approval:view')} />
          <Route path="reports" element={guard(<Reports />, 'report:view')} />
          <Route path="assets" element={guard(<AssetList />, 'asset:view')} />
          <Route path="assets/:tag" element={guard(<AssetDetails />, 'asset:view')} />
          <Route path="kb" element={guard(<KbList />, 'kb:view')} />
          <Route path="kb/:number" element={guard(<KbArticle />, 'kb:view')} />
          <Route path="settings" element={guard(<Settings />, 'settings:manage')} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
