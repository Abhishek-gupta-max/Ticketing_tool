import { find, count, mapBy } from '../config/database.js';
import * as audit from './audit.service.js';

const TABLES = ['customers', 'people', 'teams', 'team_members', 'ticket_categories', 'priorities', 'catalog_items', 'catalog_fields', 'catalog_tasks',
  'requests', 'request_items', 'request_item_values', 'tickets', 'ticket_tags', 'ticket_comments', 'ticket_activities', 'ticket_history', 'tasks',
  'task_comments', 'task_activities', 'problems', 'problem_activities', 'changes', 'change_assets', 'change_activities', 'approvals', 'assets',
  'asset_types', 'asset_dependencies', 'knowledge_categories', 'knowledge_articles', 'knowledge_article_tags', 'major_incidents',
  'major_incident_updates', 'attachments', 'automation_rules', 'canned_responses', 'report_schedules', 'lookup_values'];

/** Counts for the Settings > Data tab. */
export async function summary() {
  const live = { deleted_at: null };
  const [tickets, problems, changes, assets, articles, attachments, audit, tasks, requests] = await Promise.all([
    count('tickets', live), count('problems', live), count('changes', live), count('assets', live), count('knowledge_articles', live),
    count('attachments', live), count('audit_logs'), count('tasks'), count('requests'),
  ]);
  return { tickets, problems, changes, assets, articles, attachments, audit, tasks, requests };
}

/** Full JSON export of business data (no users, password hashes or settings secrets). */
export async function exportAll() {
  const out = { exportedAt: new Date().toISOString(), tables: {} };
  for (const t of TABLES) out.tables[t] = await find(t, {});
  const users = await find('users', {}, { projection: { id: 1, name: 1, email: 1, role_id: 1, status: 1 } });
  const roles = await mapBy('roles', users.map((u) => u.role_id), { projection: { name: 1 } });
  out.tables.users = users.filter((u) => roles.has(u.role_id)).map((u) => ({ id: u.id, name: u.name, email: u.email, role: roles.get(u.role_id).name, status: u.status }));
  await audit.log({ action: 'Exported all data', entityType: 'data', entityRef: 'Data' });
  return out;
}
