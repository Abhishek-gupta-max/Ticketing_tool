import { get, post, patch, filesForm } from './api';

const base = (n) => `/problems/${encodeURIComponent(n)}`;

export const problemService = {
  list: (params) => get('/problems', params).then((r) => r.data),
  options: () => get('/problems/options').then((r) => r.data),
  get: (n) => get(base(n)).then((r) => r.data),
  create: (body) => post('/problems', body),
  fromSuggestion: (title) => post('/problems/from-suggestion', { title }),
  update: (n, body) => patch(base(n), body),
  setStatus: (n, body) => patch(`${base(n)}/status`, body),
  toggleKnownError: (n) => post(`${base(n)}/known-error`),
  addNote: (n, body) => post(`${base(n)}/notes`, { body }),
  linkIncident: (n, ticketNumber) => post(`${base(n)}/incidents`, { ticketNumber }),
  attach: (n, files) => post(`${base(n)}/attachments`, filesForm(files)),
};
