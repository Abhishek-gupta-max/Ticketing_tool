import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app, signIn, ADMIN, AGENT, CUSTOMER } from './helpers.js';
import { closePool } from '../src/config/database.js';

afterAll(closePool);
const X = { 'X-Requested-With': 'XMLHttpRequest' };

describe('authentication', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/tickets');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, errorCode: 'UNAUTHORIZED' });
  });

  it('rejects a wrong password with a generic message', async () => {
    const res = await request(app).post('/api/v1/auth/login').set(X).send({ email: ADMIN.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Email or password is incorrect.');
  });

  it('gives the same message for an unknown email', async () => {
    const res = await request(app).post('/api/v1/auth/login').set(X).send({ email: 'nobody@example.com', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('INVALID_CREDENTIALS');
  });

  it('validates the login body', async () => {
    const res = await request(app).post('/api/v1/auth/login').set(X).send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('sets an HTTP-only session cookie and returns the profile without secrets', async () => {
    const res = await request(app).post('/api/v1/auth/login').set(X).send(ADMIN);
    expect(res.status).toBe(200);
    const cookie = res.headers['set-cookie'].join(';');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(res.body.data.role).toBe('Admin');
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });

  it('requires the CSRF header on state-changing requests', async () => {
    const s = await signIn(ADMIN);
    const res = await s.agent.post('/api/v1/tickets').send({});
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('CSRF_CHECK_FAILED');
  });

  it('logs out and invalidates every session with logout-all', async () => {
    const s = await signIn(AGENT);
    expect((await s.get('/api/v1/auth/me')).status).toBe(200);
    expect((await s.post('/api/v1/auth/logout-all')).status).toBe(200);
    expect((await s.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('locks the account after repeated failures', async () => {
    const email = 'isha@veltrixsecure.example';
    for (let i = 0; i < 5; i++) await request(app).post('/api/v1/auth/login').set(X).send({ email, password: 'bad-password' });
    const res = await request(app).post('/api/v1/auth/login').set(X).send({ email, password: 'Demo-pass-2026' });
    expect(res.status).toBe(423);
    expect(res.body.errorCode).toBe('ACCOUNT_LOCKED');
  });

  it('does not reveal whether an email exists on forgot-password', async () => {
    const a = await request(app).post('/api/v1/auth/forgot-password').set(X).send({ email: 'nobody@example.com' });
    const b = await request(app).post('/api/v1/auth/forgot-password').set(X).send({ email: ADMIN.email });
    expect(a.status).toBe(200);
    expect(a.body.message).toBe(b.body.message);
  });
});

describe('authorization', () => {
  it('blocks an agent from admin settings', async () => {
    const s = await signIn({ email: 'priya@veltrixsecure.example', password: 'Demo-pass-2026' });
    expect((await s.get('/api/v1/settings')).status).toBe(403);
    expect((await s.get('/api/v1/audit-logs')).status).toBe(403);
    expect((await s.put('/api/v1/settings/sla').send({ rows: [{ priority: 1, responseMinutes: 1, resolutionMinutes: 1 }] })).status).toBe(403);
  });

  it('blocks an agent from approving requests', async () => {
    const s = await signIn({ email: 'priya@veltrixsecure.example', password: 'Demo-pass-2026' });
    const any = (await s.get('/api/v1/tickets?kind=request&limit=1&quick=all')).body.data;
    expect(any.length).toBeGreaterThan(0);
    const res = await s.post(`/api/v1/tickets/${any[0].number}/approval`).send({ decision: 'approve' });
    expect(res.status).toBe(403);
  });

  it('limits a customer to their own tickets and hides internal notes', async () => {
    const s = await signIn(CUSTOMER);
    const list = (await s.get('/api/v1/tickets?limit=100&quick=all')).body.data;
    expect(list.every((t) => t.requester.id === s.user.personId)).toBe(true);
    expect((await s.get('/api/v1/dashboard')).status).toBe(403);
    expect((await s.get('/api/v1/assets')).status).toBe(403);
    // a ticket of someone else is reported as not found
    const admin = await signIn(ADMIN);
    const other = (await admin.get('/api/v1/tickets?limit=100&quick=all')).body.data.find((t) => t.requester.id !== s.user.personId);
    expect((await s.get(`/api/v1/tickets/${other.number}`)).status).toBe(404);
    if (list.length) {
      const tl = (await s.get(`/api/v1/tickets/${list[0].number}/activity`)).body.data;
      expect(tl.some((e) => e.type === 'note')).toBe(false);
    }
  });
});
