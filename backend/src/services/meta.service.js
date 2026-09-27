// Reference data the frontend needs to render forms and labels. Loaded once
// after sign-in and refreshed after settings change.
import * as settingsRepo from '../repositories/settings.repository.js';
import * as settings from './settings.service.js';
import { query } from '../config/database.js';
import { env } from '../config/env.js';
import * as constants from '../constants/workflow.js';
import { BLOCKED_EXT, allowedExtensions } from './attachment.service.js';

export async function meta(user) {
  const [all, lookups, types, kbCats, canned] = await Promise.all([settings.getAll(), settingsRepo.lookups(), settingsRepo.assetTypes(), settingsRepo.kbCategories(), user.isStaff ? settingsRepo.canned() : []]);
  const lists = {};
  lookups.forEach((l) => { (lists[l.list_key] = lists[l.list_key] || []).push(l.value); });
  const base = {
    organisation: all.settings.organisation,
    priorities: Object.values(all.priorities).map((p) => ({ id: p.id, name: p.name, responseMinutes: p.response_minutes, resolutionMinutes: p.resolution_minutes })),
    categories: all.categories.filter((c) => c.is_active).map((c) => ({ id: c.id, name: c.name, teamId: c.default_team_id })),
    kbCategories: kbCats,
    channels: lists.channel || [],
    statuses: constants.TICKET_STATUSES,
    openStatuses: constants.OPEN_STATUSES,
    impactLabels: constants.IMPACT_LABELS,
    urgencyLabels: constants.URGENCY_LABELS,
    priorityMatrix: constants.PRIORITY_MATRIX,
    attachments: { maxBytes: env.maxFileBytes, maxFiles: env.MAX_FILES_PER_UPLOAD, blocked: BLOCKED_EXT, allowed: allowedExtensions() },
    requestResponseMinutes: all.settings.request_sla?.responseMinutes || constants.REQUEST_RESPONSE_MINUTES,
  };
  if (!user.isStaff) {
    const customers = user.customerId ? await query('SELECT id, name, is_internal FROM customers WHERE id = ?', [user.customerId]) : [];
    return { ...base, customers: customers.map((c) => ({ id: c.id, name: c.name, isInternal: !!c.is_internal })) };
  }
  const [customers, agents, teams] = await Promise.all([
    query('SELECT id, name, plan, is_internal FROM customers WHERE deleted_at IS NULL ORDER BY is_internal, id'),
    query(`SELECT u.id, u.name, u.email, r.name AS role, a.primary_team_id,
                  (SELECT GROUP_CONCAT(team_id) FROM team_members tm WHERE tm.user_id = u.id) AS team_ids
             FROM users u JOIN agents a ON a.user_id = u.id JOIN roles r ON r.id = u.role_id WHERE u.status = 'active' AND u.deleted_at IS NULL ORDER BY u.name`),
    query('SELECT id, code, name, type, is_active FROM teams ORDER BY id'),
  ]);
  return {
    ...base,
    customers: customers.map((c) => ({ id: c.id, name: c.name, plan: c.plan, isInternal: !!c.is_internal })),
    agents: agents.map((a) => ({ id: a.id, name: a.name, email: a.email, role: a.role, primaryTeamId: a.primary_team_id, teamIds: a.team_ids ? a.team_ids.split(',').map(Number) : [] })),
    teams: teams.map((t) => ({ id: t.id, code: t.code, name: t.name, type: t.type, isActive: !!t.is_active })),
    holdReasons: lists.hold_reason || [],
    resolutionCodes: lists.resolution_code || [],
    problemCodes: lists.problem_code || [],
    changeCloseCodes: lists.change_close_code || [],
    departments: lists.department || [],
    environments: lists.environment || [],
    timezones: lists.timezone || [],
    assetTypes: types.map((t) => ({ id: t.id, name: t.name, icon: t.icon, isSubscription: !!t.is_subscription, isPersonalDevice: !!t.is_personal_device })),
    criticalities: constants.CRITICALITIES,
    assetStatuses: constants.ASSET_STATUSES,
    taskStates: constants.TASK_STATES,
    taskTypes: constants.TASK_TYPES,
    problemSteps: constants.PROBLEM_STEPS,
    changeSteps: constants.CHANGE_STEPS,
    changeStepsStandard: constants.CHANGE_STEPS_STANDARD,
    changeTypes: constants.CHANGE_TYPES,
    canned: canned.map((c) => ({ id: c.id, name: c.name, body: c.body })),
  };
}
