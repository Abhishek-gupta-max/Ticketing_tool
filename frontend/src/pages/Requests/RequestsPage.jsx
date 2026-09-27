import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { requestService } from '../../services/requestService';
import { ticketService } from '../../services/ticketService';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useToast } from '../../context/ToastContext';
import { useNow } from '../../hooks';
import Icon from '../../components/common/Icon';
import { Kpi, Tabs, Views, Pagination } from '../../components/common/Controls';
import { Chip, Badge } from '../../components/common/Chips';
import { Skeleton, ErrorState, EmptyState } from '../../components/common/Feedback';
import Modal from '../../components/common/Modal';
import DataTable from '../../components/tables/DataTable';
import TicketTable from '../../components/tickets/TicketTable';
import CatalogGrid from '../Catalog/CatalogGrid';
import Checkout from '../Catalog/Checkout';
import { ago } from '../../utils/format';

function RequestsTab() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['requests', page], queryFn: () => requestService.list({ page, limit: 40 }), placeholderData: keepPreviousData });
  if (q.isLoading) return <Skeleton />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  return (
    <section className="panel" style={{ padding: '12px 14px' }}>
      <DataTable rows={q.data.data} rowKey={(r) => r.number} rowTo={(r) => `/requests/${r.number}`} empty="No requests yet."
        columns={[
          { key: 'n', header: 'Request', className: 'id', render: (r) => r.number },
          { key: 'f', header: 'Requested for', render: (r) => r.requestedFor.name },
          { key: 'c', header: 'Customer', render: (r) => (r.customer.isInternal ? 'Internal' : r.customer.name) },
          { key: 'i', header: 'Order items', className: 'title', render: (r) => r.itemTitles.map((x, i) => <div key={i}>{x}</div>) },
          { key: 's', header: 'State', render: (r) => <Chip cls={r.isOpen ? 'ok' : 'grey'}>{r.isOpen ? 'Open' : 'Closed'}</Chip> },
          { key: 'o', header: 'Opened', className: 'muted', render: (r) => ago(r.createdAt) },
        ]} />
      <Pagination meta={q.data.meta} onPage={setPage} />
    </section>
  );
}

function ItemsTab() {
  useNow();
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const params = { kind: 'request', page, limit: 30, sortBy: 'created', sortOrder: 'DESC', ...(status === 'pending' ? { status: 'Awaiting approval', quick: 'all' } : { quick: status === 'resolved' ? 'resolved' : status }) };
  const q = useQuery({ queryKey: ['tickets', 'items', params], queryFn: () => ticketService.list(params), placeholderData: keepPreviousData });
  return (
    <>
      <Views value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[['open', 'Open'], ['pending', 'Waiting for approval'], ['resolved', 'Fulfilled'], ['all', 'All']]} />
      <section className="panel" style={{ padding: '12px 14px' }}>
        {q.isLoading ? <Skeleton /> : q.error ? <ErrorState error={q.error} /> : <>
          <TicketTable rows={q.data.data} cols={['id', 'title', 'cust', 'pri', 'status', 'owner', 'sla', 'upd']} />
          <Pagination meta={q.data.meta} onPage={setPage} />
        </>}
      </section>
    </>
  );
}

export default function RequestsPage() {
  const { user } = useAuth();
  const { openNewTicket } = useUI();
  const toast = useToast();
  const [tab, setTab] = useState('catalog');
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkout, setCheckout] = useState(null);
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => requestService.catalog() });
  const kpis = useQuery({ queryKey: ['requests', 'kpis'], queryFn: requestService.kpis, enabled: user.isStaff });
  const k = kpis.data;

  const add = (c) => { setCart((x) => [...x, c]); toast(`${c.name} added to your cart (${cart.length + 1})`); };
  const tabs = user.isStaff ? [['catalog', 'Service catalog'], ['reqs', 'Requests'], ['items', 'Order items']] : [['catalog', 'Service catalog'], ['reqs', 'My requests']];

  return (
    <>
      <div className="ph">
        <div><h1>Service requests</h1><p>Order from the catalog. A request holds one or more order items, and each item has its own approval and tasks.</p></div>
        <div className="tools">
          <button type="button" className="btn" onClick={() => (cart.length ? setCartOpen(true) : toast('Your cart is empty. Use Add to cart on catalog items.'))}><Icon name="box" />Cart <Badge>{cart.length}</Badge></button>
          <button type="button" className="btn primary" onClick={() => openNewTicket({ kind: 'request' })}><Icon name="plus" />New ticket</button>
        </div>
      </div>
      {k ? (
        <div className="kpis">
          <Kpi label="Open order items" value={k.openItems} sub="in fulfilment" />
          <Kpi label="Waiting for approval" value={k.pending} sub="see Approvals" to="/approvals" />
          <Kpi label="Fulfilled on time" value={k.onTimePct} sub="last 30 days" unit="%" />
          <Kpi label="Open catalog tasks" value={k.openTasks} sub="across all items" to="/tasks?quick=open" />
        </div>
      ) : null}
      <Tabs value={tab} onChange={setTab} options={tabs} />
      {tab === 'catalog' ? (catalog.isLoading ? <Skeleton /> : catalog.error ? <ErrorState error={catalog.error} onRetry={catalog.refetch} /> : <CatalogGrid items={catalog.data} onOrder={(c) => setCheckout([c])} onAdd={add} />) : null}
      {tab === 'reqs' ? <RequestsTab /> : null}
      {tab === 'items' ? <ItemsTab /> : null}

      {cartOpen ? (
        <Modal title="Your cart" onClose={() => setCartOpen(false)} onSubmit={() => { setCartOpen(false); setCheckout(cart); }}
          buttons={[{ label: 'Keep shopping', onClick: () => setCartOpen(false) }, { label: 'Checkout', variant: 'primary', type: 'submit', disabled: !cart.length }]}>
          {cart.length ? (
            <ul className="plain">
              {cart.map((c, i) => (
                <li key={`${c.id}-${i}`}><div><b>{c.name}</b><span className="s">{c.requiresApproval ? 'Needs approval' : 'No approval needed'}</span></div>
                  <button type="button" className="btn sm" onClick={() => setCart((x) => x.filter((_, j) => j !== i))}>Remove</button></li>
              ))}
            </ul>
          ) : <EmptyState>Cart is empty.</EmptyState>}
        </Modal>
      ) : null}
      {checkout ? <Checkout items={checkout} onClose={() => setCheckout(null)} onDone={() => { if (checkout === cart) setCart([]); }} /> : null}
    </>
  );
}
