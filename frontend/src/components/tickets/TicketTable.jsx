import DataTable from '../tables/DataTable';
import { PriorityChip, StatusChip, OwnerCell, SlaText, Chip } from '../common/Chips';
import { ago } from '../../utils/format';
import { useAuth } from '../../context/AuthContext';

/**
 * The ticket table used across the app (tickets, overview, incidents,
 * problems, assets). cols picks columns like the original TCOLS.
 */
export default function TicketTable({ rows, cols = ['id', 'title', 'cust', 'pri', 'status', 'owner', 'sla', 'upd'], compact, sort, onSort, selected, onSelect, onSelectAll, empty }) {
  const { user } = useAuth();
  const allSel = rows?.length && selected && rows.every((t) => selected.has(t.number));
  const C = {
    sel: { key: 'sel', header: <input type="checkbox" aria-label="Select all on this page" checked={!!allSel} onChange={(e) => onSelectAll(e.target.checked)} />, width: 34,
      render: (t) => <input type="checkbox" aria-label={`Select ${t.number}`} checked={selected?.has(t.number) || false} onChange={(e) => onSelect(t.number, e.target.checked)} /> },
    id: { key: 'id', header: 'ID', sort: 'created', className: 'id', render: (t) => <>{t.number}{t.isMajor ? <> <Chip cls="bad" title="Major incident">Major</Chip></> : null}</> },
    title: { key: 'title', header: 'Summary', sort: 'title', className: `title${compact ? ' cp' : ''}`,
      render: (t) => <>{t.title}<small>{compact ? `${t.number} · ${t.category.name}` : `${t.kind === 'request' ? 'Request' : 'Incident'} · ${t.category.name}`}</small></> },
    cust: { key: 'cust', header: 'Customer', sort: 'customer', render: (t) => <span style={{ whiteSpace: 'nowrap' }}>{t.customer.isInternal ? 'Internal' : t.customer.name}<small className="muted" style={{ display: 'block', fontSize: 12 }}>{t.requester.name}</small></span> },
    pri: { key: 'pri', header: 'Priority', sort: 'priority', render: (t) => <PriorityChip p={t.priority} /> },
    status: { key: 'status', header: 'State', sort: 'status', render: (t) => <><StatusChip s={t.status} />{t.status === 'On Hold' && t.holdReason ? <small className="muted" style={{ display: 'block', fontSize: 12 }}>{t.holdReason}</small> : null}</> },
    owner: { key: 'owner', header: 'Owner', sort: 'assignee', render: (t) => <OwnerCell user={t.assignee} meId={user?.id} /> },
    sla: { key: 'sla', header: 'SLA', sort: 'sla', render: (t) => <SlaText t={t} /> },
    upd: { key: 'upd', header: 'Updated', sort: 'updated', className: 'muted', render: (t) => <span style={{ whiteSpace: 'nowrap' }}>{ago(t.updatedAt)}</span> },
  };
  return (
    <DataTable
      columns={cols.map((c) => C[c])}
      rows={rows}
      rowKey={(t) => t.number}
      rowTo={(t) => `/tickets/${t.number}`}
      sort={sort}
      onSort={onSort}
      empty={empty || 'No tickets match. Try clearing a filter.'}
    />
  );
}
