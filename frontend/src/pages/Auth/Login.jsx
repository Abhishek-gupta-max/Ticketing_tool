import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Field, Input } from '../../components/forms/Field';
import { isEmail } from '../../validators';

export function AuthCard({ title, sub, children }) {
  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand">
          <svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#0E6F63" /><path d="M8 9h4l4 11 4-11h4l-6 15h-4z" fill="#fff" /></svg>
          <span><b>Veltrixsecure</b><span className="muted">Service Desk</span></span>
        </div>
        <h1>{title}</h1>
        {sub ? <p className="muted" style={{ marginBottom: 16 }}>{sub}</p> : null}
        {children}
      </div>
    </div>
  );
}

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Development convenience only: frontend/.env.development can pre-fill the form.
  // In production builds import.meta.env.DEV is false and these values are dropped.
  const [email, setEmail] = useState(import.meta.env.DEV ? import.meta.env.VITE_DEV_LOGIN_EMAIL || '' : '');
  const [password, setPassword] = useState(import.meta.env.DEV ? import.meta.env.VITE_DEV_LOGIN_PASSWORD || '' : '');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!isEmail(email)) errs.email = 'Enter a valid email address.';
    if (!password) errs.password = 'Enter your password.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Sign in" sub="Use your work email and password.">
      <form onSubmit={submit} noValidate>
        {errors.form ? <div className="banner" role="alert" style={{ marginBottom: 12 }}>{errors.form}</div> : null}
        <Field label="Email" error={errors.email}>{(id) => <Input id={id} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={errors.email ? 'true' : undefined} />}</Field>
        <Field label="Password" error={errors.password}>{(id) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={errors.password ? 'true' : undefined} />}</Field>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner" aria-hidden="true" /> : null}Sign in</button>
        <div className="foot"><Link to="/forgot-password">Forgot your password?</Link></div>
      </form>
    </AuthCard>
  );
}
