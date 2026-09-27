// The small markdown dialect of the original knowledge base (## headings,
// numbered and bulleted lists, **bold**, `code`). Input is HTML-escaped first,
// so the output can only contain the tags generated here.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export function markdownToHtml(src) {
  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');
  let out = '', list = null;
  const close = () => { if (list) { out += `</${list}>`; list = null; } };
  for (const raw of escapeHtml(src).split('\n')) {
    const l = raw.trimEnd();
    let m;
    if ((m = l.match(/^##\s+(.*)/))) { close(); out += `<h2>${inline(m[1])}</h2>`; }
    else if ((m = l.match(/^\d+\.\s+(.*)/))) { if (list !== 'ol') { close(); out += '<ol>'; list = 'ol'; } out += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^-\s+(.*)/))) { if (list !== 'ul') { close(); out += '<ul>'; list = 'ul'; } out += `<li>${inline(m[1])}</li>`; }
    else if (!l.trim()) close();
    else { close(); out += `<p>${inline(l)}</p>`; }
  }
  close();
  return out;
}

export const excerpt = (b) => { const s = String(b || '').replace(/##\s*/g, '').replace(/\*\*|`/g, '').replace(/\n+/g, ' '); return s.slice(0, 120) + (s.length > 120 ? '...' : ''); };
