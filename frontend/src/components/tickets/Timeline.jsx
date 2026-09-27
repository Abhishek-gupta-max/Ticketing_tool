import { Avatar } from '../common/Chips';
import Icon from '../common/Icon';
import { EmptyState } from '../common/Feedback';
import { dtime } from '../../utils/format';

/**
 * Activity list: system lines, replies and work notes. onFile(file) opens an
 * attachment preview.
 */
export default function Timeline({ entries, meId, onFile, noteLabel = 'work note', empty = 'No activity matches this filter.' }) {
  if (!entries?.length) return <EmptyState>{empty}</EmptyState>;
  return (
    <div className="acts-list">
      {entries.map((a) => {
        if (a.type === 'system') {
          return <div key={a.id} className="ev sys"><span>{a.body} <span className="muted">· {dtime(a.at)}</span></span></div>;
        }
        return (
          <div key={a.id} className="ev">
            <Avatar user={a.user} mine={a.user?.id === meId} />
            <div className={`bub${a.type === 'note' ? ' note' : ''}`}>
              <div className="h"><span><b>{a.user ? (a.user.id === meId ? 'You' : a.user.name) : 'System'}</b> {a.type === 'note' ? `· ${noteLabel}` : '· additional comment'}</span><span>{dtime(a.at)}</span></div>
              <p>{a.body}</p>
              {a.files?.length ? (
                <div className="chips" style={{ marginTop: 8 }}>
                  {a.files.map((f) => <button type="button" key={f.id} className="chip grey" onClick={() => onFile?.(f)}><Icon name="file" />{f.name}</button>)}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
