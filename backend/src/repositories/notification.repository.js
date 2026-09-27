import { query, queryOne } from '../config/database.js';

export const insert = (n, conn) => query(
  'INSERT IGNORE INTO notifications (user_id, type, severity, title, link, dedupe_key) VALUES (?, ?, ?, ?, ?, ?)',
  [n.userId, n.type, n.severity || 'info', n.title.slice(0, 255), n.link || null, n.dedupeKey || null],
  conn,
);

export const listForUser = (userId, limit = 20) => query(
  'SELECT id, type, severity, title, link, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?',
  [userId, limit],
);

export const unreadCount = async (userId) => (await queryOne('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', [userId])).n;
export const markRead = (id, userId) => query('UPDATE notifications SET is_read = 1, read_at = UTC_TIMESTAMP(3) WHERE id = ? AND user_id = ?', [id, userId]);
export const markAllRead = (userId) => query('UPDATE notifications SET is_read = 1, read_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND is_read = 0', [userId]);
