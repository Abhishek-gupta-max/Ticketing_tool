import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../common/Feedback';

/**
 * Generic table with the original look. columns: [{ key, header, sort, className, render }]
 * rowTo(row) makes rows clickable (and keyboard accessible).
 */
export default function DataTable({ columns, rows, rowTo, sort, onSort, empty = 'Nothing to show.', rowKey = (r) => r.id }) {
  const navigate = useNavigate();
  if (!rows?.length) return <EmptyState>{empty}</EmptyState>;
  return (
    <div className="scroll">
      <table className="tbl">
        <thead>
          <tr>
            {columns.map((c) => {
              if (c.sort && onSort) {
                const on = sort?.by === c.sort;
                return (
                  <th key={c.key} className={c.thClass} style={c.width ? { width: c.width } : undefined} aria-sort={on ? (sort.dir === 'ASC' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" onClick={() => onSort(c.sort)}>{c.header}{on ? (sort.dir === 'ASC' ? ' ▲' : ' ▼') : ''}</button>
                  </th>
                );
              }
              return <th key={c.key} className={c.thClass} style={c.width ? { width: c.width } : undefined}>{c.header}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const to = rowTo?.(r);
            return (
              <tr
                key={rowKey(r)}
                data-go={to ? '' : undefined}
                tabIndex={to ? 0 : undefined}
                onClick={to ? (e) => { if (!e.target.closest('a,button,input,select,textarea,label')) navigate(to); } : undefined}
                onKeyDown={to ? (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); navigate(to); } } : undefined}
              >
                {columns.map((c) => <td key={c.key} className={c.className}>{c.render ? c.render(r) : r[c.key]}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
