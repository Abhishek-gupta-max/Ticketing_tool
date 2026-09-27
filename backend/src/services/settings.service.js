import * as repo from '../repositories/settings.repository.js';
import * as teamRepo from '../repositories/team.repository.js';
import * as audit from './audit.service.js';
import { withTransaction } from '../config/database.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { randomToken, sha256 } from '../utils/password.js';
import { PRIORITY_NAMES } from '../constants/workflow.js';
import { dur } from '../utils/time.js';

// Small in-process cache for configuration read on hot paths (ticket creation,
// SLA calculation). Every write through this service clears it.
let cache = null;
let cacheAt = 0;
const TTL = 30000;

export function invalidate() { cache = null; }

async function load() {
  if (cache && Date.now() - cacheAt < TTL) return cache;
  const [settings, priorities, rules, categories] = await Promise.all([repo.allSettings(), repo.priorities(), repo.rules(), repo.categories()]);
  cache = {
    settings,
    priorities: Object.fromEntries(priorities.map((p) => [p.id, p])),
    rules: Object.fromEntries(rules.map((r) => [r.code, !!r.is_enabled])),
    categories,
  };
  cacheAt = Date.now();
  return cache;
}

export const getAll = load;
export async function get(key) { return (await load()).settings[key]; }
export async function priorityPolicy(id) { return (await load()).priorities[id]; }
export async function priorities() { return (await load()).priorities; }
export async function rulesMap() { return (await load()).rules; }
export async function timezone() { return (await get('organisation'))?.timezone || 'UTC'; }

// ---------- admin views ----------
export async function adminView() {
  const s = await repo.allSettings();
  const [priorities, rules, categories, canned] = await Promise.all([repo.priorities(), repo.rules(), repo.categories(), repo.canned()]);
  const integrations = structuredClone(s.integrations || {});
  if (integrations.webhook) delete integrations.webhook.keyHash;
  return {
    organisation: s.organisation,
    businessHours: s.business_hours,
    automation: s.automation,
    notifications: s.notifications,
    integrations,
    requestSla: s.request_sla,
    cabApprovers: s.cab_approvers || [],
    sla: priorities.map((p) => ({ priority: p.id, name: p.name, responseMinutes: p.response_minutes, resolutionMinutes: p.resolution_minutes })),
    rules: rules.map((r) => ({ code: r.code, name: r.name, description: r.description, enabled: !!r.is_enabled })),
    routing: categories.map((c) => ({ categoryId: c.id, category: c.name, teamId: c.default_team_id, teamName: c.team_name })),
    canned: canned.map((c) => ({ id: c.id, name: c.name, body: c.body })),
  };
}

async function writeBlock(user, key, value, action) {
  const old = await repo.getSetting(key);
  await withTransaction(async (conn) => {
    await repo.setSetting(key, value, user.id, conn);
    await audit.log({ action, entityType: 'settings', entityRef: 'Settings', oldValues: { [key]: old }, newValues: { [key]: value } }, conn);
  });
  invalidate();
  return value;
}

export async function updateGeneral(user, { name, timezone, hours }) {
  if (name !== undefined || timezone !== undefined) {
    const cur = (await repo.getSetting('organisation')) || {};
    await writeBlock(user, 'organisation', { name: name ?? cur.name, timezone: timezone ?? cur.timezone }, 'Updated organisation settings');
  }
  if (hours) {
    const cur = (await repo.getSetting('business_hours')) || {};
    await writeBlock(user, 'business_hours', { ...cur, ...hours }, 'Updated business hours');
  }
  return adminView();
}

export async function updateSla(user, rows) {
  const before = await repo.priorities();
  await withTransaction(async (conn) => {
    for (const r of rows) await repo.updatePriority(r.priority, r.responseMinutes, r.resolutionMinutes, conn);
    await audit.log({
      action: 'Updated SLA policy', entityType: 'settings', entityRef: 'Settings',
      oldValues: Object.fromEntries(before.map((p) => [PRIORITY_NAMES[p.id], `${dur(p.response_minutes)} / ${dur(p.resolution_minutes)}`])),
      newValues: Object.fromEntries(rows.map((r) => [PRIORITY_NAMES[r.priority], `${dur(r.responseMinutes)} / ${dur(r.resolutionMinutes)}`])),
    }, conn);
  });
  invalidate();
  return adminView();
}

export async function setRule(user, code, enabled) {
  const rules = await repo.rules();
  const rule = rules.find((r) => r.code === code);
  if (!rule) throw notFound('Rule not found.');
  await repo.setRule(code, enabled);
  await audit.log({ action: (enabled ? 'Enabled rule: ' : 'Disabled rule: ') + rule.name, entityType: 'settings', entityRef: 'Settings' });
  invalidate();
  return adminView();
}

export async function setAutoClose(user, days) {
  await writeBlock(user, 'automation', { autoCloseDays: days }, 'Updated auto-close days');
  return adminView();
}

export async function setRouting(user, categoryId, teamId) {
  const cat = await repo.categoryById(categoryId);
  if (!cat) throw notFound('Category not found.');
  const team = await teamRepo.findById(teamId);
  if (!team || team.type !== 'Support') throw badRequest('Choose a support team.');
  await repo.setCategoryTeam(categoryId, teamId);
  await audit.log({ action: `Routing for ${cat.name} set to ${team.name}`, entityType: 'settings', entityRef: 'Settings' });
  invalidate();
  return adminView();
}

export async function setNotifications(user, prefs) {
  const cur = (await repo.getSetting('notifications')) || {};
  await writeBlock(user, 'notifications', { ...cur, ...prefs }, 'Updated notification settings');
  return adminView();
}

export async function setIntegration(user, key, patch) {
  const cur = (await repo.getSetting('integrations')) || {};
  if (!cur[key]) throw notFound('Integration not found.');
  const next = { ...cur, [key]: { ...cur[key], ...patch } };
  await writeBlock(user, 'integrations', next, `${patch.on === undefined ? 'Updated' : patch.on ? 'Connected' : 'Disconnected'} ${key}`);
  return adminView();
}

/** Generate a new webhook API key. Only its hash is stored; the key is shown once. */
export async function rotateWebhookKey(user) {
  const key = 'vlx_live_' + randomToken(24);
  const cur = (await repo.getSetting('integrations')) || {};
  cur.webhook = { ...(cur.webhook || {}), keyHash: sha256(key), keyPreview: key.slice(0, 13) + '...' + key.slice(-4) };
  await writeBlock(user, 'integrations', cur, 'Regenerated API key');
  return { key, settings: await adminView() };
}

export async function setCabApprovers(user, approvers) {
  await writeBlock(user, 'cab_approvers', approvers, 'Updated CAB approvers');
  return adminView();
}

// ---------- canned responses ----------
export async function createCanned(user, { name, body }) {
  const id = await repo.createCanned(name, body);
  await audit.log({ action: 'Created canned response ' + name, entityType: 'settings', entityRef: 'Settings' });
  return id;
}
export async function updateCanned(user, id, { name, body }) {
  await repo.updateCanned(id, name, body);
  await audit.log({ action: 'Updated canned response ' + name, entityType: 'settings', entityRef: 'Settings' });
}
export async function deleteCanned(user, id) {
  await repo.deleteCanned(id);
  await audit.log({ action: 'Deleted canned response', entityType: 'settings', entityRef: 'Settings' });
}
