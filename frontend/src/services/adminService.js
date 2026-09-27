import { get, post, put, patch, del, download } from './api';

export const metaService = { get: () => get('/meta').then((r) => r.data) };
export const dashboardService = { overview: () => get('/dashboard').then((r) => r.data) };

export const reportService = {
  summary: (params) => get('/reports/summary', params).then((r) => r.data),
  process: (params) => get('/reports/process', params).then((r) => r.data),
  exportCsv: (params) => download('/reports/export.csv', params, 'tickets-report.csv'),
  exportJson: (params) => download('/reports/summary.json', params, 'report-summary.json'),
  schedules: () => get('/reports/schedules').then((r) => r.data),
  addSchedule: (body) => post('/reports/schedules', body),
  removeSchedule: (id) => del(`/reports/schedules/${id}`),
};

export const settingsService = {
  get: () => get('/settings').then((r) => r.data),
  general: (body) => put('/settings/general', body),
  sla: (rows) => put('/settings/sla', { rows }),
  rule: (code, enabled) => put(`/settings/rules/${code}`, { enabled }),
  autoClose: (days) => put('/settings/auto-close', { days }),
  routing: (categoryId, teamId) => put('/settings/routing', { categoryId, teamId }),
  notifications: (body) => put('/settings/notifications', body),
  integration: (key, body) => put(`/settings/integrations/${key}`, body),
  rotateKey: () => post('/settings/integrations/webhook/rotate-key'),
  simulate: (key) => post(`/settings/integrations/${key}/simulate`),
  cab: (approvers) => put('/settings/cab-approvers', { approvers }),
  createCanned: (body) => post('/settings/canned', body),
  updateCanned: (id, body) => put(`/settings/canned/${id}`, body),
  deleteCanned: (id) => del(`/settings/canned/${id}`),
};

export const userService = {
  list: () => get('/users').then((r) => r.data),
  roles: () => get('/roles').then((r) => r.data),
  create: (body) => post('/users', body),
  update: (id, body) => put(`/users/${id}`, body),
  setActive: (id, active) => patch(`/users/${id}/status`, { active }),
};

export const teamService = {
  list: () => get('/teams').then((r) => r.data),
  get: (id) => get(`/teams/${id}`).then((r) => r.data),
  create: (body) => post('/teams', body),
  update: (id, body) => put(`/teams/${id}`, body),
  toggle: (id) => patch(`/teams/${id}/active`),
  remove: (id) => del(`/teams/${id}`),
  addMember: (id, userId) => post(`/teams/${id}/members`, { userId }),
  removeMember: (id, userId) => del(`/teams/${id}/members/${userId}`),
  setOnCall: (id, userId, on) => patch(`/teams/${id}/members/${userId}/on-call`, { on }),
};

export const customerService = {
  list: () => get('/customers').then((r) => r.data),
  create: (body) => post('/customers', body),
  people: (params) => get('/people', params).then((r) => r.data),
  createPerson: (body) => post('/people', body),
  setVip: (id, vip) => patch(`/people/${id}/vip`, { vip }),
};

export const auditService = {
  list: (params) => get('/audit-logs', params),
  exportCsv: (params) => download('/audit-logs/export', params, 'audit-log.csv'),
};

export const dataService = {
  summary: () => get('/data/summary').then((r) => r.data),
  exportAll: () => download('/data/export', undefined, 'servicedesk-export.json'),
};
