// Settings, people, teams, customers, audit log, integrations and data export.
import * as settings from '../services/settings.service.js';
import * as users from '../services/user.service.js';
import * as teams from '../services/team.service.js';
import * as customers from '../services/customer.service.js';
import * as audit from '../services/audit.service.js';
import * as integrations from '../services/integration.service.js';
import * as data from '../services/data.service.js';
import { clearPermissionCache } from '../services/auth.service.js';
import { ok, created } from '../utils/response.js';
import { sendCsv } from '../utils/csv.js';

const p = (req, k) => req.valid.params[k];

export const setting = {
  get: async (req, res) => ok(res, await settings.adminView()),
  general: async (req, res) => ok(res, await settings.updateGeneral(req.user, req.valid.body), 'Saved'),
  sla: async (req, res) => ok(res, await settings.updateSla(req.user, req.valid.body.rows), 'SLA policy saved'),
  rule: async (req, res) => ok(res, await settings.setRule(req.user, req.params.code, req.valid.body.enabled), 'Rule updated'),
  autoClose: async (req, res) => ok(res, await settings.setAutoClose(req.user, req.valid.body.days), 'Saved'),
  routing: async (req, res) => ok(res, await settings.setRouting(req.user, req.valid.body.categoryId, req.valid.body.teamId), 'Routing saved'),
  notifications: async (req, res) => ok(res, await settings.setNotifications(req.user, req.valid.body), 'Saved'),
  integration: async (req, res) => ok(res, await settings.setIntegration(req.user, req.params.key, req.valid.body), 'Integration updated'),
  rotateKey: async (req, res) => { const r = await settings.rotateWebhookKey(req.user); ok(res, r, 'New key generated. Copy it now; it will not be shown again.'); },
  cab: async (req, res) => ok(res, await settings.setCabApprovers(req.user, req.valid.body.approvers), 'CAB approvers saved'),
  createCanned: async (req, res) => { await settings.createCanned(req.user, req.valid.body); created(res, await settings.adminView(), 'Canned response added'); },
  updateCanned: async (req, res) => { await settings.updateCanned(req.user, p(req, 'id'), req.valid.body); ok(res, await settings.adminView(), 'Saved'); },
  deleteCanned: async (req, res) => { await settings.deleteCanned(req.user, p(req, 'id')); ok(res, await settings.adminView(), 'Deleted'); },
  simulateEmail: async (req, res) => { const t = await integrations.simulateEmail(req.user); created(res, t, `${t.number} created from an email`); },
  simulateSiem: async (req, res) => { const t = await integrations.simulateSiem(req.user); created(res, t, `${t.number} created from a SIEM alert`); },
};

export const user = {
  list: async (req, res) => ok(res, await users.listAgents()),
  roles: async (req, res) => ok(res, await users.roleMatrix()),
  create: async (req, res) => { const r = await users.createAgent(req.valid.body, req.user); created(res, r, 'Agent added'); },
  update: async (req, res) => { const r = await users.updateAgent(p(req, 'id'), req.valid.body, req.user); clearPermissionCache(); ok(res, r, 'Agent saved'); },
  status: async (req, res) => ok(res, await users.setActive(p(req, 'id'), req.valid.body.active, req.user), req.valid.body.active ? 'Agent activated' : 'Agent deactivated'),
};

export const team = {
  list: async (req, res) => ok(res, await teams.list()),
  get: async (req, res) => ok(res, await teams.get(p(req, 'id'))),
  create: async (req, res) => created(res, await teams.create(req.valid.body, req.user), 'Team created'),
  update: async (req, res) => ok(res, await teams.update(p(req, 'id'), req.valid.body, req.user), 'Team saved'),
  toggle: async (req, res) => { const t = await teams.toggle(p(req, 'id')); ok(res, t, t.isActive ? `${t.name} is active` : `${t.name} is inactive. New tickets skip it.`); },
  remove: async (req, res) => { await teams.remove(p(req, 'id')); ok(res, null, 'Team deleted'); },
  addMember: async (req, res) => ok(res, await teams.addMember(p(req, 'id'), req.valid.body.userId), 'Member added'),
  removeMember: async (req, res) => ok(res, await teams.removeMember(p(req, 'id'), p(req, 'userId')), 'Member removed'),
  onCall: async (req, res) => ok(res, await teams.setOnCall(p(req, 'id'), p(req, 'userId'), req.valid.body.on), 'On-call updated'),
};

export const customer = {
  list: async (req, res) => ok(res, await customers.listCustomers()),
  create: async (req, res) => created(res, await customers.createCustomer(req.valid.body), 'Customer added'),
  people: async (req, res) => ok(res, await customers.listPeople(req.valid.query)),
  createPerson: async (req, res) => created(res, await customers.createPerson(req.valid.body), 'Requester added'),
  vip: async (req, res) => ok(res, await customers.setVip(p(req, 'id'), req.valid.body.vip), 'Saved'),
};

export const auditLog = {
  list: async (req, res) => { const r = await audit.list(req.valid.query); ok(res, r.items, 'OK', r.meta); },
  export: async (req, res) => {
    const rows = await audit.exportRows(req.valid.query);
    sendCsv(res, `audit-log-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['When', 'Who', 'Action', 'Entity', 'Record', 'IP address', 'Old value', 'New value'],
      ...rows.map((a) => [a.created_at, a.user_name || 'System', a.action, a.entity_type, a.entity_ref || '', a.ip_address || '', a.old_values || '', a.new_values || '']),
    ]);
  },
};

export const dataAdmin = {
  summary: async (req, res) => ok(res, await data.summary()),
  export: async (req, res) => {
    res.setHeader('Content-Disposition', `attachment; filename="veltrixsecure-servicedesk-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(await data.exportAll());
  },
};
