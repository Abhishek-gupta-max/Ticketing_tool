import { createElement, useEffect, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { metaService } from '../services/adminService';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

/** Reference data (categories, agents, teams, SLA, codes) from the API. */
export function useMeta() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['meta', user?.id], queryFn: metaService.get, enabled: !!user, staleTime: 5 * 60000 });
  return q.data;
}

export function useDebounce(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Re-render every `ms` so relative times and SLA labels stay current. */
export function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/**
 * Mutation that shows the server message as a toast and refreshes the given
 * query keys. Errors are toasted unless onError handles them.
 */
export function useAction(fn, { invalidate = [], success, onSuccess, onError } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (res, vars) => {
      await Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: Array.isArray(k) ? k : [k] })));
      qc.invalidateQueries({ queryKey: ['nav'] });
      const msg = typeof success === 'function' ? success(res, vars) : success ?? res?.message;
      if (msg) toast(msg);
      onSuccess?.(res, vars);
    },
    onError: (err, vars) => { if (!onError || onError(err, vars) !== false) toast(err.message); },
  });
}

/** Simple form state with server field errors. */
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const set = useCallback((k, v) => { setValues((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); }, []);
  const bind = (k) => ({ value: values[k] ?? '', onChange: (e) => set(k, e.target.type === 'checkbox' ? e.target.checked : e.target.value), 'aria-invalid': errors[k] ? 'true' : undefined });
  const fromError = (err) => setErrors(err?.fields || {});
  return { values, setValues, set, bind, errors, setErrors, fromError };
}

/**
 * Render a form only once reference data has loaded, so initial form values
 * (default customer, category, team...) are computed from real data.
 */
export function withMeta(Component) {
  function WithMeta(props) {
    const meta = useMeta();
    return meta ? createElement(Component, props) : null;
  }
  WithMeta.displayName = `withMeta(${Component.name})`;
  return WithMeta;
}
