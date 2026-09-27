import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { assetService } from '../../services/assetService';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useAction, useNow } from '../../hooks';
import Icon from '../../components/common/Icon';
import { Chip, CritChip, AssetStatusChip, ChangeChip } from '../../components/common/Chips';
import { PageSkeleton, ErrorState, NotFound, EmptyState } from '../../components/common/Feedback';
import TicketTable from '../../components/tickets/TicketTable';
import AssetDialog from './AssetDialog';
import { WarrantyChip } from './AssetList';
import { dshort } from '../../utils/format';

const Person = ({ p }) => (p ? <>{p.name}{p.jobTitle ? <div className="muted" style={{ fontSize: 12 }}>{p.jobTitle}{p.department ? `, ${p.department}` : ''}</div> : null}</> : <span className="muted">Not set</span>);

export default function AssetDetails() {
  useNow();
  const { tag } = useParams();
  const { can } = useAuth();
  const { openNewTicket, confirm } = useUI();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const q = useQuery({ queryKey: ['asset', tag], queryFn: () => assetService.get(tag) });
  const del = useAction(() => assetService.remove(tag), { invalidate: ['assets', 'asset-options'], onSuccess: () => navigate('/assets') });
  if (q.isLoading) return <PageSkeleton />;
  if (q.error?.status === 404) return <NotFound what={`Asset ${tag}`} back="/assets" backLabel="Back to assets" />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const a = q.data;
  const open = a.openTicketList;
  const direct = a.dependents.filter((d) => d.direct);
  const sub = a.type.isSubscription;

  return (
    <>
      <div className="crumb"><Link to="/assets">Assets</Link> / {a.tag}</div>
      <div className="ph" style={{ marginBottom: 12 }}>
        <div><div className="chips"><span className="id">{a.tag}</span><Chip>{a.type.name}</Chip><CritChip c={a.criticality} /><AssetStatusChip s={a.status} /><Chip>{a.environment}</Chip></div><h1 className="dtitle">{a.name}</h1></div>
        <div className="tools">
          {can('ticket:create') ? <button type="button" className="btn" onClick={() => openNewTicket({ title: `Issue with ${a.name}`, assetId: a.id, customerId: a.customer.isInternal ? undefined : a.customer.id, requesterId: a.assignedTo?.id })}>Report an issue</button> : null}
          {can('asset:update') ? <button type="button" className="btn" onClick={() => setEditing(true)}><Icon name="edit" />Edit</button> : null}
          {can('asset:delete') ? <button type="button" className="btn danger" onClick={async () => { if (await confirm({ title: 'Delete asset', message: `Delete ${a.name}? Tickets keep their history.`, confirmLabel: 'Delete', danger: true })) del.mutate(); }}><Icon name="trash" />Delete</button> : null}
        </div>
      </div>
      {!a.owner ? <div className="banner warn"><div><b>No {a.ownerLabel.toLowerCase()} is set.</b> Tickets about this item will not know who to contact.</div>{can('asset:update') ? <button type="button" className="btn sm" onClick={() => setEditing(true)}>Set owner</button> : null}</div> : null}
      {open.length && ['Critical', 'High'].includes(a.criticality) ? (
        <div className="banner warn"><div><b>{open.length} open ticket{open.length > 1 ? 's' : ''} on a {a.criticality.toLowerCase()} asset.</b>{a.dependents.length ? ` ${a.dependents.length} other assets depend on it.` : ''} Contact {a.owner?.name || 'the owner'}{a.supportTeam ? ` or the ${a.supportTeam.name} team` : ''}.</div></div>
      ) : null}
      <div className="dgrid">
        <div>
          <section className="panel"><h2>Open tickets</h2><p className="sub">{open.length} open, {a.ticketTotal} in total.</p>
            {open.length ? <TicketTable rows={open} cols={['id', 'title', 'pri', 'status', 'sla']} /> : <EmptyState>No open tickets on this asset.</EmptyState>}</section>
          {a.devices.length ? <section className="panel" style={{ marginTop: 16 }}><h2>Devices assigned to this item</h2>{a.devices.map((x) => <div className="linkrow" key={x.tag}><Link to={`/assets/${x.tag}`}>{x.name}</Link></div>)}</section> : null}
          <section className="panel" style={{ marginTop: 16 }}><h2>Ticket history</h2><p className="sub">Most recent {a.resolvedTickets.length} resolved.</p>
            {a.resolvedTickets.length ? <TicketTable rows={a.resolvedTickets} cols={['id', 'title', 'pri', 'status', 'upd']} /> : <EmptyState>Nothing resolved yet.</EmptyState>}</section>
          <section className="panel" style={{ marginTop: 16 }}><h2>Changes</h2>
            {a.changes.length ? a.changes.map((c) => <div className="linkrow" key={c.number}><Link to={`/changes/${c.number}`}>{c.number}: {c.title}</Link><span className="tools"><ChangeChip c={c} /><span className="muted">{dshort(c.plannedStart)}</span></span></div>) : <p className="muted" style={{ marginTop: 8 }}>No changes planned or made.</p>}</section>
        </div>
        <div className="side-col">
          <section className="panel"><h2>Ownership</h2>
            <dl className="props" style={{ marginTop: 12, gridTemplateColumns: '110px minmax(0,1fr)' }}>
              <dt>{sub ? 'Application owner' : 'Device owner'}</dt><dd><Person p={sub ? a.ownedBy : a.assignedTo} /></dd>
              <dt>{sub ? 'Primary user' : 'Business owner'}</dt><dd><Person p={sub ? a.assignedTo : a.ownedBy} /></dd>
              <dt>Managed by</dt><dd>{a.managedBy?.name || <span className="muted">Not set</span>}</dd>
              <dt>Support group</dt><dd>{a.supportTeam?.name || <span className="muted">Not set</span>}</dd>
            </dl>
          </section>
          <section className="panel"><h2>Details</h2>
            <dl className="props" style={{ marginTop: 12, gridTemplateColumns: '100px minmax(0,1fr)' }}>
              <dt>Customer</dt><dd>{a.customer.name}</dd><dt>Environment</dt><dd>{a.environment}</dd><dt>Location</dt><dd>{a.location || '-'}</dd>
              <dt>Department</dt><dd>{a.department || '-'}</dd><dt>Address or serial</dt><dd>{a.serialNumber || '-'}</dd><dt>Platform</dt><dd>{a.platform || '-'}</dd>
              <dt>Purchased</dt><dd>{a.purchaseDate || '-'}</dd><dt>Warranty</dt><dd><WarrantyChip a={a} /></dd>
            </dl>
            {a.notes ? <p className="desc muted" style={{ marginTop: 10 }}>{a.notes}</p> : null}
          </section>
          <section className="panel"><h2>Depends on</h2>
            {a.dependsOn.length ? a.dependsOn.map((d) => <div className="linkrow" key={d.tag}><Link to={`/assets/${d.tag}`}>{d.name}</Link><CritChip c={d.criticality} /></div>) : <p className="muted" style={{ marginTop: 8 }}>No dependencies recorded.</p>}
          </section>
          <section className="panel"><h2>Impact if it fails</h2><p className="sub">{direct.length} directly and {a.dependents.length} in total depend on this asset.</p>
            {a.dependents.length ? a.dependents.map((d) => <div className="linkrow" key={d.tag}><Link to={`/assets/${d.tag}`}>{d.name}</Link><span className="muted">{d.ownerName || 'Not set'}</span></div>) : <p className="muted">Nothing else relies on it.</p>}
          </section>
        </div>
      </div>
      {editing ? <AssetDialog asset={a} onClose={() => setEditing(false)} /> : null}
    </>
  );
}
