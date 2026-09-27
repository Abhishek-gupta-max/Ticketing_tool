import { withTransaction } from '../config/database.js';
import * as repo from '../repositories/kb.repository.js';
import * as audit from './audit.service.js';
import { nextNumber } from './sequence.service.js';
import * as map from '../models/mappers.js';
import { notFound, forbidden } from '../utils/AppError.js';
import { queryOne } from '../config/database.js';

const tagsOf = (r) => (r.tags ? r.tags.split(',') : []);
const canSeeInternal = (user) => user.can('kb:view_internal');

function visible(r, user) {
  if (!r) return false;
  if (canSeeInternal(user)) return true;
  return r.audience === 'Public' && r.status === 'Published';
}

const cleanTags = (tags = []) => [...new Set(tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 15);

export async function list(q, user) {
  const internal = canSeeInternal(user);
  const rows = await repo.list({ ...q, status: internal ? (q.status || 'Published') : 'Published', internal });
  const k = await repo.kpis();
  return {
    items: rows.map((r) => { const a = map.article(r, tagsOf(r)); return { ...a, body: undefined, excerpt: excerpt(r.body) }; }),
    kpis: internal ? {
      published: Number(k.published || 0), drafts: Number(k.drafts || 0), views: Number(k.views || 0),
      helpfulPct: Number(k.helpful || 0) + Number(k.not_helpful || 0) ? Math.round((Number(k.helpful) / (Number(k.helpful) + Number(k.not_helpful))) * 100) : null,
      internal: Number(k.internal || 0),
    } : null,
  };
}

const excerpt = (b) => { const s = String(b).replace(/##\s*/g, '').replace(/\*\*|`/g, '').replace(/\n+/g, ' '); return s.slice(0, 120) + (s.length > 120 ? '...' : ''); };

export async function get(number, user, { countView = true } = {}) {
  const r = await repo.findByNumber(number);
  if (!visible(r, user)) throw notFound(`Article ${number} was not found.`);
  if (countView) await repo.recordView(r.id, user.id);
  const fresh = countView ? await repo.findById(r.id) : r;
  const [rel, used, myVote] = await Promise.all([repo.related(r.id, r.category_id, canSeeInternal(user)), user.isStaff ? repo.referencedIn(r.article_number) : 0, repo.myVote(r.id, user.id)]);
  return { ...map.article(fresh, tagsOf(fresh)), related: rel.map((x) => ({ id: x.id, number: x.article_number, title: x.title })), referencedInTickets: used, myVote };
}

async function categoryId(conn, id) {
  const c = await queryOne('SELECT id FROM knowledge_categories WHERE id = ?', [id], conn);
  if (!c) throw notFound('Category not found.');
  return c.id;
}

export async function create(body, user) {
  if (body.status === 'Published' && !user.can('kb:publish')) throw forbidden('You cannot publish articles.');
  const number = await withTransaction(async (conn) => {
    const n = await nextNumber(conn, 'KB');
    const id = await repo.insert({ number: n, title: body.title, categoryId: await categoryId(conn, body.categoryId), audience: body.audience, status: body.status, body: body.body, authorId: user.id }, conn);
    await repo.setTags(id, cleanTags(body.tags), conn);
    await audit.log({ action: 'Created article', entityType: 'article', entityId: id, entityRef: n, newValues: { title: body.title, status: body.status } }, conn);
    return n;
  });
  return get(number, user, { countView: false });
}

/** Draft article from a resolved ticket (Resolve dialog option). */
export async function createDraftFromTicket(conn, t, note, user) {
  const n = await nextNumber(conn, 'KB');
  const cat = await queryOne('SELECT id FROM knowledge_categories WHERE name = ?', [t.category_name], conn)
    || await queryOne('SELECT id FROM knowledge_categories ORDER BY sort_order LIMIT 1', [], conn);
  const id = await repo.insert({ number: n, title: t.title, categoryId: cat.id, audience: 'Public', status: 'Draft', body: `## Symptoms\n${t.description || ''}\n\n## Resolution\n${note}`, authorId: user.id }, conn);
  await repo.setTags(id, [t.category_name.split(' ')[0].toLowerCase()], conn);
  await audit.log({ action: 'Created article', entityType: 'article', entityId: id, entityRef: n, newValues: { fromTicket: t.ticket_number } }, conn);
  return n;
}

export async function update(number, body, user) {
  await withTransaction(async (conn) => {
    const r = await repo.findByNumber(number, conn);
    if (!r) throw notFound(`Article ${number} was not found.`);
    if (body.status !== r.status && !user.can('kb:publish')) throw forbidden('You cannot publish or unpublish articles.');
    await repo.update(r.id, { title: body.title, categoryId: await categoryId(conn, body.categoryId), audience: body.audience, status: body.status, body: body.body }, conn);
    await repo.setTags(r.id, cleanTags(body.tags), conn);
    await audit.log({ action: 'Edited article', entityType: 'article', entityId: r.id, entityRef: number, oldValues: { title: r.title, status: r.status }, newValues: { title: body.title, status: body.status } }, conn);
  });
  return get(number, user, { countView: false });
}

export async function setStatus(number, status, user) {
  await withTransaction(async (conn) => {
    const r = await repo.findByNumber(number, conn);
    if (!r) throw notFound(`Article ${number} was not found.`);
    await repo.setStatus(r.id, status, conn);
    const verb = status === 'Published' ? 'Published article' : status === 'Archived' ? 'Archived article' : 'Moved article to drafts';
    await audit.log({ action: verb, entityType: 'article', entityId: r.id, entityRef: number, oldValues: { status: r.status }, newValues: { status } }, conn);
  });
  return get(number, user, { countView: false });
}

export async function remove(number) {
  await withTransaction(async (conn) => {
    const r = await repo.findByNumber(number, conn);
    if (!r) throw notFound(`Article ${number} was not found.`);
    await repo.softDelete(r.id, conn);
    await audit.log({ action: 'Deleted article', entityType: 'article', entityId: r.id, entityRef: number, oldValues: { title: r.title } }, conn);
  });
}

export async function vote(number, helpful, user) {
  const r = await repo.findByNumber(number);
  if (!visible(r, user)) throw notFound(`Article ${number} was not found.`);
  await withTransaction((conn) => repo.vote(r.id, user.id, helpful, conn));
  return get(number, user, { countView: false });
}
