import { query } from '../config/database.js';

/** Global search across records the user may see (4 results per group). */
export async function search(q, user) {
  const term = String(q || '').trim();
  if (term.length < 2) return [];
  const s = `%${term}%`;
  const out = [];
  const add = (group, rows, fn) => rows.forEach((r) => out.push({ group, ...fn(r) }));

  const scope = user.can('ticket:view_all') ? '' : 'AND t.requester_id = ?';
  const scopeP = user.can('ticket:view_all') ? [] : [user.personId || -1];
  add('Tickets', await query(
    `SELECT t.ticket_number, t.title FROM tickets t JOIN people p ON p.id = t.requester_id
      WHERE t.deleted_at IS NULL ${scope} AND (t.ticket_number LIKE ? OR t.title LIKE ? OR p.name LIKE ?) ORDER BY t.created_at DESC LIMIT 4`,
    [...scopeP, s, s, s],
  ), (r) => ({ href: `/tickets/${r.ticket_number}`, title: r.title, sub: r.ticket_number }));

  if (user.isStaff) {
    add('Problems', await query('SELECT problem_number, title FROM problems WHERE deleted_at IS NULL AND (problem_number LIKE ? OR title LIKE ?) LIMIT 4', [s, s]),
      (r) => ({ href: `/problems/${r.problem_number}`, title: r.title, sub: r.problem_number }));
    add('Changes', await query('SELECT change_number, title FROM changes WHERE deleted_at IS NULL AND (change_number LIKE ? OR title LIKE ?) LIMIT 4', [s, s]),
      (r) => ({ href: `/changes/${r.change_number}`, title: r.title, sub: r.change_number }));
    add('Tasks', await query('SELECT task_number, title FROM tasks WHERE task_number LIKE ? OR title LIKE ? LIMIT 4', [s, s]),
      (r) => ({ href: `/tasks/${r.task_number}`, title: r.title, sub: r.task_number }));
    add('Requests', await query(
      `SELECT r.request_number, p.name, (SELECT COUNT(*) FROM request_items i WHERE i.request_id = r.id) AS n FROM requests r JOIN people p ON p.id = r.requested_for_id
        WHERE r.request_number LIKE ? OR p.name LIKE ? ORDER BY r.id DESC LIMIT 4`, [s, s]),
    (r) => ({ href: `/requests/${r.request_number}`, title: `Request ${r.request_number} (${r.n} item${r.n === 1 ? '' : 's'})`, sub: r.name }));
    add('Assets', await query(
      `SELECT a.asset_tag, a.name, ty.name AS type FROM assets a JOIN asset_types ty ON ty.id = a.asset_type_id
         LEFT JOIN people ap ON ap.id = a.assigned_person_id LEFT JOIN people op ON op.id = a.owner_person_id
        WHERE a.deleted_at IS NULL AND (a.asset_tag LIKE ? OR a.name LIKE ? OR a.serial_number LIKE ? OR ap.name LIKE ? OR op.name LIKE ?) LIMIT 4`, [s, s, s, s, s]),
    (r) => ({ href: `/assets/${r.asset_tag}`, title: r.name, sub: r.type }));
  }
  const kbScope = user.can('kb:view_internal') ? '' : "AND k.audience = 'Public' AND k.status = 'Published'";
  add('Knowledge base', await query(
    `SELECT k.article_number, k.title FROM knowledge_articles k WHERE k.deleted_at IS NULL ${kbScope}
       AND (k.title LIKE ? OR EXISTS (SELECT 1 FROM knowledge_article_tags g WHERE g.article_id = k.id AND g.tag LIKE ?)) LIMIT 4`, [s, s]),
  (r) => ({ href: `/kb/${r.article_number}`, title: r.title, sub: r.article_number }));
  return out;
}
