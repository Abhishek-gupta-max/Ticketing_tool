import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from '../../components/common/Icon';
import Timeline from '../../components/tickets/Timeline';
import { AttachmentPreview } from '../../components/tickets/AttachmentsPanel';
import { Skeleton } from '../../components/common/Feedback';
import { Select } from '../../components/forms/Field';
import { ticketService } from '../../services/ticketService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useMeta } from '../../hooks';
import { fileProblem } from '../../validators';
import { fsize } from '../../utils/format';

/** Activity list with the reply / internal note composer. */
export default function TicketTimeline({ ticket, insertText, readOnly }) {
  const { user, can } = useAuth();
  const meta = useMeta();
  const toast = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [mode, setMode] = useState('reply');
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [over, setOver] = useState(false);
  const area = useRef(null);
  const q = useQuery({ queryKey: ['ticket', ticket.number, 'activity', filter], queryFn: () => ticketService.activity(ticket.number, filter) });

  // Parent components can push text in (canned responses, article links).
  if (insertText?.current) {
    const t = insertText.current;
    insertText.current = null;
    setTimeout(() => setText((x) => (x ? `${x}\n\n${t}` : t)), 0);
  }

  const addFiles = (list) => {
    for (const f of list) { const e = fileProblem(f, meta?.attachments); if (e) { toast(e); continue; } setFiles((x) => [...x, f]); }
  };

  const send = async (holdAfter = false) => {
    if (!text.trim() && !files.length) { toast('Write a message or attach a file first'); area.current?.focus(); return; }
    setBusy(true);
    try {
      await ticketService.comment(ticket.number, { body: text.trim(), internal: mode === 'note', holdAfter }, files);
      setText(''); setFiles([]);
      toast(mode === 'note' ? 'Internal note added' : 'Comment posted');
      qc.invalidateQueries({ queryKey: ['ticket', ticket.number] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };

  const noteAllowed = can('ticket:note');
  const filters = noteAllowed ? [['all', 'All'], ['comments', 'Comments'], ['notes', 'Internal notes'], ['system', 'System']] : [['all', 'All'], ['comments', 'Comments'], ['system', 'System']];
  const reqFirst = ticket.requester.name.split(' ')[0];
  const canHold = mode === 'reply' && user.isStaff && ['New', 'In Progress'].includes(ticket.status);

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <div className="head-row">
        <div><h2>Activity</h2><p className="sub">{user.isStaff ? 'Replies go to the requester. Internal notes are only visible to agents.' : 'Your conversation with the service desk.'}</p></div>
        <div className="filters" role="group" aria-label="Filter activity">
          {filters.map(([k, l]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
      </div>
      {readOnly || !can('ticket:comment') ? null : (
        <div className={`composer${mode === 'note' ? ' note' : ''}${over ? ' filedrop' : ''}`} data-filedrop=""
          onDragOver={(e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); setOver(true); } }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }}
          onDrop={(e) => { e.preventDefault(); setOver(false); addFiles([...e.dataTransfer.files]); }}>
          {noteAllowed ? (
            <div className="tabs" role="tablist">
              <button type="button" role="tab" aria-selected={mode === 'reply'} onClick={() => setMode('reply')}>Reply to requester ({reqFirst} can see)</button>
              <button type="button" role="tab" aria-selected={mode === 'note'} onClick={() => setMode('note')}>Internal note (agents only)</button>
            </div>
          ) : null}
          <textarea ref={area} value={text} onChange={(e) => setText(e.target.value)} aria-label="Message"
            onPaste={(e) => { if (e.clipboardData?.files?.length) { e.preventDefault(); addFiles([...e.clipboardData.files]); } }}
            placeholder={mode === 'note' ? 'Add an internal note for your team' : 'Write a comment. Paste or drop screenshots to attach them.'} />
          <div className="cmp-files">
            {files.map((f, i) => (
              <span key={`${f.name}${i}`} className="chip grey"><Icon name="file" />{f.name} ({fsize(f.size)}) <button type="button" className="link" style={{ padding: '0 0 0 4px' }} aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>&times;</button></span>
            ))}
          </div>
          <div className="foot">
            <span className="tools">
              <label className="btn sm"><Icon name="paperclip" />Attach files<input type="file" multiple hidden onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }} /></label>
              {user.isStaff && meta?.canned?.length ? (
                <Select aria-label="Insert canned response" blank="Canned response..." value="" options={meta.canned.map((c) => [c.id, c.name])}
                  onChange={(e) => { const c = meta.canned.find((x) => String(x.id) === e.target.value); if (c) { setText((x) => (x ? `${x}\n\n${c.body}` : c.body)); area.current?.focus(); } }} />
              ) : null}
            </span>
            <span className="tools">
              <button type="button" className="btn primary" disabled={busy} onClick={() => send(false)}>{busy ? <span className="spinner" /> : null}{mode === 'note' ? 'Post work note' : 'Post comment'}</button>
              {canHold ? <button type="button" className="btn" disabled={busy} onClick={() => send(true)}>Post and hold, awaiting requester</button> : null}
            </span>
          </div>
        </div>
      )}
      {q.isLoading ? <Skeleton rows={4} /> : <Timeline entries={q.data} meId={user.id} onFile={setPreview} />}
      {preview ? <AttachmentPreview file={preview} onClose={() => setPreview(null)} /> : null}
    </section>
  );
}
