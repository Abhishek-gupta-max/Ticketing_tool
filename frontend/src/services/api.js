import axios from 'axios';

// Single HTTP client. Components never build URLs themselves; they call the
// module services, which call this client.
export const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

export class ApiError extends Error {
  constructor(message, { status, errorCode, fields, details } = {}) {
    super(message);
    this.status = status;
    this.errorCode = errorCode;
    this.fields = fields || {};
    this.details = details;
  }
}

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 30000,
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
});

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (!err.response) return Promise.reject(new ApiError('Cannot reach the server. Check your connection and try again.', { status: 0, errorCode: 'NETWORK' }));
    const { status } = err.response;
    let data = err.response.data;
    if (data instanceof Blob) { try { data = JSON.parse(await data.text()); } catch { data = {}; } }
    if (status === 401 && !String(err.config.url).includes('/auth/')) onUnauthorized();
    const body = data || {};
    return Promise.reject(new ApiError(body.message || 'Something went wrong. Please try again.', {
      status, errorCode: body.errorCode, fields: body.details?.fields, details: body.details,
    }));
  },
);

/** Responses are { success, message, data, meta }. */
const unwrap = (res) => res.data;
export const get = (url, params) => api.get(url, { params }).then(unwrap);
export const post = (url, body, config) => api.post(url, body, config).then(unwrap);
export const put = (url, body) => api.put(url, body).then(unwrap);
export const patch = (url, body) => api.patch(url, body).then(unwrap);
export const del = (url) => api.delete(url).then(unwrap);

/** Multipart: structured data goes in "payload", files in "files". */
export function multipart(fields, files = []) {
  const fd = new FormData();
  fd.append('payload', JSON.stringify(fields));
  files.forEach((f) => fd.append('files', f));
  return fd;
}

export function filesForm(files, field = 'files') {
  const fd = new FormData();
  files.forEach((f) => fd.append(field, f));
  return fd;
}

/** Download a server-generated file (CSV, JSON, attachment) with the session cookie. */
export async function download(url, params, fallbackName = 'download') {
  const res = await api.get(url, { params, responseType: 'blob' });
  const cd = res.headers['content-disposition'] || '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)/) || cd.match(/filename="([^"]+)"/);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1500);
  return name;
}

export const fetchBlob = (url, params) => api.get(url, { params, responseType: 'blob' }).then((r) => r.data);
