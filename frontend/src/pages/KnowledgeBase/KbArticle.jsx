import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { kbService } from '../../services/assetService';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useAction } from '../../hooks';
import Icon from '../../components/common/Icon';
import { Chip } from '../../components/common/Chips';
import { PageSkeleton, ErrorState, NotFound } from '../../components/common/Feedback';
import ArticleDialog from './ArticleDialog';
import { markdownToHtml } from '../../utils/markdown';
import { dshort, fmt } from '../../utils/format';

export default function KbArticle() {
  const { number } = useParams();
  const { user, can } = useAuth();
  const { confirm } = useUI();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const q = useQuery({ queryKey: ['kb', number], queryFn: () => kbService.get(number), staleTime: 60000 });
  const status = useAction((s) => kbService.setStatus(number, s), { invalidate: ['kb'] });
  const vote = useAction((helpful) => kbService.vote(number, helpful), { invalidate: ['kb'] });
  const del = useAction(() => kbService.remove(number), { invalidate: ['kb'], onSuccess: () => navigate('/kb') });
  // The markdown renderer escapes all input first, so only its own tags are produced.
  const html = useMemo(() => markdownToHtml(q.data?.body || ''), [q.data?.body]);

  if (q.isLoading) return <PageSkeleton />;
  if (q.error?.status === 404) return <NotFound what={`Article ${number}`} back="/kb" backLabel="Back to knowledge base" />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const a = q.data;
  const n = a.helpful + a.notHelpful;

  return (
    <>
      <div className="crumb"><Link to="/kb">Knowledge base</Link> / {a.number}</div>
      <div className="ph" style={{ marginBottom: 8 }}>
        <div>
          <div className="chips"><span className="id">{a.number}</span><Chip>{a.category.name}</Chip><Chip cls={a.audience === 'Internal' ? 'violet' : 'info'}>{a.audience === 'Internal' ? 'Internal, agents only' : 'Public'}</Chip>{a.status !== 'Published' ? <Chip cls="warn">{a.status}</Chip> : null}</div>
          <h1 className="dtitle">{a.title}</h1>
          <p className="muted">Updated {dshort(a.updatedAt)} by {a.author?.name || 'Unknown'} · {fmt(a.views)} views</p>
        </div>
        <div className="tools">
          {can('kb:publish') ? (a.status !== 'Published'
            ? <button type="button" className="btn primary" onClick={() => status.mutate('Published')}>Publish</button>
            : <><button type="button" className="btn" onClick={() => status.mutate('Draft')}>Move to drafts</button><button type="button" className="btn" onClick={() => status.mutate('Archived')}>Archive</button></>) : null}
          {can('kb:update') ? <button type="button" className="btn" onClick={() => setEditing(true)}><Icon name="edit" />Edit</button> : null}
          {can('kb:delete') ? <button type="button" className="btn danger" onClick={async () => { if (await confirm({ title: 'Delete article', message: `Delete ${a.title}? This cannot be undone.`, confirmLabel: 'Delete', danger: true })) del.mutate(); }}><Icon name="trash" />Delete</button> : null}
        </div>
      </div>
      <div className="dgrid">
        <div>
          <section className="panel">
            {/* eslint-disable-next-line react/no-danger */}
            <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
            <div style={{ marginTop: 22, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <b>Was this helpful?</b>
              <span className="tools" style={{ display: 'inline-flex', marginLeft: 8 }}>
                <button type="button" className="btn sm" aria-pressed={a.myVote === true} onClick={() => vote.mutate(true)}>Yes</button>
                <button type="button" className="btn sm" aria-pressed={a.myVote === false} onClick={() => vote.mutate(false)}>No</button>
              </span>
              <span className="muted" style={{ marginLeft: 10 }}>{n ? `${Math.round((a.helpful / n) * 100)}% of ${n} people said yes` : 'No votes yet'}</span>
            </div>
          </section>
        </div>
        <div className="side-col">
          <section className="panel"><h2>Tags</h2>
            <div className="chips" style={{ marginTop: 8 }}>{a.tags.length ? a.tags.map((t) => <Chip key={t}>{t}</Chip>) : <span className="muted">No tags</span>}</div>
            {user.isStaff && a.referencedInTickets ? <p className="muted" style={{ marginTop: 10 }}>Referenced in {a.referencedInTickets} tickets.</p> : null}
          </section>
          {a.related.length ? <section className="panel"><h2>Related articles</h2>{a.related.map((r) => <div className="linkrow" key={r.number}><Link to={`/kb/${r.number}`}>{r.title}</Link></div>)}</section> : null}
        </div>
      </div>
      {editing ? <ArticleDialog article={a} onClose={() => setEditing(false)} /> : null}
    </>
  );
}
