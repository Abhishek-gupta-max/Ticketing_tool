import { query } from '../config/database.js';
import * as audit from './audit.service.js';

const TABLES = ['customers', 'people', 'teams', 'team_members', 'ticket_categories', 'priorities', 'catalog_items', 'catalog_fields', 'catalog_tasks',
  'requests', 'request_items', 'request_item_values', 'tickets', 'ticket_tags', 'ticket_comments', 'ticket_activities', 'ticket_history', 'tasks',
  'task_comments', 'task_activities', 'problems', 'problem_activities', 'changes', 'change_assets', 'change_activities', 'approvals', 'assets',
  'asset_types', 'asset_dependencies', 'knowledge_categories', 'knowledge_articles', 'knowledge_article_tags', 'major_incidents',
  'major_incident_updates', 'attachments', 'automation_rules', 'canned_responses', 'report_schedules', 'lookup_values'];

/** Counts for the Settings > Data tab. */
export async function summary() {
  const [row] = await query(`SELECT
    (SELECT COUNT(*) FROM tickets WHERE deleted_at IS NULL) AS tickets, (SELECT COUNT(*) FROM problems WHERE deleted_at IS NULL) AS problems,
    (SELECT COUNT(*) FROM changes WHERE deleted_at IS NULL) AS changes, (SELECT COUNT(*) FROM assets WHERE deleted_at IS NULL) AS assets,
    (SELECT COUNT(*) FROM knowledge_articles WHERE deleted_at IS NULL) AS articles, (SELECT COUNT(*) FROM attachments WHERE deleted_at IS NULL) AS attachments,
    (SELECT COUNT(*) FROM audit_logs) AS audit, (SELECT COUNT(*) FROM tasks) AS tasks, (SELECT COUNT(*) FROM requests) AS requests`);
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
}

/** Full JSON export of business data (no users, password hashes or settings secrets). */
export async function exportAll() {
  const out = { exportedAt: new Date().toISOString(), tables: {} };
  for (const t of TABLES) out.tables[t] = await query(`SELECT * FROM ${t}`);
  out.tables.users = await query('SELECT u.id, u.name, u.email, r.name AS role, u.status FROM users u JOIN roles r ON r.id = u.role_id');
  await audit.log({ action: 'Exported all data', entityType: 'data', entityRef: 'Data' });
  return out;
}
