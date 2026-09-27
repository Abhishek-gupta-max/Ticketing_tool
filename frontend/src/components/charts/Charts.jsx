import { useEffect, useRef } from 'react';
import { dshort, dlong } from '../../utils/format';
import { PRI } from '../../constants';

const COLORS = { 1: 'var(--bad)', 2: 'var(--warn)', 3: 'var(--p4)', 4: 'var(--line)' };

/** Global hover tooltip for elements with data-tip (text only, never HTML). */
export function Tooltip() {
  const ref = useRef(null);
  useEffect(() => {
    const tip = ref.current;
    const move = (e) => {
      const w = tip.offsetWidth, h = tip.offsetHeight;
      let x = e.clientX + 14, y = e.clientY + 14;
      if (x + w > innerWidth - 8) x = e.clientX - w - 14;
      if (y + h > innerHeight - 8) y = e.clientY - h - 14;
      tip.style.left = `${Math.max(4, x)}px`; tip.style.top = `${Math.max(4, y)}px`;
    };
    const over = (e) => {
      const t = e.target.closest?.('[data-tip]');
      if (!t) return;
      tip.replaceChildren();
      t.dataset.tip.split('\n').forEach((line, i) => {
        if (i) tip.appendChild(document.createElement('br'));
        const el = document.createElement(i === 0 ? 'b' : 'span');
        el.textContent = line;
        tip.appendChild(el);
      });
      tip.classList.add('on');
      move(e);
    };
    const out = (e) => { if (e.target.closest?.('[data-tip]') && !e.relatedTarget?.closest?.('[data-tip]')) tip.classList.remove('on'); };
    const mm = (e) => { if (e.target.closest?.('[data-tip]')) move(e); };
    document.addEventListener('mouseover', over);
    document.addEventListener('mouseout', out);
    document.addEventListener('mousemove', mm);
    return () => { document.removeEventListener('mouseover', over); document.removeEventListener('mouseout', out); document.removeEventListener('mousemove', mm); };
  }, []);
  return <div className="tip" ref={ref} role="tooltip" />;
}

/** One bar per day: height = tickets created, colour = SLA compliance. */
export function HealthStrip({ days }) {
  if (!days?.length) return null;
  const max = Math.max(1, ...days.map((x) => x.created));
  return (
    <>
      <div className="strip">
        {days.map((x) => {
          const cls = x.sla == null ? 'none' : x.sla >= 95 ? '' : x.sla >= 90 ? 'mid' : 'low';
          const tip = `${dlong(x.day)}\n${x.sla == null ? 'No tickets resolved' : `SLA compliance ${x.sla.toFixed(1)}%`}\n${x.created} created, ${x.resolved} resolved`;
          return <i key={x.day} className={cls} data-tip={tip} style={{ height: `${(14 + (x.created / max) * 86).toFixed(1)}%` }} />;
        })}
      </div>
      <div className="axis"><span>{dshort(days[0].day)}</span><span>{dshort(days[days.length - 1].day)}</span></div>
      <div className="legend">
        <span><u style={{ background: 'var(--ok)' }} />95% or higher</span><span><u style={{ background: 'var(--warn)' }} />90% to 95%</span>
        <span><u style={{ background: 'var(--bad)' }} />Below 90%</span><span><u style={{ background: 'var(--line)' }} />Nothing resolved</span>
        <span>Bar height shows tickets created that day</span>
      </div>
    </>
  );
}

export function LineChart({ series, labels, height = 250 }) {
  const W = 760, H = height, L = 40, R = 10, T = 10, B = 26, n = labels.length;
  const max = Math.max(4, ...series.flatMap((s) => s.values));
  const nice = Math.ceil(max / 4) * 4;
  const X = (i) => L + (n < 2 ? 0 : (i * (W - L - R)) / (n - 1));
  const Y = (v) => T + (H - T - B) * (1 - v / nice);
  const step = Math.ceil(n / 7);
  return (
    <div className="chartbox">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${series.map((s) => s.name).join(' and ')} over time`}>
        {[0, 1, 2, 3, 4].map((i) => { const v = (nice / 4) * i, y = Y(v); return <g key={i}><line x1={L} x2={W - R} y1={y} y2={y} stroke="var(--line)" /><text x={L - 6} y={y + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{Math.round(v)}</text></g>; })}
        {labels.map((l, i) => (i % step === 0 ? <text key={l} x={X(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--muted)">{dshort(l)}</text> : null))}
        {series.map((s) => <path key={s.name} d={s.values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash ? '5 4' : undefined} strokeLinejoin="round" />)}
        {labels.map((l, i) => <rect key={`h${l}`} x={X(i) - (W - L - R) / n / 2} y={T} width={(W - L - R) / n} height={H - T - B} fill="transparent" data-tip={`${dlong(l)}\n${series.map((s) => `${s.name}: ${s.values[i]}`).join('\n')}`} />)}
      </svg>
    </div>
  );
}

export function AgingChart({ buckets }) {
  const mx = Math.max(1, ...buckets.map((c) => c.total));
  return (
    <>
      <div className="aging">
        {buckets.map((c) => (
          <div className="acol" key={c.label}>
            <div className="tot">{c.total}</div>
            <div className="stack" style={{ height: `${(c.total / mx) * 82}%` }}>
              {[1, 2, 3, 4].map((p) => (c.byPriority[p - 1] ? <i key={p} style={{ height: `${(c.byPriority[p - 1] / c.total) * 100}%`, background: COLORS[p] }} data-tip={`${c.label}\nP${p} ${PRI[p]}: ${c.byPriority[p - 1]}`} /> : null))}
            </div>
          </div>
        ))}
      </div>
      <div className="alabels">{buckets.map((c) => <span key={c.label}>{c.label}</span>)}</div>
      <div className="legend">{[1, 2, 3, 4].map((p) => <span key={p}><u style={{ background: COLORS[p] }} />P{p} {PRI[p]}</span>)}</div>
    </>
  );
}

/** Horizontal bars: [{ name, count, note }] */
export function BarList({ rows, color }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="cats">
      {rows.map((r) => (
        <div className="cat" key={r.name}>
          <div className="h"><span>{r.name}</span><span>{r.count} {r.unit || 'tickets'}{r.note ? ` · ${r.note}` : ''}</span></div>
          <div className="bar2"><i style={{ width: `${(r.count / max) * 100}%`, background: color }} /></div>
        </div>
      ))}
    </div>
  );
}

export function LoadBar({ value, max }) {
  return <div className="load"><div className="bar2"><i style={{ width: `${(value / Math.max(1, max)) * 100}%` }} /></div>{value}</div>;
}
