import { get, post, put, patch, del, multipart, filesForm, download, fetchBlob } from './api';

const base = (n) => `/tickets/${encodeURIComponent(n)}`;

export const ticketService = {
  list: (params) => get('/tickets', params),
  board: (params) => get('/tickets/board', params).then((r) => r.data),
  get: (n) => get(base(n)).then((r) => r.data),
  create: (fields, files = []) => post('/tickets', files.length ? multipart(fields, files) : fields).then((r) => r.data),
  update: (n, body) => patch(base(n), body).then((r) => r.data),
  remove: (n) => del(base(n)),
  setStatus: (n, body) => patch(`${base(n)}/status`, body),
  assign: (n, assigneeId) => patch(`${base(n)}/assign`, { assigneeId }).then((r) => r.data),
  setPriority: (n, body) => patch(`${base(n)}/priority`, body).then((r) => r.data),
  activity: (n, filter = 'all') => get(`${base(n)}/activity`, { filter }).then((r) => r.data),
  history: (n) => get(`${base(n)}/history`).then((r) => r.data),
  comment: (n, body, files = []) => post(`${base(n)}/comments`, multipart(body, files)),
  attach: (n, files) => post(`${base(n)}/attachments`, filesForm(files)),
  decideApproval: (n, decision, comment) => post(`${base(n)}/approval`, { decision, comment }),
  rate: (n, rating) => post(`${base(n)}/csat`, { rating }).then((r) => r.data),
  bulk: (body) => post('/tickets/bulk', body),
  linkProblem: (n, problemNumber) => put(`${base(n)}/problem`, { problemNumber }),
  createProblem: (n, body) => post(`${base(n)}/problem`, body).then((r) => r.data),
  similar: (n) => get(`${base(n)}/similar`).then((r) => r.data.count),
  declareMajor: (n, body) => post(`${base(n)}/major`, body),
  exportCsv: (params) => download('/tickets/export', params, 'tickets.csv'),
};

export const incidentService = {
  overview: () => get('/incidents/overview').then((r) => r.data),
  declare: (body) => post('/major-incidents', body),
  postUpdate: (id, body) => post(`/major-incidents/${id}/updates`, { body }),
  resolve: (id, summary) => post(`/major-incidents/${id}/resolve`, { summary }),
};

export const attachmentService = {
  download: (id, name) => download(`/attachments/${id}/download`, undefined, name),
  blob: (id) => fetchBlob(`/attachments/${id}/download`, { inline: 1 }),
  remove: (id) => del(`/attachments/${id}`),
};
