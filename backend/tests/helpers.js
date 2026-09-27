import request from 'supertest';
import { createApp } from '../src/app.js';

export const app = createApp();
export const ADMIN = { email: 'admin@veltrixsecure.example', password: 'Admin-pass-2026' };
export const AGENT = { email: 'aarav@veltrixsecure.example', password: 'Demo-pass-2026' };
export const MANAGER = { email: 'sofia@veltrixsecure.example', password: 'Demo-pass-2026' };
export const CUSTOMER = { email: 'ava.shah@kestrelbank.example', password: 'Demo-pass-2026' };

/** A supertest agent that keeps the session cookie and sends the CSRF header. */
export async function signIn(who) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').set('X-Requested-With', 'XMLHttpRequest').send(who);
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  const wrap = (m) => (url) => agent[m](url).set('X-Requested-With', 'XMLHttpRequest');
  return { agent, user: res.body.data, get: wrap('get'), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), del: wrap('delete') };
}

export async function meta(s) { return (await s.get('/api/v1/meta')).body.data; }
