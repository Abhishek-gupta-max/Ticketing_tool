import * as svc from '../services/ticket.service.js';
import * as mi from '../services/majorIncident.service.js';
import { ok, created } from '../utils/response.js';
import { sendCsv } from '../utils/csv.js';

const n = (req) => req.valid.params.number;

export const list = async (req, res) => { const r = await svc.list(req.valid.query, req.user); ok(res, r.items, 'OK', r.meta); };
export const board = async (req, res) => ok(res, await svc.board(req.valid.query, req.user));
export const get = async (req, res) => ok(res, await svc.get(n(req), req.user));
export const create = async (req, res) => created(res, await svc.create(req.valid.body, req.user, req.files || []), 'Ticket created successfully');
export const update = async (req, res) => ok(res, await svc.update(n(req), req.valid.body, req.user), 'Ticket updated');
export const remove = async (req, res) => { await svc.remove(n(req), req.user); ok(res, null, 'Ticket deleted'); };
export const status = async (req, res) => {
  const r = await svc.changeStatus(n(req), req.valid.body, req.user);
  ok(res, r.ticket, r.articleNumber ? `${n(req)} resolved. Draft article ${r.articleNumber} created.` : `${n(req)}: ${req.valid.body.status}`, r.articleNumber ? { articleNumber: r.articleNumber } : undefined);
};
export const assign = async (req, res) => ok(res, await svc.assign(n(req), req.valid.body.assigneeId, req.user), 'Assignment updated');
export const priority = async (req, res) => ok(res, await svc.setPriority(n(req), req.valid.body, req.user), 'Priority updated');
export const timeline = async (req, res) => ok(res, await svc.timeline(n(req), req.user, req.valid.query.filter));
export const comments = async (req, res) => ok(res, (await svc.timeline(n(req), req.user, 'comments')));
export const addComment = async (req, res) => created(res, await svc.addComment(n(req), req.valid.body, req.user, req.files || []), req.valid.body.internal ? 'Internal note added' : 'Comment posted');
export const history = async (req, res) => ok(res, await svc.history(n(req), req.user));
export const addAttachments = async (req, res) => created(res, await svc.addAttachments(n(req), req.files, req.user), 'Files attached');
export const approval = async (req, res) => ok(res, await svc.decideApproval(n(req), req.valid.body, req.user), req.valid.body.decision === 'approve' ? 'Request approved. Catalog tasks created.' : 'Request rejected');
export const csat = async (req, res) => ok(res, await svc.rate(n(req), req.valid.body.rating, req.user), 'Thanks for the rating');
export const bulk = async (req, res) => { const r = await svc.bulk(req.valid.body, req.user); ok(res, r, `Updated ${r.updated} tickets${r.skipped ? `. ${r.skipped} skipped because that change is not allowed for them.` : ''}`); };
export const linkProblem = async (req, res) => ok(res, await svc.linkProblem(n(req), req.valid.body.problemNumber, req.user), req.valid.body.problemNumber ? `Linked to ${req.valid.body.problemNumber}` : 'Problem unlinked');
export const createProblem = async (req, res) => created(res, await svc.createProblemFromTicket(n(req), req.valid.body, req.user), 'Problem created');
export const similar = async (req, res) => ok(res, { count: await svc.similarCount(n(req), req.user) });
export const declareMajor = async (req, res) => created(res, await mi.declare({ ...req.valid.body, ticketNumber: n(req) }, req.user), 'Major incident declared');

export async function exportCsv(req, res) {
  const rows = await svc.exportRows(req.valid.query, req.user);
  sendCsv(res, `tickets-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['ID', 'Type', 'Summary', 'Customer', 'Requester', 'Category', 'Priority', 'Status', 'Owner', 'Team', 'Created', 'SLA'],
    ...rows.map((t) => [t.number, t.kind, t.title, t.customer.name, t.requester.name, t.category.name, t.priorityName, t.status, t.assignee?.name || 'Unassigned', t.team?.name || '', t.createdAt, t.sla.label]),
  ]);
}
