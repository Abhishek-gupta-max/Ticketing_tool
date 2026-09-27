import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { UIProvider } from '../context/UIContext';

export const ADMIN = {
  id: 1, name: 'Service Desk Admin', email: 'admin@example.com', role: 'Admin', isStaff: true, personId: null, primaryTeamId: 1, teams: [],
  permissions: ['dashboard:view', 'ticket:view', 'ticket:view_all', 'ticket:create', 'ticket:update', 'ticket:assign', 'ticket:close', 'ticket:comment', 'ticket:note', 'ticket:export',
    'settings:manage', 'attachment:upload', 'attachment:delete', 'problem:create', 'problem:update', 'change:create', 'task:create', 'task:update', 'major:declare', 'request:approve'],
};

export const META = {
  organisation: { name: 'Veltrixsecure', timezone: 'Asia/Kolkata' },
  priorities: [1, 2, 3, 4].map((id) => ({ id, name: ['', 'Critical', 'High', 'Medium', 'Low'][id], responseMinutes: 60, resolutionMinutes: 480 })),
  categories: [{ id: 1, name: 'Software and apps', teamId: 1 }, { id: 2, name: 'Network and VPN', teamId: 1 }],
  kbCategories: [{ id: 1, name: 'Software and apps' }],
  channels: ['Portal', 'Email'], statuses: ['New', 'In Progress', 'On Hold', 'Awaiting approval', 'Resolved', 'Closed'],
  impactLabels: ['', 'High', 'Medium', 'Low'], urgencyLabels: ['', 'High', 'Medium', 'Low'], priorityMatrix: [[1, 2, 3], [2, 3, 4], [3, 4, 4]],
  attachments: { maxBytes: 5242880, maxFiles: 10, blocked: ['exe'], allowed: ['txt', 'png', 'log'] },
  customers: [{ id: 7, name: 'Kestrel Bank', isInternal: false }], agents: [{ id: 1, name: 'Service Desk Admin', role: 'Admin', teamIds: [1], primaryTeamId: 1 }],
  teams: [{ id: 1, code: 'sd', name: 'Service desk', type: 'Support', isActive: true }], holdReasons: ['Waiting for requester'], resolutionCodes: ['Fixed'],
  canned: [], assetTypes: [], criticalities: [], assetStatuses: [], taskTypes: [], problemSteps: [], changeCloseCodes: [], problemCodes: [], environments: [], departments: [], timezones: [],
};

// Like App.jsx: wait until the session check has finished before rendering pages.
function AuthGate({ children }) {
  const { status } = useAuth();
  return status === 'loading' ? null : children;
}

/** Render a route with every app provider. */
export function renderRoute(element, { path = '/', url = path } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <UIProvider>
                <AuthGate>
                <Routes>
                  <Route path={path} element={element} />
                  <Route path="/login" element={<div>login page</div>} />
                  <Route path="/tickets/:number" element={<div>ticket page</div>} />
                  <Route path="*" element={<div>other page</div>} />
                </Routes>
                </AuthGate>
              </UIProvider>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export function ticket(overrides = {}) {
  return {
    id: 1, number: 'INC-2026-0001', kind: 'incident', title: 'VPN drops after sleep', description: 'It drops', status: 'In Progress', priority: 3, priorityName: 'Medium',
    impact: 2, urgency: 2, holdReason: null, isMajor: false, channel: 'Portal', category: { id: 2, name: 'Network and VPN' }, team: { id: 1, name: 'Service desk' },
    customer: { id: 7, name: 'Kestrel Bank', isInternal: false }, requester: { id: 3, name: 'Ava Shah', email: 'ava@example.com', vip: true }, assignee: { id: 1, name: 'Service Desk Admin' },
    sla: { state: 'ok', label: 'Due in 3h 0m', responseDueAt: new Date(Date.now() + 3600e3).toISOString(), resolutionDueAt: new Date(Date.now() + 3 * 3600e3).toISOString(), pausedAt: null, pausedSeconds: 0, policyResolutionMinutes: 1440 },
    firstResponseAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
