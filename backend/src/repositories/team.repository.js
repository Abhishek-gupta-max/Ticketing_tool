import { query, queryOne } from '../config/database.js';

export const teamsOfUser = (userId) => query(
  `SELECT t.id, t.code, t.name, t.type, tm.is_on_call AS isOnCall
     FROM team_members tm JOIN teams t ON t.id = tm.team_id
    WHERE tm.user_id = ? ORDER BY t.name`,
  [userId],
);

export const listTeams = () => query(
  `SELECT t.id, t.code, t.name, t.type, t.description, t.email, t.manager_id, m.name AS manager_name, t.is_active,
          (SELECT COUNT(*) FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.team_id = t.id AND u.status = 'active') AS member_count,
          (SELECT COUNT(*) FROM tickets k WHERE k.team_id = t.id AND k.deleted_at IS NULL AND k.status IN ('New','In Progress','On Hold','Awaiting approval')) AS open_tickets,
          (SELECT COUNT(*) FROM tasks k WHERE k.team_id = t.id AND k.state NOT IN ('Done','Not done','Not needed')) AS open_tasks
     FROM teams t LEFT JOIN users m ON m.id = t.manager_id
    ORDER BY t.id`,
);

export const findById = (id, conn) => queryOne('SELECT * FROM teams WHERE id = ?', [id], conn);
export const findByCode = (code, conn) => queryOne('SELECT * FROM teams WHERE code = ?', [code], conn);
export const findByName = (name) => queryOne('SELECT * FROM teams WHERE LOWER(name) = LOWER(?)', [name]);

export const members = (teamId, conn) => query(
  `SELECT u.id, u.name, u.email, r.name AS role, u.status, tm.is_on_call,
          (SELECT GROUP_CONCAT(t2.name ORDER BY t2.name SEPARATOR ', ') FROM team_members x JOIN teams t2 ON t2.id = x.team_id
            WHERE x.user_id = u.id AND x.team_id <> tm.team_id) AS other_teams
     FROM team_members tm JOIN users u ON u.id = tm.user_id JOIN roles r ON r.id = u.role_id
    WHERE tm.team_id = ? ORDER BY u.name`,
  [teamId],
  conn,
);

export const activeMemberIds = async (teamId, conn) => (await query(
  "SELECT tm.user_id FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.team_id = ? AND u.status = 'active'",
  [teamId],
  conn,
)).map((r) => r.user_id);

export const isMember = async (teamId, userId, conn) => !!(await queryOne(
  'SELECT 1 AS x FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, userId], conn,
));

/** First active on-call member of a team. */
export async function onCallFor(teamId, conn) {
  const row = await queryOne(
    `SELECT tm.user_id FROM team_members tm JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ? AND tm.is_on_call = 1 AND u.status = 'active' ORDER BY tm.created_at LIMIT 1`,
    [teamId],
    conn,
  );
  return row?.user_id || null;
}

export async function anyOnCall(conn) {
  const row = await queryOne(
    `SELECT tm.user_id FROM team_members tm JOIN users u ON u.id = tm.user_id JOIN teams t ON t.id = tm.team_id
      WHERE tm.is_on_call = 1 AND u.status = 'active' AND t.is_active = 1 ORDER BY t.id LIMIT 1`,
    [],
    conn,
  );
  return row?.user_id || null;
}

export const onCallList = () => query(
  `SELECT u.id, u.name, u.email, t.id AS team_id, t.name AS team_name
     FROM team_members tm JOIN users u ON u.id = tm.user_id JOIN teams t ON t.id = tm.team_id
    WHERE tm.is_on_call = 1 AND u.status = 'active' AND t.is_active = 1 AND t.type = 'Support'
    ORDER BY t.id`,
);

/** Least busy active member: open tickets plus open tasks. */
export async function leastBusyMember(teamId, conn) {
  const row = await queryOne(
    `SELECT u.id,
            (SELECT COUNT(*) FROM tickets k WHERE k.assigned_to = u.id AND k.deleted_at IS NULL AND k.status IN ('New','In Progress','On Hold','Awaiting approval'))
          + (SELECT COUNT(*) FROM tasks s WHERE s.assigned_to = u.id AND s.state NOT IN ('Done','Not done','Not needed')) AS load_count
       FROM team_members tm JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ? AND u.status = 'active'
      ORDER BY load_count ASC, u.id ASC LIMIT 1`,
    [teamId],
    conn,
  );
  return row?.id || null;
}

export async function create(t, conn) {
  const res = await query(
    'INSERT INTO teams (code, name, type, description, email, manager_id) VALUES (?, ?, ?, ?, ?, ?)',
    [t.code, t.name, t.type, t.description || null, t.email || null, t.managerId || null],
    conn,
  );
  return res.insertId;
}

export const update = (id, t, conn) => query(
  'UPDATE teams SET name = ?, type = ?, description = ?, email = ?, manager_id = ? WHERE id = ?',
  [t.name, t.type, t.description || null, t.email || null, t.managerId || null, id],
  conn,
);

export const setActive = (id, active) => query('UPDATE teams SET is_active = ? WHERE id = ?', [active ? 1 : 0, id]);
export const remove = (id, conn) => query('DELETE FROM teams WHERE id = ?', [id], conn);
export const addMember = (teamId, userId, conn) => query('INSERT IGNORE INTO team_members (team_id, user_id) VALUES (?, ?)', [teamId, userId], conn);
export const removeMember = (teamId, userId, conn) => query('DELETE FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, userId], conn);
export const setOnCall = (teamId, userId, on) => query('UPDATE team_members SET is_on_call = ? WHERE team_id = ? AND user_id = ?', [on ? 1 : 0, teamId, userId]);
export const countTeamsOfUser = async (userId, conn) => (await queryOne('SELECT COUNT(*) AS n FROM team_members WHERE user_id = ?', [userId], conn)).n;

export async function referenceCount(teamId) {
  const row = await queryOne(
    `SELECT (SELECT COUNT(*) FROM tickets WHERE team_id = ?) + (SELECT COUNT(*) FROM tasks WHERE team_id = ?)
          + (SELECT COUNT(*) FROM assets WHERE support_team_id = ?) + (SELECT COUNT(*) FROM ticket_categories WHERE default_team_id = ?) AS n`,
    [teamId, teamId, teamId, teamId],
  );
  return row.n;
}

export const routedCategories = (teamId) => query('SELECT name FROM ticket_categories WHERE default_team_id = ? ORDER BY sort_order', [teamId]);
export const supportedAssetCount = async (teamId) => (await queryOne('SELECT COUNT(*) AS n FROM assets WHERE support_team_id = ? AND deleted_at IS NULL', [teamId])).n;
