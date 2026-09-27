import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from '../common/Icon';
import { useTheme } from '../../context/ThemeContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { useDebounce } from '../../hooks';
import { searchService, notificationService } from '../../services/notificationService';
import { auditService } from '../../services/adminService';
import { ago } from '../../utils/format';

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const dq = useDebounce(q.trim(), 250);
  const ref = useRef(null);
  const input = useRef(null);
  const navigate = useNavigate();
  const { data = [], isFetching } = useQuery({ queryKey: ['search', dq], queryFn: () => searchService.search(dq), enabled: dq.length >= 2 });

  useEffect(() => {
    const key = (e) => { if (e.key === '/' && !e.target.closest('input,textarea,select')) { e.preventDefault(); input.current?.focus(); } };
    const off = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', key);
    document.addEventListener('mousedown', off);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', off); };
  }, []);

  const go = (href) => { setOpen(false); setQ(''); input.current?.blur(); navigate(href); };
  let group = '';
  return (
    <div className="gsearch" ref={ref}>
      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', display: 'flex' }}><Icon name="search" /></span>
      <input ref={input} type="search" placeholder="Search tickets, assets, articles   ( / )" autoComplete="off" aria-label="Search everything" value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' && data[0]) go(data[0].href); if (e.key === 'Escape') setOpen(false); }} />
      {open && q.trim().length >= 2 ? (
        <div className="sres">
          {data.length ? data.map((r) => {
            const head = r.group !== group ? <div className="grp">{r.group}</div> : null;
            group = r.group;
            return <div key={r.href}>{head}<a href={r.href} onClick={(e) => { e.preventDefault(); go(r.href); }}>{r.title}<small>{r.sub}</small></a></div>;
          }) : <div className="empty">{isFetching || dq !== q.trim() ? 'Searching...' : `No results for "${q}"`}</div>}
        </div>
      ) : null}
    </div>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const qc = useQueryClient();
  const { can } = useAuth();
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: notificationService.list, refetchInterval: 60000 });
  const { data: recent } = useQuery({ queryKey: ['recent-audit'], queryFn: () => auditService.list({ limit: 5 }).then((r) => r.data), enabled: open && can('audit:view') });

  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [open]);

  const readAll = async () => { await notificationService.markAllRead(); qc.invalidateQueries({ queryKey: ['notifications'] }); };
  const read = (n) => { if (!n.isRead) notificationService.markRead(n.id).then(() => qc.invalidateQueries({ queryKey: ['notifications'] })); setOpen(false); };
  const count = data?.count || 0;

  return (
    <div className="menuwrap" ref={ref}>
      <button type="button" className="btn icon-btn" aria-label="Notifications" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span style={{ display: 'flex' }}><Icon name="bell" /></span>
        {count ? <span className="chip bad" style={{ marginLeft: 4, padding: '0 6px' }}>{count}</span> : null}
      </button>
      {open ? (
        <div className="menu" style={{ minWidth: 330 }}>
          <div className="hd">Notifications</div>
          {data?.alerts?.length || data?.items?.length ? null : <div className="empty" style={{ padding: 14 }}>You are all caught up.</div>}
          {data?.alerts?.map((a) => <Link key={a.key} to={a.link} className={`notif ${a.severity}`} onClick={() => setOpen(false)}>{a.title}</Link>)}
          {data?.items?.length ? <>
            <div className="sep" />
            <div className="hd" style={{ display: 'flex', justifyContent: 'space-between' }}>Updates{data.unread ? <button type="button" className="link" style={{ width: 'auto', padding: 0 }} onClick={readAll}>Mark all read</button> : null}</div>
            {data.items.map((n) => (
              <Link key={n.id} to={n.link || '#'} className={`notif ${n.isRead ? '' : 'notif-unread'}`} onClick={() => read(n)}>
                {n.title}<div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{ago(n.createdAt)}</div>
              </Link>
            ))}
          </> : null}
          {recent?.length ? <>
            <div className="sep" /><div className="hd">Recent activity</div>
            {recent.map((a) => (
              <div key={a.id} style={{ padding: '6px 10px', fontSize: 13 }}>
                <b style={{ fontWeight: 500 }}>{a.userName}</b> <span className="muted">{a.action.toLowerCase()}</span> <span className="muted">{a.entityRef}</span>
                <div className="muted" style={{ fontSize: 12 }}>{ago(a.createdAt)}</div>
              </div>
            ))}
          </> : null}
        </div>
      ) : null}
    </div>
  );
}

export default function TopBar({ onMenu }) {
  const { toggle, theme } = useTheme();
  const { openNewTicket } = useUI();
  const { can } = useAuth();
  return (
    <header className="bar">
      <button type="button" className="btn menuBtn icon-btn" aria-label="Open menu" onClick={onMenu}><Icon name="menu" /></button>
      <GlobalSearch />
      <span className="grow" />
      {can('ticket:create') ? (
        <button type="button" className="btn primary" onClick={() => openNewTicket()}><span style={{ display: 'flex' }}><Icon name="plus" /></span><span className="hide-s">New ticket</span></button>
      ) : null}
      <NotificationBell />
      <button type="button" className="btn icon-btn" aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggle}><span style={{ display: 'flex' }}><Icon name="moon" /></span></button>
    </header>
  );
}
