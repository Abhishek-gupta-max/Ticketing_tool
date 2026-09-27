import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authService } from '../services/authService';
import { setUnauthorizedHandler } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready
  const qc = useQueryClient();

  useEffect(() => {
    authService.me().then(setUser).catch(() => setUser(null)).finally(() => setStatus('ready'));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { setUser(null); qc.clear(); });
  }, [qc]);

  const login = useCallback(async (email, password) => {
    const u = await authService.login(email, password);
    qc.clear();
    setUser(u);
    return u;
  }, [qc]);

  const logout = useCallback(async (everywhere = false) => {
    try { await (everywhere ? authService.logoutAll() : authService.logout()); } finally { setUser(null); qc.clear(); }
  }, [qc]);

  const value = useMemo(() => {
    const perms = new Set(user?.permissions || []);
    return { user, status, login, logout, setUser, can: (p) => perms.has(p) };
  }, [user, status, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
