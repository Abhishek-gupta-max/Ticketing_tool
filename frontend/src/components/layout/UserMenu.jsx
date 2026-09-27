import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { initials } from '../../utils/format';
import ChangePasswordDialog from '../modals/ChangePasswordDialog';

// Replaces the demo "Act as" switcher of the original with the real signed-in user.
export default function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [open]);

  if (!user) return null;
  const team = user.teams?.find((t) => t.id === user.primaryTeamId)?.name || (user.isStaff ? '' : 'Customer portal');
  const signOut = async (all) => { await logout(all); navigate('/login'); };

  return (
    <div className="mewrap menuwrap" ref={ref}>
      {open ? (
        <div className="menu up">
          <div className="hd">{user.email}</div>
          <button type="button" onClick={() => { setOpen(false); setPwd(true); }}>Change password</button>
          <div className="sep" />
          <button type="button" onClick={() => signOut(false)}>Sign out</button>
          <button type="button" onClick={() => signOut(true)}>Sign out of all devices</button>
        </div>
      ) : null}
      <button type="button" className="me" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)} aria-label="Account menu">
        <i>{initials(user.name)}</i>
        <div><b>{user.name}</b><span>{user.role}{team ? ` · ${team}` : ''}</span></div>
      </button>
      {pwd ? <ChangePasswordDialog onClose={() => setPwd(false)} /> : null}
    </div>
  );
}
