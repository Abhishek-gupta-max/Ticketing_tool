import { get, post } from './api';

export const authService = {
  me: () => get('/auth/me').then((r) => r.data),
  login: (email, password) => post('/auth/login', { email, password }).then((r) => r.data),
  logout: () => post('/auth/logout'),
  logoutAll: () => post('/auth/logout-all'),
  forgotPassword: (email) => post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => post('/auth/reset-password', { token, password }),
  changePassword: (currentPassword, newPassword) => post('/auth/change-password', { currentPassword, newPassword }),
};
