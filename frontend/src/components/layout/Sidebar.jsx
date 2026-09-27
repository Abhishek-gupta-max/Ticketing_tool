import { NavLink, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Icon from '../common/Icon';
import UserMenu from './UserMenu';
import { NAV } from '../../constants';
import { useAuth } from '../../context/AuthContext';
import { useMeta } from '../../hooks';
import { get } from '../../services/api';

export default function Sidebar({ open, onNavigate }) {
  const { can, user } = useAuth();
  const meta = useMeta();
  const { data: counts } = useQuery({ queryKey: ['nav'], queryFn: () => get('/nav-counts').then((r) => r.data), refetchInterval: 60000, enabled: !!user });
  const home = can('dashboard:view') ? '/overview' : '/tickets';

  return (
    <aside className={`side${open ? ' open' : ''}`} id="side">
      <Link className="brand" to={home} aria-label="Veltrixsecure Service Desk, overview" onClick={onNavigate}>
        <svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#0E6F63" /><path d="M8 9h4l4 11 4-11h4l-6 15h-4z" fill="#fff" /></svg>
        <span><b>{meta?.organisation?.name || 'Veltrixsecure'}</b><span>Service Desk</span></span>
      </Link>
      <nav className="nav" aria-label="Main">
        {NAV.map(([group, items]) => {
          const visible = items.filter(([, , , perm]) => can(perm));
          if (!visible.length) return null;
          return (
            <div key={group} style={{ display: 'contents' }}>
              <small>{group}</small>
              {visible.map(([icon, label, to, , countKey]) => {
                const n = countKey ? counts?.[countKey] : null;
                const title = !user?.isStaff && to === '/tickets' ? 'My tickets' : label;
                return (
                  <NavLink key={to} to={to} onClick={onNavigate}>
                    <Icon name={icon} /><span>{title}</span>
                    {n != null ? <span className={`n${countKey === 'incidents' && counts?.majorActive ? ' hot' : ''}`}>{n}</span> : null}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>
      <UserMenu />
    </aside>
  );
}
