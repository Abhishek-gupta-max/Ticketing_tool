import { useMemo, useState } from 'react';
import { useQuery, keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { assetService } from '../../services/assetService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useMeta } from '../../hooks';
import Icon from '../../components/common/Icon';
import { Kpi, Pagination, SearchBox } from '../../components/common/Controls';
import { CritChip, AssetStatusChip, Chip } from '../../components/common/Chips';
import { Skeleton, ErrorState } from '../../components/common/Feedback';
import { Field, Select } from '../../components/forms/Field';
import Modal from '../../components/common/Modal';
import DataTable from '../../components/tables/DataTable';
import AssetDialog from './AssetDialog';
import { dshort, warrantyDays } from '../../utils/format';

export function WarrantyChip({ a }) {
  if (a.type.isSubscription) return <span className="muted">Subscription</span>;
  if (!a.warrantyEnd) return <span className="muted">-</span>;
  const d = warrantyDays(a.warrantyEnd);
  if (d < 0) return <Chip cls="bad">Expired {dshort(a.warrantyEnd)}</Chip>;
  if (d < 90) return <Chip cls="warn">Expires in {d} days</Chip>;
  return <span className="muted">{dshort(a.warrantyEnd)} {new Date(a.warrantyEnd).getFullYear()}</span>;
}

function ImportDialog({ onClose }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [file, setFile] = useState(null);
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!file) return setOut({ error: 'Choose a file.' });
    setBusy(true);
    try {
      const r = await assetService.importCsv(file);
      if (!r.data.imported) { setOut(r.data); return; }
      toast(r.message);
      qc.invalidateQueries({ queryKey: ['assets'] });
      onClose();
    } catch (e) { setOut({ error: e.message }); } finally { setBusy(false); }
  };
  return (
    <Modal title="Import assets from CSV" onClose={onClose} onSubmit={submit} busy={busy}
      buttons={[{ label: 'Download template', onClick: () => assetService.template() }, { label: 'Close', onClick: onClose }, { label: 'Import', variant: 'primary', type: 'submit' }]}>
      <p className="muted" style={{ marginBottom: 12 }}>Choose a CSV file. The first row must name the columns. Only <b>name</b> is required.</p>
      <div className="pwd" style={{ marginBottom: 12 }}>name,type,criticality,customer,location,serial,platform,warranty,device_owner_email,owner_email,managed_by_email,support_group</div>
      <Field label="CSV file" error={out?.error}>{(id) => <input id={id} className="inp" type="file" accept=".csv,text/csv" onChange={(e) => { setFile(e.target.files[0]); setOut(null); }} />}</Field>
      {out?.errors?.length ? <div className="suggest"><b>Nothing was imported.</b>{out.errors.slice(0, 6).map((e) => <div key={e}>{e}</div>)}</div> : null}
    </Modal>
  );
}

export default function AssetList() {
  const { can } = useAuth();
  const meta = useMeta();
  const toast = useToast();
  const [sp] = useSearchParams();
  const [f, setF] = useState({ search: '', typeId: '', criticality: '', status: '', customerId: '', teamId: '', ownerId: sp.get('ownerId') || '' });
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null);
  const params = useMemo(() => { const p = { page, limit: 50 }; Object.entries(f).forEach(([k, v]) => { if (v) p[k] = v; }); return p; }, [f, page]);
  const q = useQuery({ queryKey: ['assets', params], queryFn: () => assetService.list(params), placeholderData: keepPreviousData });
  const owners = useQuery({ queryKey: ['asset-owners'], queryFn: assetService.owners });
  const set = (patch) => { setF((s) => ({ ...s, ...patch })); setPage(1); };
  const k = q.data?.meta?.kpis;

  return (
    <>
      <div className="ph">
        <div><h1>Assets</h1><p>Everything the desk supports: who owns it, who looks after it, and what depends on it.</p></div>
        <div className="tools">
          <button type="button" className="btn" onClick={() => { const { page: _p, limit: _l, ...rest } = params; assetService.exportCsv(rest).then(() => toast('Download started'), (e) => toast(e.message)); }}><Icon name="download" />Export CSV</button>
          {can('asset:import') ? <button type="button" className="btn" onClick={() => setDialog('import')}><Icon name="upload" />Import CSV</button> : null}
          {can('asset:create') ? <button type="button" className="btn primary" onClick={() => setDialog('new')}><Icon name="plus" />New asset</button> : null}
        </div>
      </div>
      {k ? (
        <div className="kpis">
          <Kpi label="Total assets" value={k.total} sub={`${k.retired} retired`} />
          <Kpi label="Critical assets" value={k.critical} sub="need extra care" />
          <Kpi label="Without an owner" value={k.withoutOwner} sub="assign an owner" />
          <Kpi label="Warranty expiring" value={k.warrantyExpiring} sub="expired or within 90 days" />
          <Kpi label="With open tickets" value={k.withOpenTickets} sub="need attention" />
        </div>
      ) : null}
      <div className="toolbar">
        <SearchBox value={f.search} onChange={(v) => set({ search: v })} placeholder="Search name, ID, address or owner" label="Search assets" />
        <Select aria-label="Type" blank="All types" options={(meta?.assetTypes || []).map((t) => [t.id, t.name])} value={f.typeId} onChange={(e) => set({ typeId: e.target.value })} />
        <Select aria-label="Criticality" blank="Any criticality" options={meta?.criticalities || []} value={f.criticality} onChange={(e) => set({ criticality: e.target.value })} />
        <Select aria-label="Status" blank="Any status" options={meta?.assetStatuses || []} value={f.status} onChange={(e) => set({ status: e.target.value })} />
        <Select aria-label="Customer" blank="All customers" options={(meta?.customers || []).map((c) => [c.id, c.name])} value={f.customerId} onChange={(e) => set({ customerId: e.target.value })} />
        <Select aria-label="Support group" blank="Any support group" options={(meta?.teams || []).filter((t) => t.type === 'Support').map((t) => [t.id, t.name])} value={f.teamId} onChange={(e) => set({ teamId: e.target.value })} />
        <Select aria-label="Owner" blank="Any owner" options={(owners.data || []).map((p) => [p.id, p.name])} value={f.ownerId} onChange={(e) => set({ ownerId: e.target.value })} />
      </div>
      <section className="panel" style={{ padding: '12px 14px' }}>
        {q.isLoading ? <Skeleton rows={10} /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
          <>
            <DataTable rows={q.data.data} rowKey={(a) => a.tag} rowTo={(a) => `/assets/${a.tag}`} empty="No assets match your filters."
              columns={[
                { key: 'id', header: 'ID', className: 'id', render: (a) => a.tag },
                { key: 'n', header: 'Name', className: 'title', render: (a) => <><span className="who"><Icon name={a.type.icon} />{a.name}</span><small>{a.environment} · {a.location}</small></> },
                { key: 't', header: 'Type', render: (a) => a.type.name },
                { key: 'c', header: 'Criticality', render: (a) => <CritChip c={a.criticality} /> },
                { key: 's', header: 'Status', render: (a) => <AssetStatusChip s={a.status} /> },
                { key: 'o', header: 'Owner', render: (a) => <span style={{ whiteSpace: 'nowrap' }}>{a.owner ? a.owner.name : <span className="bad">Not set</span>}<small className="muted" style={{ display: 'block', fontSize: 12 }}>{a.ownerLabel}</small></span> },
                { key: 'g', header: 'Support group', render: (a) => <span style={{ whiteSpace: 'nowrap' }}>{a.supportTeam?.name || <span className="muted">None</span>}</span> },
                { key: 'cu', header: 'Customer', render: (a) => <span style={{ whiteSpace: 'nowrap' }}>{a.customer.isInternal ? 'Internal' : a.customer.name}</span> },
                { key: 'w', header: 'Warranty', render: (a) => <WarrantyChip a={a} /> },
                { key: 'ot', header: 'Open tickets', thClass: 'r', className: 'r', render: (a) => a.openTickets || <span className="muted">0</span> },
              ]} />
            <Pagination meta={q.data.meta} onPage={setPage} />
          </>
        )}
      </section>
      {dialog === 'new' ? <AssetDialog onClose={() => setDialog(null)} /> : null}
      {dialog === 'import' ? <ImportDialog onClose={() => setDialog(null)} /> : null}
    </>
  );
}
