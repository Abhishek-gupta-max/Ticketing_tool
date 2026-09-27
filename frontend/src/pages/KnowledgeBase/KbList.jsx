import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { kbService } from '../../services/assetService';
import { useAuth } from '../../context/AuthContext';
import { useMeta } from '../../hooks';
import Icon from '../../components/common/Icon';
import { Kpi, SearchBox } from '../../components/common/Controls';
import { Chip } from '../../components/common/Chips';
import { Skeleton, ErrorState, EmptyState } from '../../components/common/Feedback';
import { Select } from '../../components/forms/Field';
import ArticleDialog from './ArticleDialog';
import { fmt } from '../../utils/format';

export default function KbList() {
  const { can } = useAuth();
  const meta = useMeta();
  const internal = can('kb:view_internal');
  const [f, setF] = useState({ search: '', categoryId: '', audience: '', status: 'Published' });
  const [adding, setAdding] = useState(false);
  const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  const q = useQuery({ queryKey: ['kb', params], queryFn: () => kbService.list(params), placeholderData: keepPreviousData });
  const set = (p) => setF((s) => ({ ...s, ...p }));
  const k = q.data?.meta?.kpis;
  return (
    <>
      <div className="ph">
        <div><h1>Knowledge base</h1><p>Answers that help people fix things themselves, and help agents solve tickets faster.</p></div>
        {can('kb:create') ? <div className="tools"><button type="button" className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" />New article</button></div> : null}
      </div>
      {k ? (
        <div className="kpis">
          <Kpi label="Published articles" value={k.published} sub={`${k.drafts} drafts`} />
          <Kpi label="Views" value={fmt(k.views)} sub="all time" />
          <Kpi label="Found helpful" value={k.helpfulPct ?? '-'} sub="of votes" unit={k.helpfulPct != null ? '%' : ''} />
          <Kpi label="Internal only" value={k.internal} sub="agent playbooks" />
        </div>
      ) : null}
      <div className="toolbar">
        <SearchBox value={f.search} onChange={(v) => set({ search: v })} placeholder="Search articles" label="Search articles" />
        <Select aria-label="Category" blank="All categories" options={(meta?.kbCategories || []).map((c) => [c.id, c.name])} value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })} />
        {internal ? <>
          <Select aria-label="Audience" blank="All audiences" options={[['Public', 'Public'], ['Internal', 'Internal (agents only)']]} value={f.audience} onChange={(e) => set({ audience: e.target.value })} />
          <Select aria-label="Status" options={[['Published', 'Published'], ['Draft', 'Drafts'], ['Archived', 'Archived'], ['all', 'All']]} value={f.status} onChange={(e) => set({ status: e.target.value })} />
        </> : null}
      </div>
      {q.isLoading ? <Skeleton /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : q.data.data.length ? (
        <div className="cgrid">
          {q.data.data.map((a) => {
            const n = a.helpful + a.notHelpful;
            return (
              <Link className="kbcard" to={`/kb/${a.number}`} key={a.number}>
                <div className="chips"><Chip>{a.category.name}</Chip>{a.audience === 'Internal' ? <Chip cls="violet">Internal</Chip> : null}{a.status !== 'Published' ? <Chip cls="warn">{a.status}</Chip> : null}</div>
                <b>{a.title}</b><span>{a.excerpt}</span><span>{fmt(a.views)} views{n ? ` · ${Math.round((a.helpful / n) * 100)}% found it helpful` : ''}</span>
              </Link>
            );
          })}
        </div>
      ) : <section className="panel"><EmptyState>No articles match your search.</EmptyState></section>}
      {adding ? <ArticleDialog onClose={() => setAdding(false)} /> : null}
    </>
  );
}
