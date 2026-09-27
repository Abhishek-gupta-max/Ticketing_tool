import { Select } from '../../components/forms/Field';
import { SearchBox } from '../../components/common/Controls';
import { useMeta } from '../../hooks';
import { useAuth } from '../../context/AuthContext';
import { PRI_OPTIONS } from '../../constants';

/** Toolbar filters. All filtering happens on the server. */
export default function TicketFilters({ f, set, onClear }) {
  const meta = useMeta();
  const { user } = useAuth();
  if (!user.isStaff) {
    return (
      <div className="toolbar">
        <SearchBox value={f.search} onChange={(v) => set({ search: v })} placeholder="Search ID or summary" label="Search tickets" />
        <Select aria-label="Type" blank="All types" options={[['incident', 'Incidents'], ['request', 'Requests']]} value={f.kind} onChange={(e) => set({ kind: e.target.value })} />
      </div>
    );
  }
  return (
    <div className="toolbar">
      <SearchBox value={f.search} onChange={(v) => set({ search: v })} placeholder="Search ID, summary, requester or customer" label="Search tickets" />
      <Select aria-label="Type" blank="All types" options={[['incident', 'Incidents'], ['request', 'Requests']]} value={f.kind} onChange={(e) => set({ kind: e.target.value })} />
      <Select aria-label="Priority" blank="Any priority" options={PRI_OPTIONS} value={f.priority} onChange={(e) => set({ priority: e.target.value })} />
      <Select aria-label="Team" blank="All groups" options={(meta?.teams || []).filter((t) => t.isActive && t.type === 'Support').map((t) => [t.id, t.name])} value={f.teamId} onChange={(e) => set({ teamId: e.target.value })} />
      <Select aria-label="Assigned to" blank="Anyone" options={[['none', 'Unassigned'], ...(meta?.agents || []).map((a) => [a.id, a.id === user.id ? 'You' : a.name])]} value={f.assignee} onChange={(e) => set({ assignee: e.target.value })} />
      <Select aria-label="Customer" blank="All customers" options={(meta?.customers || []).map((c) => [c.id, c.name])} value={f.customerId} onChange={(e) => set({ customerId: e.target.value })} />
      <Select aria-label="Category" blank="All categories" options={(meta?.categories || []).map((c) => [c.id, c.name])} value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })} />
      <input className="inp" type="date" aria-label="Created from" value={f.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} title="Created from" />
      <input className="inp" type="date" aria-label="Created until" value={f.dateTo} onChange={(e) => set({ dateTo: e.target.value })} title="Created until" />
      <button type="button" className="btn sm" onClick={onClear}>Clear filters</button>
    </div>
  );
}
