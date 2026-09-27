import { get, post, patch } from './api';

export const notificationService = {
  list: () => get('/notifications').then((r) => r.data),
  markRead: (id) => patch(`/notifications/${id}/read`),
  markAllRead: () => post('/notifications/read-all'),
};

export const searchService = {
  search: (q) => get('/search', { q }).then((r) => r.data),
};
