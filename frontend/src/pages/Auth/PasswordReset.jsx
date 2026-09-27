import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthCard } from './Login';
import { Field, Input } from '../../components/forms/Field';
import { authService } from '../../services/authService';
import { isEmail, passwordProblem } from '../../validators';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!isEmail(email)) return setError('Enter a valid email address.');
    setBusy(true);
    try { setDone((await authService.forgotPassword(email.trim())).message); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <AuthCard title="Reset your password" sub="We will send a reset link to your work email.">
      {done ? <div className="banner info" role="status">{done}</div> : (
        <form onSubmit={submit} noValidate>
          <Field label="Email" error={error}>{(id) => <Input id={id} type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} />}</Field>
          <button type="submit" className="btn primary" disabled={busy}>Send reset link</button>
        </form>
      )}
      <div className="foot"><Link to="/login">Back to sign in</Link></div>
    </AuthCard>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const p = passwordProblem(pw);
    if (p) return setErrors({ pw: p });
    if (pw !== confirm) return setErrors({ confirm: 'The passwords do not match.' });
    try { setDone((await authService.resetPassword(params.get('token') || '', pw)).message); } catch (err) { setErrors({ form: err.message }); }
  };
  return (
    <AuthCard title="Choose a new password">
      {done ? <div className="banner info" role="status">{done}</div> : (
        <form onSubmit={submit} noValidate>
          {errors.form ? <div className="banner" role="alert" style={{ marginBottom: 12 }}>{errors.form}</div> : null}
          <Field label="New password" error={errors.pw} hint="At least 10 characters with a letter and a number.">{(id) => <Input id={id} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
          <Field label="Confirm password" error={errors.confirm}>{(id) => <Input id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}</Field>
          <button type="submit" className="btn primary">Change password</button>
        </form>
      )}
      <div className="foot"><Link to="/login">Back to sign in</Link></div>
    </AuthCard>
  );
}
