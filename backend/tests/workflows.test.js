import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { signIn, meta, ADMIN, MANAGER } from './helpers.js';
import { closePool, query, queryOne } from '../src/config/database.js';

let s, m;
beforeAll(async () => { s = await signIn(ADMIN); m = await meta(s); });
afterAll(closePool);

describe('service requests and approvals', () => {
  it('submits a multi-item request in one transaction and runs the approval workflow', async () => {
    const catalog = (await s.get('/api/v1/catalog')).body.data;
    const licence = catalog.find((c) => c.name === 'Software licence');
    const token = catalog.find((c) => c.name === 'Security token replacement');
    const person = (await s.get('/api/v1/people?customerId=' + m.customers[0].id)).body.data[0];

    // missing required field -> nothing is created
    const before = (await queryOne('SELECT COUNT(*) AS n FROM requests')).n;
    let r = await s.post('/api/v1/requests').send({ customerId: m.customers[0].id, requestedForId: person.id, items: [{ catalogItemId: licence.id, values: { app: 'Figma' } }] });
    expect(r.status).toBe(400);
    expect((await queryOne('SELECT COUNT(*) AS n FROM requests')).n).toBe(before);

    r = await s.post('/api/v1/requests').send({
      customerId: m.customers[0].id, requestedForId: person.id,
      items: [{ catalogItemId: licence.id, values: { app: 'Figma', why: 'Design work' } }, { catalogItemId: token.id, values: { reason: 'Lost' } }],
    });
    expect(r.status).toBe(201);
    const { reqNumber, items } = r.body.data;
    expect(items).toEqual([`${reqNumber}.1`, `${reqNumber}.2`]);

    const item1 = (await s.get(`/api/v1/tickets/${items[0]}`)).body.data;
    expect(item1.status).toBe('Awaiting approval');
    expect(item1.approval.status).toBe('Pending');
    expect(item1.formValues.find((v) => v.key === 'app').value).toBe('Figma');
    const item2 = (await s.get(`/api/v1/tickets/${items[1]}`)).body.data;
    expect(item2.status).not.toBe('Awaiting approval');
    expect(item2.tasks.length).toBe(1);

    const mgr = await signIn(MANAGER);
    r = await mgr.post(`/api/v1/tickets/${items[0]}/approval`).send({ decision: 'approve' });
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('In Progress');
    expect(r.body.data.tasks.map((t) => t.state)).toEqual(['Ready', 'Waiting']);

    // sequential tasks: closing step 1 opens step 2; resolving needs all tasks closed
    let res = await s.patch(`/api/v1/tickets/${items[0]}/status`).send({ status: 'Resolved', resolutionCode: 'Fixed', resolutionNotes: 'Licence assigned' });
    expect(res.status).toBe(422);
    const [t1, t2] = r.body.data.tasks;
    expect((await s.patch(`/api/v1/tasks/${t2.number}/state`).send({ state: 'Done' })).status).toBe(422);
    expect((await s.patch(`/api/v1/tasks/${t1.number}/state`).send({ state: 'Done' })).status).toBe(200);
    expect((await s.get(`/api/v1/tasks/${t2.number}`)).body.data.state).toBe('Ready');
    expect((await s.patch(`/api/v1/tasks/${t2.number}/state`).send({ state: 'Not needed' })).status).toBe(400);
    expect((await s.patch(`/api/v1/tasks/${t2.number}/state`).send({ state: 'Not needed', note: 'User already had it' })).status).toBe(200);
    res = await s.patch(`/api/v1/tickets/${items[0]}/status`).send({ status: 'Resolved', resolutionCode: 'Fixed', resolutionNotes: 'Licence assigned' });
    expect(res.status).toBe(200);

    const detail = (await s.get(`/api/v1/requests/${reqNumber}`)).body.data;
    expect(detail.items).toHaveLength(2);
  });

  it('closes a rejected request', async () => {
    const pending = (await s.get('/api/v1/tickets?status=Awaiting%20approval')).body.data[0];
    const mgr = await signIn(MANAGER);
    const r = await mgr.post(`/api/v1/tickets/${pending.number}/approval`).send({ decision: 'reject', comment: 'Not budgeted' });
    expect(r.body.data.status).toBe('Closed');
    expect(r.body.data.resolutionCode).toBe('Request rejected');
    const ap = await queryOne('SELECT status, decided_by FROM approvals WHERE ticket_id = ? ORDER BY id DESC LIMIT 1', [pending.id]);
    expect(ap.status).toBe('Rejected');
  });
});

describe('problems', () => {
  it('enforces the problem workflow and resolves linked incidents', async () => {
    let r = await s.post('/api/v1/problems').send({ title: 'Repeated Teams crashes after update', priority: 2 });
    expect(r.status).toBe(201);
    const p = r.body.data;
    expect(p.number).toMatch(/^PRB-\d{4}-\d{4}$/);

    expect((await s.patch(`/api/v1/problems/${p.number}/status`).send({ status: 'Fix underway' })).status).toBe(422);
    await s.patch(`/api/v1/problems/${p.number}/status`).send({ status: 'Investigating' });
    await s.patch(`/api/v1/problems/${p.number}/status`).send({ status: 'Finding cause' });
    expect((await s.patch(`/api/v1/problems/${p.number}/status`).send({ status: 'Fix underway' })).body.errorCode).toBe('INVALID_TRANSITION');
    await s.patch(`/api/v1/problems/${p.number}`).send({ rootCause: 'Corrupt cache after the June update', workaround: 'Clear the Teams cache folder' });
    expect((await s.post(`/api/v1/problems/${p.number}/known-error`)).body.data.isKnownError).toBe(true);
    expect((await s.patch(`/api/v1/problems/${p.number}/status`).send({ status: 'Fix underway' })).status).toBe(200);

    const inc = (await s.get('/api/v1/tickets?kind=incident&quick=open&withoutProblem=true&limit=1')).body.data[0];
    await s.post(`/api/v1/problems/${p.number}/incidents`).send({ ticketNumber: inc.number });
    r = await s.patch(`/api/v1/problems/${p.number}/status`).send({ status: 'Fixed', resolutionCode: 'Fixed permanently', fixNotes: 'Deployed the cache fix', resolveLinked: true });
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('Fixed');
  });
});

describe('changes and CAB approvals', () => {
  it('moves a normal change through risk review, approval and implementation', async () => {
    const assets = (await s.get('/api/v1/assets/options')).body.data;
    let r = await s.post('/api/v1/changes').send({
      title: 'Replace UPS batteries in the Pune office', type: 'Normal', ownerId: s.user.id, plannedStart: new Date(Date.now() + 3 * 86400000).toISOString(),
      durationHours: 2, riskScope: 2, riskDowntime: 1, riskTested: true, riskBackout: true, implementationPlan: 'Swap batteries one string at a time',
      backoutPlan: 'Reinstall the old batteries', assetIds: [assets.find((a) => a.name === 'bak-01').id],
    });
    expect(r.status).toBe(201);
    const c = r.body.data;
    expect(c.status).toBe('Draft');
    expect(c.approvals.length).toBe(3);

    expect((await s.post(`/api/v1/changes/${c.number}/transition`).send({ to: 'Approval' })).status).toBe(422);
    await s.post(`/api/v1/changes/${c.number}/transition`).send({ to: 'Risk review' });
    r = await s.post(`/api/v1/changes/${c.number}/transition`).send({ to: 'Approval' });
    expect(r.body.data.status).toBe('Approval');

    // Sofia (manager) may only decide her own approval; admin can decide on behalf
    const mgr = await signIn(MANAGER);
    const others = r.body.data.approvals.filter((a) => a.approver.id !== mgr.user.id);
    expect((await mgr.post(`/api/v1/changes/${c.number}/approvals/${others[0].id}/decision`).send({ decision: 'approve' })).status).toBe(403);
    for (const a of r.body.data.approvals) {
      const res = await s.post(`/api/v1/changes/${c.number}/approvals/${a.id}/decision`).send({ decision: 'approve' });
      expect(res.status).toBe(200);
    }
    r = await s.get(`/api/v1/changes/${c.number}`);
    expect(r.body.data.status).toBe('Scheduled');

    r = await s.post(`/api/v1/changes/${c.number}/transition`).send({ to: 'Doing', force: true });
    expect(r.body.data.status).toBe('Doing');
    expect(r.body.data.tasks).toHaveLength(4);
    expect((await s.post(`/api/v1/changes/${c.number}/transition`).send({ to: 'Verify' })).status).toBe(422);
    for (const t of r.body.data.tasks) await s.patch(`/api/v1/tasks/${t.number}/state`).send({ state: 'Done' });
    expect((await s.post(`/api/v1/changes/${c.number}/transition`).send({ to: 'Verify' })).status).toBe(200);
    r = await s.post(`/api/v1/changes/${c.number}/transition`).send({ to: 'Closed', closeCode: 'Worked as planned', closeNotes: 'All strings replaced' });
    expect(r.body.data.status).toBe('Closed');
  });

  it('sends a change back to risk review when one approver rejects', async () => {
    const pending = (await s.get('/api/v1/changes?view=Approval')).body.data.items[0];
    const c = (await s.get(`/api/v1/changes/${pending.number}`)).body.data;
    const a = c.approvals.find((x) => x.status === 'Pending');
    const r = await s.post(`/api/v1/changes/${c.number}/approvals/${a.id}/decision`).send({ decision: 'reject', comment: 'Needs a test plan' });
    expect(r.body.data.status).toBe('Risk review');
  });
});

describe('knowledge base, assets, dashboard and audit', () => {
  it('creates, publishes and votes on an article', async () => {
    const cat = m.kbCategories[0].id;
    let r = await s.post('/api/v1/kb').send({ title: 'How to clear the Teams cache', categoryId: cat, audience: 'Public', status: 'Draft', body: '## Steps\n1. Quit Teams\n2. Delete the cache folder', tags: ['teams'] });
    expect(r.status).toBe(201);
    expect(r.body.data.number).toMatch(/^KB-\d{4}-\d{4}$/);
    r = await s.patch(`/api/v1/kb/${r.body.data.number}/status`).send({ status: 'Published' });
    expect(r.body.data.status).toBe('Published');
    r = await s.post(`/api/v1/kb/${r.body.data.number}/vote`).send({ helpful: true });
    expect(r.body.data.helpful).toBe(1);
    r = await s.post(`/api/v1/kb/${r.body.data.number}/vote`).send({ helpful: true });
    expect(r.body.data.helpful).toBe(1);
  });

  it('creates an asset with a server tag and imports CSV rows', async () => {
    let r = await s.post('/api/v1/assets').send({ name: 'LT-8800', typeId: m.assetTypes.find((t) => t.name === 'Laptop').id, criticality: 'Medium', status: 'In stock', customerId: m.customers[0].id });
    expect(r.status).toBe(201);
    expect(r.body.data.tag).toMatch(/^AST-\d{3,}$/);
    r = await s.agent.post('/api/v1/assets/import').set('X-Requested-With', 'XMLHttpRequest')
      .attach('file', Buffer.from('name,type,criticality\nLT-9901,Laptop,High\nLT-8800,Laptop,Low\n'), 'assets.csv');
    expect(r.body.data.imported).toBe(1);
    expect(r.body.data.errors[0]).toMatch(/already exists/);
  });

  it('serves a database-driven dashboard', async () => {
    const d = (await s.get('/api/v1/dashboard')).body.data;
    const total = (await queryOne('SELECT COUNT(*) AS n FROM tickets WHERE deleted_at IS NULL')).n;
    expect(d.totals.total).toBe(total);
    expect(d.byPriority).toHaveLength(4);
    expect(d.sla.daily).toHaveLength(30);
  });

  it('keeps audit entries append-only', async () => {
    const [row] = await query('SELECT id FROM audit_logs LIMIT 1');
    await expect(query('UPDATE audit_logs SET action = ? WHERE id = ?', ['tampered', row.id])).rejects.toThrow(/append-only/);
    await expect(query('DELETE FROM audit_logs WHERE id = ?', [row.id])).rejects.toThrow(/append-only/);
  });
});
