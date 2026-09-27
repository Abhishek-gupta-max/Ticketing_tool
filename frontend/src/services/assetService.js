import { get, post, put, patch, del, download, filesForm } from './api';

const at = (tag) => `/assets/${encodeURIComponent(tag)}`;

export const assetService = {
  list: (params) => get('/assets', params),
  options: () => get('/assets/options').then((r) => r.data),
  owners: () => get('/assets/owners').then((r) => r.data),
  get: (tag) => get(at(tag)).then((r) => r.data),
  create: (body) => post('/assets', body),
  update: (tag, body) => put(at(tag), body),
  remove: (tag) => del(at(tag)),
  exportCsv: (params) => download('/assets/export', params, 'assets.csv'),
  template: () => download('/assets/import-template', undefined, 'asset-import-template.csv'),
  importCsv: (file) => post('/assets/import', filesForm([file], 'file')),
};

const kb = (n) => `/kb/${encodeURIComponent(n)}`;

export const kbService = {
  list: (params) => get('/kb', params),
  get: (n) => get(kb(n)).then((r) => r.data),
  create: (body) => post('/kb', body),
  update: (n, body) => put(kb(n), body),
  setStatus: (n, status) => patch(`${kb(n)}/status`, { status }),
  remove: (n) => del(kb(n)),
  vote: (n, helpful) => post(`${kb(n)}/vote`, { helpful }),
};
