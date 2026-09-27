import { useMemo, useState } from 'react';
import Icon from '../../components/common/Icon';
import { EmptyState } from '../../components/common/Feedback';

const hoursLabel = (h) => (h >= 24 ? `${Math.round(h / 24)} day${h >= 48 ? 's' : ''}` : `${h} hours`);

/** Service catalog browser (catalog items come from the database). */
export default function CatalogGrid({ items, onOrder, onAdd }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const cats = useMemo(() => [...new Set(items.map((c) => c.category.name))], [items]);
  const list = items.filter((c) => (!cat || c.category.name === cat) && (!q || `${c.name}${c.description}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <div className="toolbar">
        <input className="inp q" type="search" placeholder="Search the catalog" aria-label="Search the catalog" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="filters">
          <button type="button" aria-pressed={!cat} onClick={() => setCat('')}>All</button>
          {cats.map((c) => <button type="button" key={c} aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
        </div>
      </div>
      <div className="cgrid">
        {list.map((c) => (
          <div className="citem" key={c.id}>
            <span className="ico"><Icon name={c.icon} /></span>
            <b>{c.name}</b><span>{c.description}</span>
            <span>{c.requiresApproval ? 'Needs approval' : 'No approval needed'} · about {hoursLabel(c.fulfilmentHours)} · {c.tasks.length} task{c.tasks.length === 1 ? '' : 's'}</span>
            <span className="tools" style={{ marginTop: 6 }}>
              <button type="button" className="btn sm primary" onClick={() => onOrder(c)}>Order now</button>
              <button type="button" className="btn sm" onClick={() => onAdd(c)}>Add to cart</button>
            </span>
          </div>
        ))}
      </div>
      {!list.length ? <EmptyState>Nothing matches your search.</EmptyState> : null}
    </>
  );
}
