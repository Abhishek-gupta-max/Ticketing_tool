import { get, post, put, patch, filesForm } from './api';

const base = (n) => `/changes/${encodeURIComponent(n)}`;

export const changeService = {
  list: (params) => get('/changes', params).then((r) => r.data),
  get: (n) => get(base(n)).then((r) => r.data),
  create: (body) => post('/changes', body),
  update: (n, body) => put(base(n), body),
  updatePlans: (n, body) => patch(`${base(n)}/plans`, body),
  reschedule: (n, body) => patch(`${base(n)}/schedule`, body),
  setOwner: (n, ownerId) => patch(`${base(n)}/owner`, { ownerId }),
  transition: (n, body) => post(`${base(n)}/transition`, body),
  decide: (n, approvalId, decision, comment) => post(`${base(n)}/approvals/${approvalId}/decision`, { decision, comment }),
  attach: (n, files) => post(`${base(n)}/attachments`, filesForm(files)),
};

export const approvalService = {
  overview: () => get('/approvals').then((r) => r.data),
};
