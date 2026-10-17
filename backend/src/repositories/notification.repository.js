import { insertIgnore, find, count, updateOne, updateMany } from '../config/database.js';

export const insert = (n, conn) => insertIgnore('notifications', {
  user_id: n.userId, type: n.type, severity: n.severity || 'info', title: n.title.slice(0, 255), link: n.link || null, dedupe_key: n.dedupeKey || null,
}, conn);

export const listForUser = (userId, limit = 20) => find(
  'notifications',
  { user_id: userId },
  { sort: { created_at: -1, id: -1 }, limit, projection: { id: 1, type: 1, severity: 1, title: 1, link: 1, is_read: 1, created_at: 1 } },
);

export const unreadCount = (userId) => count('notifications', { user_id: userId, is_read: 0 });
export const markRead = (id, userId) => updateOne('notifications', { id, user_id: userId }, { is_read: 1, read_at: new Date() });
export const markAllRead = (userId) => updateMany('notifications', { user_id: userId, is_read: 0 }, { is_read: 1, read_at: new Date() });
