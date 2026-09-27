import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { signIn, meta, ADMIN, CUSTOMER } from './helpers.js';
import { closePool, query, queryOne, withTransaction } from '../src/config/database.js';
import { nextNumber } from '../src/services/sequence.service.js';

let s, m, requester, cat;
beforeAll(async () => {
  s = await signIn(ADMIN);
  m = await meta(s);
  requester = (await s.get('/api/v1/people?customerId=' + m.customers[0].id)).body.data[1];
  cat = (name) => m.categories.find((c) => c.name === name).id;
});
afterAll(closePool);

async function newTicket(extra = {}) {
  const res = await s.post('/api/v1/tickets').send({
    kind: 'incident', title: 'Laptop fan is very loud', description: 'Since this morning', customerId: m.customers[0].id,
    requesterId: requester.id, categoryId: cat('Hardware and devices'), impact: 3, urgency: 3, channel: 'Phone', ...extra,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data;
}

describe('ticket creation', () => {
  it('generates a server-side number and stores the ticket with an activity', async () => {
    const t = await newTicket();
    expect(t.number).toMatch(new RegExp(`^INC-${new Date().getUTCFullYear()}-\\d{4}$`));
    expect(t.status).toBe('New');
    expect(t.priority).toBe(4);
    const row = await queryOne('SELECT * FROM tickets WHERE ticket_number = ?', [t.number]);
    expect(row.channel).toBe('Phone');
    const acts = await query('SELECT body FROM ticket_activities WHERE ticket_id = ?', [row.id]);
    expect(acts.map((a) => a.body)).toContain('Ticket created via Phone');
    const audit = await queryOne("SELECT * FROM audit_logs WHERE entity_ref = ? AND action = 'Created incident'", [t.number]);
    expect(audit).toBeTruthy();
  });

  it('calculates priority from impact and urgency', async () => {
    const t = await newTicket({ impact: 1, urgency: 2 });
    expect(t.priority).toBe(2);
  });

  it('routes security alerts to Security operations (rule r1)', async () => {
    const t = await newTicket({ title: 'Suspicious PowerShell activity', categoryId: cat('Security alerts') });
    expect(t.team.name).toBe('Security operations');
  });

  it('assigns critical tickets to the on-call agent (rule r2)', async () => {
    const t = await newTicket({ title: 'Core switch down in HQ', categoryId: cat('Network and VPN'), impact: 1, urgency: 1 });
    expect(t.priority).toBe(1);
    expect(t.assignee).toBeTruthy();
    expect(t.status).toBe('In Progress');
  });

  it('rejects invalid input', async () => {
    const res = await s.post('/api/v1/tickets').send({ title: 'abc', categoryId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('never hands out the same number twice under concurrency', async () => {
    const numbers = await Promise.all(Array.from({ length: 15 }, () => withTransaction((conn) => nextNumber(conn, 'TST'))));
    expect(new Set(numbers).size).toBe(15);
  });
});

describe('ticket workflow', () => {
  it('assigns, comments, holds with the SLA clock paused, resumes and resolves', async () => {
    const t = await newTicket();
    const me = s.user.id;

    let r = await s.patch(`/api/v1/tickets/${t.number}/assign`).send({ assigneeId: me });
    expect(r.status).toBe(200);
    expect(r.body.data.assignee.id).toBe(me);
    expect(r.body.data.status).toBe('In Progress');

    r = await s.post(`/api/v1/tickets/${t.number}/comments`).send({ body: 'Looking into it', internal: false });
    expect(r.status).toBe(201);
    const fresh = (await s.get(`/api/v1/tickets/${t.number}`)).body.data;
    expect(fresh.firstResponseAt).toBeTruthy();

    r = await s.post(`/api/v1/tickets/${t.number}/comments`).send({ body: 'Checked BIOS fan curve', internal: true });
    expect(r.body.data.some((e) => e.type === 'note')).toBe(true);

    r = await s.patch(`/api/v1/tickets/${t.number}/status`).send({ status: 'On Hold', holdReason: 'Waiting for requester' });
    expect(r.status).toBe(400); // a comment is required
    r = await s.patch(`/api/v1/tickets/${t.number}/status`).send({ status: 'On Hold', holdReason: 'Waiting for requester', comment: 'Please send a photo' });
    expect(r.status).toBe(200);
    expect(r.body.data.sla.state).toBe('paused');

    r = await s.patch(`/api/v1/tickets/${t.number}/status`).send({ status: 'In Progress' });
    expect(r.body.data.sla.pausedAt).toBeNull();

    r = await s.patch(`/api/v1/tickets/${t.number}/status`).send({ status: 'Resolved', resolutionCode: 'Fixed', resolutionNotes: 'Cleaned the fan' });
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('Resolved');
    expect(r.body.data.resolutionCode).toBe('Fixed');

    r = await s.patch(`/api/v1/tickets/${t.number}/status`).send({ status: 'Closed' });
    expect(r.body.data.status).toBe('Closed');

    r = await s.post(`/api/v1/tickets/${t.number}/comments`).send({ body: 'late reply' });
    expect(r.status).toBe(422);
    expect(r.body.errorCode).toBe('TICKET_CLOSED');

    const history = (await s.get(`/api/v1/tickets/${t.number}/history`)).body.data;
    expect(history.some((h) => h.field === 'status' && h.newValue === 'Closed')).toBe(true);
  });

  it('refuses an illegal transition', async () => {
    const t = await newTicket();
    const r = await s.patch(`/api/v1/tickets/${t.number}/status`).send({ status: 'Closed' });
    expect(r.status).toBe(422);
    expect(r.body.errorCode).toBe('INVALID_TRANSITION');
  });

  it('recalculates priority when impact changes', async () => {
    const t = await newTicket();
    const r = await s.patch(`/api/v1/tickets/${t.number}/priority`).send({ impact: 1, urgency: 1 });
    expect(r.body.data.priority).toBe(1);
  });

  it('lists with server-side search, filters, sorting and pagination', async () => {
    const r = await s.get('/api/v1/tickets?search=vpn&status=In%20Progress,New&priority=1,2,3,4&sortBy=created&sortOrder=DESC&page=1&limit=5');
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBeLessThanOrEqual(5);
    expect(r.body.meta).toMatchObject({ page: 1, limit: 5 });
    expect(r.body.meta.counts.all).toBeGreaterThan(0);
    for (const t of r.body.data) expect(['In Progress', 'New']).toContain(t.status);
  });

  it('lets a customer raise a ticket for themselves only', async () => {
    const c = await signIn(CUSTOMER);
    const res = await c.post('/api/v1/tickets').send({ title: 'Cannot reach the VPN from home', categoryId: cat('Network and VPN'), requesterId: requester.id });
    expect(res.status).toBe(201);
    expect(res.body.data.requester.id).toBe(c.user.personId);
    expect(res.body.data.assignee).toBeNull();
  });
});

describe('attachments', () => {
  it('stores allowed files, blocks executables and mismatched content, and authorises downloads', async () => {
    const t = await newTicket();
    let r = await s.agent.post(`/api/v1/tickets/${t.number}/attachments`).set('X-Requested-With', 'XMLHttpRequest')
      .attach('files', Buffer.from('log line 1\nlog line 2\n'), 'client.log');
    expect(r.status).toBe(201);
    const file = r.body.data.find((f) => f.name === 'client.log');
    expect(file).toBeTruthy();

    r = await s.agent.post(`/api/v1/tickets/${t.number}/attachments`).set('X-Requested-With', 'XMLHttpRequest')
      .attach('files', Buffer.from('MZ\x90\x00'), 'setup.exe');
    expect(r.status).toBe(400);
    expect(r.body.errorCode).toBe('FILE_TYPE_BLOCKED');

    r = await s.agent.post(`/api/v1/tickets/${t.number}/attachments`).set('X-Requested-With', 'XMLHttpRequest')
      .attach('files', Buffer.from('not really a png'), 'photo.png');
    expect(r.status).toBe(400);
    expect(r.body.errorCode).toBe('FILE_CONTENT_MISMATCH');

    r = await s.get(`/api/v1/attachments/${file.id}/download`);
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toMatch(/attachment/);
    expect(r.headers['x-content-type-options']).toBe('nosniff');

    const c = await signIn(CUSTOMER);
    expect((await c.get(`/api/v1/attachments/${file.id}/download`)).status).toBe(404);
  });
});
