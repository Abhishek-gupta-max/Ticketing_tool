import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { auditService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import Icon from '../../components/common/Icon';
import { Pagination, SearchBox } from '../../components/common/Controls';
import { Skeleton, ErrorState, EmptyState } from '../../components/common/Feedback';
import { Select } from '../../components/forms/Field';
import { dtime } from '../../utils/format';

const TYPES = ['ticket', 'task', 'problem', 'change', 'request', 'asset', 'article', 'user', 'team', 'customer', 'person', 'settings', 'catalog', 'report', 'automation', 'data'];
const ROUTES = { ticket: 'tickets', problem: 'problems', change: 'changes', task: 'tasks', article: 'kb', asset: 'assets', request: 'requests' };

const short = (v) => (v == null ? '' : typeof v === 'object' ? Object.entries(v).map(([k, x]) => `${k}: ${typeof x === 'object' ? JSON.stringify(x) : x}`).join(', ') : String(v));

/** Read-only audit trail. Entries cannot be edited or deleted (database triggers enforce this). */
export default function AuditTab() {
  const toast = useToast();
  const [f, setF] = useState({ search: '', entityType: '' });
  const [page, setPage] = useState(1);
  const params = { page, limit: 50, ...(f.search ? { search: f.search } : {}), ...(f.entityType ? { entityType: f.entityType } : {}) };
  const q = useQuery({ queryKey: ['audit', params], queryFn: () => auditService.list(params), placeholderData: keepPreviousData });
  return (
    <section className="panel">
      <div className="head-row"><div><h2>Audit log</h2><p className="sub">Every important change, who made it, when and from where. Entries are append-only.</p></div>
        <button type="button" className="btn sm" onClick={() => auditService.exportCsv({ search: f.search || undefined, entityType: f.entityType || undefined }).then(() => toast('Download started'), (e) => toast(e.message))}><Icon name="download" />Export CSV</button></div>
      <div className="toolbar">
        <SearchBox value={f.search} onChange={(v) => { setF({ ...f, search: v }); setPage(1); }} placeholder="Search action or record" label="Search the audit log" />
        <Select aria-label="Record type" blank="All record types" options={TYPES} value={f.entityType} onChange={(e) => { setF({ ...f, entityType: e.target.value }); setPage(1); }} />
      </div>
      {q.isLoading ? <Skeleton rows={10} /> : q.error ? <ErrorState error={q.error} /> : q.data.data.length ? (
        <>
          <div className="scroll"><table className="tbl"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Change</th><th>IP address</th></tr></thead>
            <tbody>{q.data.data.map((a) => (
              <tr key={a.id}>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{dtime(a.createdAt)}</td><td>{a.userName}</td><td>{a.action}</td>
                <td>{ROUTES[a.entityType] && a.entityRef ? <Link to={`/${ROUTES[a.entityType]}/${a.entityRef}`}>{a.entityRef}</Link> : a.entityRef || a.entityType}</td>
                <td className="muted" style={{ fontSize: 12.5, maxWidth: 360, overflowWrap: 'anywhere' }}>{a.oldValues ? <>{short(a.oldValues)} &rarr; </> : null}{short(a.newValues)}</td>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{a.ipAddress || '-'}</td>
              </tr>
            ))}</tbody></table></div>
          <Pagination meta={q.data.meta} onPage={setPage} />
        </>
      ) : <EmptyState>No entries match.</EmptyState>}
    </section>
  );
}
