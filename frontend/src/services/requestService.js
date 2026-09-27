import { get, post, put, multipart } from './api';

export const requestService = {
  catalog: (all = false) => get('/catalog', all ? { all: 'true' } : undefined).then((r) => r.data),
  kpis: () => get('/requests/kpis').then((r) => r.data),
  list: (params) => get('/requests', params),
  get: (n) => get(`/requests/${encodeURIComponent(n)}`).then((r) => r.data),
  submit: (body, files = []) => post('/requests', files.length ? multipart(body, files) : body),
  createCatalogItem: (body) => post('/catalog', body),
  updateCatalogItem: (id, body) => put(`/catalog/${id}`, body),
};
