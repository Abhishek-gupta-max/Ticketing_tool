import fs from 'node:fs';
import { fileTypeFromBuffer } from 'file-type';
import * as repo from '../repositories/attachment.repository.js';
import { writeUpload, removeUpload, uploadPath } from '../utils/fileStorage.js';
import { badRequest, forbidden, notFound } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { attachment as mapAttachment } from '../models/mappers.js';
import { queryOne } from '../config/database.js';

// Same blocked list as the original application, plus a few more script types.
export const BLOCKED_EXT = ['exe', 'bat', 'cmd', 'msi', 'scr', 'vbs', 'js', 'jar', 'com', 'ps1', 'dll', 'hta', 'lnk', 'reg', 'vbe', 'wsf', 'cpl', 'msp', 'sh', 'php'];

// Extensions that may be uploaded. Binary formats must match their content;
// text formats must look like text.
const BINARY = {
  png: ['png'], jpg: ['jpg'], jpeg: ['jpg'], gif: ['gif'], webp: ['webp'], bmp: ['bmp'], tif: ['tif'], tiff: ['tif'], heic: ['heic'],
  pdf: ['pdf'], zip: ['zip'], '7z': ['7z'], gz: ['gz'], tgz: ['gz'], tar: ['tar'], rar: ['rar'],
  docx: ['docx', 'zip'], xlsx: ['xlsx', 'zip'], pptx: ['pptx', 'zip'], odt: ['odt', 'zip'], ods: ['ods', 'zip'], odp: ['odp', 'zip'],
  doc: ['cfb'], xls: ['cfb'], ppt: ['cfb'], msg: ['cfb'], pcap: ['pcap'], pcapng: ['pcapng'], mp4: ['mp4'], mov: ['mov'], webm: ['webm'], mp3: ['mp3'], wav: ['wav'],
};
const TEXT = {
  txt: 'text/plain', log: 'text/plain', csv: 'text/csv', json: 'application/json', md: 'text/markdown', xml: 'application/xml',
  yaml: 'text/plain', yml: 'text/plain', har: 'application/json', eml: 'message/rfc822', ini: 'text/plain', conf: 'text/plain', cfg: 'text/plain',
};
const EXECUTABLE_CONTENT = ['exe', 'elf', 'mach', 'msi', 'dll', 'class', 'wasm', 'swf', 'lnk', 'dex'];
const INLINE_SAFE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'application/pdf']);

const extOf = (name) => (String(name).includes('.') ? String(name).split('.').pop().toLowerCase() : '');
export const allowedExtensions = () => [...Object.keys(BINARY), ...Object.keys(TEXT)].sort();

function cleanName(name) {
  const base = String(name || 'file').split(/[\\/]/).pop();
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f<>:"|?*]/g, '_').slice(0, 200) || 'file';
}

/** Validate one uploaded file and return { name, ext, mime } or throw. */
export async function inspect(file) {
  const name = cleanName(Buffer.from(file.originalname, 'latin1').toString('utf8'));
  const ext = extOf(name);
  if (BLOCKED_EXT.includes(ext)) throw badRequest(`${name}: .${ext} files are not allowed.`, 'FILE_TYPE_BLOCKED');
  if (!file.size || !file.buffer?.length) throw badRequest(`${name}: the file is empty.`, 'FILE_EMPTY');
  if (file.size > env.maxFileBytes) throw badRequest(`${name}: larger than ${env.MAX_FILE_SIZE_MB} MB.`, 'FILE_TOO_LARGE');
  if (!BINARY[ext] && !TEXT[ext]) throw badRequest(`${name}: .${ext || '(no extension)'} files are not accepted.`, 'FILE_TYPE_NOT_ALLOWED');

  const detected = await fileTypeFromBuffer(file.buffer);
  if (detected && EXECUTABLE_CONTENT.includes(detected.ext)) throw badRequest(`${name}: executable content is not allowed.`, 'FILE_CONTENT_BLOCKED');
  if (BINARY[ext]) {
    if (!detected || !BINARY[ext].includes(detected.ext)) throw badRequest(`${name}: the content does not match the .${ext} extension.`, 'FILE_CONTENT_MISMATCH');
    const mime = detected.ext === 'cfb' || detected.ext === 'zip' ? (file.mimetype && file.mimetype !== 'application/octet-stream' ? file.mimetype : detected.mime) : detected.mime;
    return { name, ext, mime };
  }
  // Text formats: reject anything binary-looking.
  if (detected || file.buffer.subarray(0, 8192).includes(0)) throw badRequest(`${name}: the content does not match the .${ext} extension.`, 'FILE_CONTENT_MISMATCH');
  return { name, ext, mime: TEXT[ext] };
}

/** Validate every file first, then store them all. Returns the stored rows. */
export async function storeFiles(conn, entityType, entityId, files, userId, commentId = null) {
  const checked = [];
  for (const f of files) checked.push({ file: f, meta: await inspect(f) });
  const out = [];
  const written = [];
  try {
    for (const { file, meta } of checked) {
      const stored = await writeUpload(file.buffer);
      written.push(stored.storedName);
      const id = await repo.insert({
        entityType, entityId, commentId, originalName: meta.name, storedName: stored.storedName, mimeType: meta.mime,
        extension: meta.ext, size: stored.size, sha256: stored.sha256, uploadedBy: userId,
      }, conn);
      out.push({ id, name: meta.name, size: stored.size });
    }
  } catch (err) {
    // Files already written are removed when the database write fails.
    await Promise.all(written.map((n) => removeUpload(n).catch(() => {})));
    throw err;
  }
  return out;
}

export async function listFor(entityType, entityId, { includeNotes = true } = {}) {
  const rows = await repo.forEntity(entityType, entityId);
  return rows.filter((r) => includeNotes || r.comment_type !== 'note').map(mapAttachment);
}

/** Load an attachment and check the user may see its parent record. */
export async function authorize(id, user) {
  const a = await repo.findById(id);
  if (!a) throw notFound('Attachment not found.');
  if (a.entity_type === 'ticket') {
    const t = await queryOne('SELECT requester_id FROM tickets WHERE id = ? AND deleted_at IS NULL', [a.entity_id]);
    if (!t) throw notFound('Attachment not found.');
    const staff = user.can('ticket:view_all');
    if (!staff && t.requester_id !== user.personId) throw notFound('Attachment not found.');
    if (a.comment_type === 'note' && !user.can('ticket:note')) throw notFound('Attachment not found.');
  } else {
    const need = { problem: 'problem:view', change: 'change:view', task: 'task:view' }[a.entity_type];
    if (!user.can(need)) throw forbidden();
  }
  return a;
}

export async function openForDownload(id, user) {
  const a = await authorize(id, user);
  const path = uploadPath(a.stored_name);
  if (!fs.existsSync(path)) throw notFound('The file is no longer available.');
  return { path, name: a.original_name, mime: a.mime_type, size: a.size_bytes, inlineSafe: INLINE_SAFE.has(a.mime_type) || a.mime_type.startsWith('text/') || a.mime_type === 'application/json' };
}

export async function remove(conn, id) {
  const a = await repo.findById(id);
  if (!a) throw notFound('Attachment not found.');
  await repo.softDelete(id, conn);
  return a;
}
