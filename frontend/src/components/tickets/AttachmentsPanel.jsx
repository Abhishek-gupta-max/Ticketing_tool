import { useEffect, useRef, useState } from 'react';
import Icon from '../common/Icon';
import Modal from '../common/Modal';
import { attachmentService } from '../../services/ticketService';
import { useToast } from '../../context/ToastContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { useMeta } from '../../hooks';
import { fileProblem } from '../../validators';
import { fsize, ago, dtime } from '../../utils/format';

/** Preview of an attachment fetched through the authorised download endpoint. */
export function AttachmentPreview({ file, onClose }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let url = null;
    let alive = true;
    const inlineType = /^image\/(png|jpeg|gif|webp|bmp)$/.test(file.mimeType) || file.mimeType === 'application/pdf' || file.mimeType.startsWith('text/') || file.mimeType === 'application/json';
    if (!inlineType) { setState({ none: true }); return undefined; }
    attachmentService.blob(file.id).then(async (blob) => {
      if (!alive) return;
      if (file.mimeType.startsWith('image/') || file.mimeType === 'application/pdf') { url = URL.createObjectURL(blob); setState({ url }); }
      else setState({ text: (await blob.text()).slice(0, 20000) });
    }).catch((e) => setState({ error: e.message }));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [file]);
  let body;
  if (state.loading) body = <div className="loading"><span className="spinner" />Loading preview...</div>;
  else if (state.error) body = <p className="bad">{state.error}</p>;
  else if (state.none) body = <p className="muted">There is no preview for this file type. Use Download to open it.</p>;
  else if (state.text != null) body = <pre className="pwd" style={{ whiteSpace: 'pre-wrap', maxHeight: '50vh', overflow: 'auto' }}>{state.text}</pre>;
  else if (file.mimeType === 'application/pdf') body = <iframe src={state.url} title={file.name} sandbox="" style={{ width: '100%', height: '60vh', border: 0 }} />;
  else body = <img src={state.url} alt={file.name} style={{ maxWidth: '100%', borderRadius: 6 }} />;
  return (
    <Modal title={file.name} wide onClose={onClose} buttons={[{ label: 'Close', onClick: onClose }, { label: 'Download', variant: 'primary', onClick: () => attachmentService.download(file.id, file.name) }]}>
      <p className="muted" style={{ marginBottom: 10 }}>{fsize(file.size)} · added by {file.uploadedBy?.name || 'Unknown'}, {dtime(file.createdAt)}</p>
      {body}
    </Modal>
  );
}

/**
 * Attachments panel with drag and drop. onUpload(files) must return a promise;
 * onChanged() is called after a removal.
 */
export default function AttachmentsPanel({ files = [], readOnly, onUpload, onChanged }) {
  const [preview, setPreview] = useState(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const toast = useToast();
  const { confirm } = useUI();
  const { can } = useAuth();
  const meta = useMeta();

  const upload = async (list) => {
    const arr = [...list];
    if (!arr.length) return;
    const bad = arr.map((f) => fileProblem(f, meta?.attachments)).filter(Boolean);
    if (bad.length) { toast(bad[0] + (bad.length > 1 ? ` (+${bad.length - 1} more)` : '')); return; }
    setBusy(true);
    try { await onUpload(arr); toast(`${arr.length} file${arr.length > 1 ? 's' : ''} attached`); } catch (e) { toast(e.message); } finally { setBusy(false); }
  };

  const remove = async (f) => {
    if (!(await confirm({ title: 'Remove attachment', message: `Remove ${f.name}? This cannot be undone.`, confirmLabel: 'Remove', danger: true }))) return;
    try { await attachmentService.remove(f.id); toast('Attachment removed'); onChanged?.(); } catch (e) { toast(e.message); }
  };

  const drop = readOnly ? {} : {
    onDragOver: (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); setOver(true); } },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); },
    onDrop: (e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); },
  };

  return (
    <section className={`panel${over ? ' filedrop' : ''}`} data-filedrop="" {...drop}>
      <div className="head-row">
        <div><h2>Attachments</h2><p className="sub">{files.length ? `${files.length} file${files.length > 1 ? 's' : ''}` : readOnly ? 'No files.' : `Drop files here or choose files. Up to ${Math.round((meta?.attachments?.maxBytes || 5242880) / 1048576)} MB each.`}</p></div>
        {readOnly ? null : (
          <>
            <button type="button" className="btn sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? <span className="spinner" /> : <Icon name="paperclip" />}Attach</button>
            <input ref={input} type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          </>
        )}
      </div>
      {files.map((f) => (
        <div className="att" key={f.id}>
          <span className="attic"><Icon name="file" /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <button type="button" className="link" style={{ textAlign: 'left', textDecoration: 'none', color: 'var(--ink)', fontWeight: 500, overflowWrap: 'anywhere' }} onClick={() => setPreview(f)}>{f.name}</button>
            <div className="muted" style={{ fontSize: 12 }}>{fsize(f.size)} · {f.uploadedBy?.name || 'Unknown'} · {ago(f.createdAt)}</div>
          </div>
          <span className="tools">
            <button type="button" className="btn sm icon-btn" aria-label={`Download ${f.name}`} onClick={() => attachmentService.download(f.id, f.name).catch((e) => toast(e.message))}><Icon name="download" /></button>
            {readOnly || !can('attachment:delete') ? null : <button type="button" className="btn sm icon-btn" aria-label={`Remove ${f.name}`} onClick={() => remove(f)}><Icon name="trash" /></button>}
          </span>
        </div>
      ))}
      {preview ? <AttachmentPreview file={preview} onClose={() => setPreview(null)} /> : null}
    </section>
  );
}
