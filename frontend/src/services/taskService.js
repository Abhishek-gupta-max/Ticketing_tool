import { get, post, patch, filesForm } from './api';

const base = (n) => `/tasks/${encodeURIComponent(n)}`;

export const taskService = {
  list: (params) => get('/tasks', params),
  get: (n) => get(base(n)).then((r) => r.data),
  create: (body) => post('/tasks', body),
  update: (n, body) => patch(base(n), body),
  setState: (n, state, note) => patch(`${base(n)}/state`, { state, note }),
  addNote: (n, body) => post(`${base(n)}/comments`, { body }),
  attach: (n, files) => post(`${base(n)}/attachments`, filesForm(files)),
};
