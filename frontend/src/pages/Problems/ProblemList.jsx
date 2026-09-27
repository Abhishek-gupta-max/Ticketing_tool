import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { problemService } from '../../services/problemService';
import { useAuth } from '../../context/AuthContext';
import { useAction, useMeta } from '../../hooks';
import Icon from '../../components/common/Icon';
import { Kpi, Views } from '../../components/common/Controls';
import { ProblemChip, PriorityChip, OwnerCell } from '../../components/common/Chips';
import { PageSkeleton, ErrorState } from '../../components/common/Feedback';
import { Field, Input, Select } from '../../components/forms/Field';
import Modal from '../../components/common/Modal';
import DataTable from '../../components/tables/DataTable';
import { PRI_OPTIONS } from '../../constants';
import { dur, MIN } from '../../utils/format';

function NewProblem({ onClose }) {
  const meta = useMeta();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [pri, setPri] = useState(3);
  const [owner, setOwner] = useState(user.id);
  const [err, setErr] = useState('');
  const act = useAction(() => problemService.create({ title: title.trim(), priority: Number(pri), ownerId: Number(owner) }), {
    invalidate: ['problems'], success: (r) => `${r.data.number} created`, onSuccess: (r) => { onClose(); navigate(`/problems/${r.data.number}`); },
  });
  return (
    <Modal title="New problem" onClose={onClose} busy={act.isPending} onSubmit={() => (title.trim().length < 5 ? setErr('Summary needs at least 5 characters.') : act.mutate())}
      buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Create problem', variant: 'primary', type: 'submit' }]}>
      <Field label="Summary *" error={err}>{(id) => <Input id={id} placeholder="Describe the underlying problem" value={title} onChange={(e) => { setTitle(e.target.value); setErr(''); }} />}</Field>
      <div className="row2">
        <Field label="Priority">{(id) => <Select id={id} options={PRI_OPTIONS} value={pri} onChange={(e) => setPri(e.target.value)} />}</Field>
        <Field label="Assigned to">{(id) => <Select id={id} options={(meta?.agents || []).map((a) => [a.id, a.name])} value={owner} onChange={(e) => setOwner(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

export default function ProblemList() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState('open');
  const [adding, setAdding] = useState(false);
  const q = useQuery({ queryKey: ['problems', view], queryFn: () => problemService.list({ view }) });
  const suggest = useAction((title) => problemService.fromSuggestion(title), { invalidate: ['problems', 'tickets'], onSuccess: (r) => navigate(`/problems/${r.data.number}`) });
  if (q.isLoading) return <PageSkeleton />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const d = q.data;
  return (
    <>
      <div className="ph">
        <div><h1>Problems</h1><p>Find and fix the root cause behind repeat incidents.</p></div>
        {can('problem:create') ? <div className="tools"><button type="button" className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" />New problem</button></div> : null}
      </div>
      <div className="kpis">
        <Kpi label="Open problems" value={d.kpis.open} sub="not yet resolved" />
        <Kpi label="Known errors" value={d.kpis.known} sub="with a workaround" />
        <Kpi label="Open incidents linked" value={d.kpis.linkedOpen} sub="waiting on a fix" />
        <Kpi label="Average age" value={d.kpis.avgAgeDays.toFixed(0)} sub="days for open problems" unit=" d" />
      </div>
      {d.suggestions.length && can('problem:create') ? (
        <section className="panel" style={{ marginBottom: 16 }}>
          <h2>Suggested problems</h2><p className="sub">The same incident was raised four or more times in the last 30 days with no problem linked.</p>
          <ul className="plain">
            {d.suggestions.map((s) => (
              <li key={s.title}><div><b>{s.title}</b><span className="s">{s.count} incidents in 30 days · {s.category}</span></div>
                <button type="button" className="btn sm" disabled={suggest.isPending} onClick={() => suggest.mutate(s.title)}>Create problem</button></li>
            ))}
          </ul>
        </section>
      ) : null}
      <Views value={view} onChange={setView} options={[['open', 'Open'], ['known', 'Known errors'], ['resolved', 'Fixed or closed'], ['all', 'All']]} />
      <section className="panel" style={{ padding: '12px 14px' }}>
        <DataTable rows={d.items} rowKey={(p) => p.number} rowTo={(p) => `/problems/${p.number}`} empty="No problems here."
          columns={[
            { key: 'n', header: 'ID', className: 'id', render: (p) => p.number },
            { key: 't', header: 'Summary', className: 'title', render: (p) => p.title },
            { key: 's', header: 'State', render: (p) => <ProblemChip p={p} /> },
            { key: 'p', header: 'Priority', render: (p) => <PriorityChip p={p.priority} /> },
            { key: 'o', header: 'Assigned to', render: (p) => <OwnerCell user={p.owner} meId={user.id} /> },
            { key: 'i', header: 'Incidents', thClass: 'r', className: 'r', render: (p) => p.incidentCount },
            { key: 'io', header: 'Still open', thClass: 'r', className: 'r', render: (p) => p.openIncidentCount },
            { key: 'a', header: 'Age', className: 'muted', render: (p) => dur((Date.now() - new Date(p.createdAt)) / MIN) },
          ]} />
      </section>
      {adding ? <NewProblem onClose={() => setAdding(false)} /> : null}
    </>
  );
}
