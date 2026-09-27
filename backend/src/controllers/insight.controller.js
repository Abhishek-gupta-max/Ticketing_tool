// Controllers for assets, knowledge base, dashboard, reports, search,
// notifications, attachments and meta.
import fs from 'node:fs';
import * as assets from '../services/asset.service.js';
import * as kb from '../services/kb.service.js';
import * as dashboard from '../services/dashboard.service.js';
import * as reports from '../services/report.service.js';
import * as search from '../services/search.service.js';
import * as notifications from '../services/notification.service.js';
import * as attachments from '../services/attachment.service.js';
import * as meta from '../services/meta.service.js';
import * as audit from '../services/audit.service.js';
import { withTransaction } from '../config/database.js';
import { ok, created } from '../utils/response.js';
import { sendCsv } from '../utils/csv.js';
import { badRequest, unprocessable } from '../utils/AppError.js';
import { queryOne } from '../config/database.js';

const p = (req, k) => req.valid.params[k];
const stamp = () => new Date().toISOString().slice(0, 10);

export const asset = {
  list: async (req, res) => { const r = await assets.list(req.valid.query); ok(res, r.items, 'OK', { ...r.meta, kpis: r.kpis }); },
  options: async (req, res) => ok(res, await assets.options()),
  owners: async (req, res) => ok(res, await assets.owners()),
  get: async (req, res) => ok(res, await assets.get(p(req, 'tag'))),
  create: async (req, res) => created(res, await assets.create(req.valid.body, req.user), 'Asset added'),
  update: async (req, res) => ok(res, await assets.update(p(req, 'tag'), req.valid.body, req.user), 'Saved'),
  remove: async (req, res) => { await assets.remove(p(req, 'tag')); ok(res, null, 'Asset deleted'); },
  import: async (req, res) => {
    if (!req.file) throw badRequest('Choose a CSV file.');
    if (!/\.csv$/i.test(req.file.originalname)) throw badRequest('Choose a .csv file.');
    const r = await assets.importCsv(req.file.buffer.toString('utf8').replace(/^﻿/, ''), req.user);
    ok(res, r, r.imported ? `Imported ${r.imported} asset${r.imported > 1 ? 's' : ''}${r.errors.length ? `. ${r.errors.length} rows skipped.` : ''}` : 'Nothing was imported.');
  },
  export: async (req, res) => {
    const rows = await assets.exportRows(req.valid.query);
    sendCsv(res, `assets-${stamp()}.csv`, [
      ['ID', 'Name', 'Type', 'Criticality', 'Status', 'Environment', 'Customer', 'Location', 'Address or serial', 'Platform', 'Warranty', 'Device owner', 'Application or business owner', 'Managed by', 'Support group'],
      ...rows.map((a) => [a.tag, a.name, a.type.name, a.criticality, a.status, a.environment, a.customer.name, a.location, a.serialNumber, a.platform, a.warrantyEnd || '', a.assignedTo?.name || '', a.ownedBy?.name || '', a.managedBy?.name || '', a.supportTeam?.name || '']),
    ]);
  },
  template: (req, res) => sendCsv(res, 'asset-import-template.csv', [
    ['name', 'type', 'criticality', 'customer', 'location', 'serial', 'platform', 'warranty', 'device_owner_email', 'owner_email', 'managed_by_email', 'support_group'],
    ['LT-9001', 'Laptop', 'Medium', 'Veltrixsecure internal', 'Pune office', 'SN9001', 'Windows 11', '2027-06-30', '', '', '', 'Service desk'],
  ]),
};

export const article = {
  list: async (req, res) => { const r = await kb.list(req.valid.query, req.user); ok(res, r.items, 'OK', { kpis: r.kpis }); },
  get: async (req, res) => ok(res, await kb.get(p(req, 'number'), req.user)),
  create: async (req, res) => created(res, await kb.create(req.valid.body, req.user), 'Article saved'),
  update: async (req, res) => ok(res, await kb.update(p(req, 'number'), req.valid.body, req.user), 'Article saved'),
  status: async (req, res) => ok(res, await kb.setStatus(p(req, 'number'), req.valid.body.status, req.user), req.valid.body.status === 'Published' ? 'Published' : req.valid.body.status === 'Draft' ? 'Moved to drafts' : 'Archived'),
  remove: async (req, res) => { await kb.remove(p(req, 'number')); ok(res, null, 'Article deleted'); },
  vote: async (req, res) => ok(res, await kb.vote(p(req, 'number'), req.valid.body.helpful, req.user), 'Thanks for the feedback'),
};

export const dash = {
  overview: async (req, res) => ok(res, await dashboard.overview(req.user)),
  nav: async (req, res) => ok(res, await dashboard.navCounts(req.user)),
};

export const report = {
  summary: async (req, res) => ok(res, await reports.summary(req.valid.query)),
  process: async (req, res) => ok(res, await reports.processReport(req.valid.query)),
  csv: async (req, res) => {
    const rows = await reports.exportTickets(req.valid.query);
    sendCsv(res, `tickets-report-${stamp()}.csv`, [
      ['ID', 'Type', 'Summary', 'Customer', 'Category', 'Priority', 'Status', 'Owner', 'Created', 'Resolved', 'First response (min)', 'Resolution SLA', 'Satisfaction'],
      ...rows.map((t) => [t.ticket_number, t.kind, t.title, t.customer, t.category, t.priority, t.status, t.owner || 'Unassigned', t.created_at, t.resolved_at || '', t.frt ?? '', t.sla, t.csat || '']),
    ]);
  },
  json: async (req, res) => {
    const s = await reports.summary(req.valid.query);
    res.setHeader('Content-Disposition', `attachment; filename="report-summary-${stamp()}.json"`);
    res.json({ generated: new Date().toISOString(), rangeDays: s.range, customerId: req.valid.query.customerId || 'all', teamId: req.valid.query.teamId || 'all',
      created: s.current.created, resolved: s.current.resolved, slaCompliancePct: s.current.sla, medianFirstResponseMin: s.current.frt, meanTimeToResolveHours: s.current.mttr,
      csatAverage: s.current.csat, openBacklog: s.openNow });
  },
  schedules: async (req, res) => ok(res, await reports.schedules()),
  addSchedule: async (req, res) => created(res, await reports.addSchedule(req.valid.body, req.user), 'Report scheduled'),
  removeSchedule: async (req, res) => ok(res, await reports.removeSchedule(p(req, 'id')), 'Schedule removed'),
};

export const misc = {
  search: async (req, res) => ok(res, await search.search(req.query.q, req.user)),
  meta: async (req, res) => ok(res, await meta.meta(req.user)),
  notifications: async (req, res) => ok(res, await notifications.forUser(req.user)),
  readNotification: async (req, res) => { await notifications.markRead(req.user, p(req, 'id')); ok(res, null, 'Marked as read'); },
  readAll: async (req, res) => { await notifications.markAllRead(req.user); ok(res, null, 'All marked as read'); },
};

const INLINE_CSP = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox";

export const attachment = {
  download: async (req, res) => {
    const f = await attachments.openForDownload(p(req, 'id'), req.user);
    const inline = req.query.inline === '1' && f.inlineSafe;
    res.setHeader('Content-Type', f.mime.startsWith('text/') ? 'text/plain; charset=utf-8' : f.mime);
    res.setHeader('Content-Length', f.size);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', INLINE_CSP);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    fs.createReadStream(f.path).pipe(res);
  },
  remove: async (req, res) => {
    const a = await attachments.authorize(p(req, 'id'), req.user);
    await withTransaction(async (conn) => {
      await attachments.remove(conn, a.id);
      const text = `Removed attachment ${a.original_name}`;
      if (a.entity_type === 'ticket') {
        const t = await queryOne('SELECT status, ticket_number FROM tickets WHERE id = ?', [a.entity_id], conn);
        if (t.status === 'Closed') throw unprocessable('Closed tickets are read-only.');
        await conn.query('INSERT INTO ticket_activities (ticket_id, user_id, body) VALUES (?, ?, ?)', [a.entity_id, req.user.id, text]);
      } else {
        const table = { problem: 'problem_activities', change: 'change_activities', task: 'task_activities' }[a.entity_type];
        const fk = { problem: 'problem_id', change: 'change_id', task: 'task_id' }[a.entity_type];
        await conn.query(`INSERT INTO ${table} (${fk}, user_id, body) VALUES (?, ?, ?)`, [a.entity_id, req.user.id, text]);
      }
      await audit.log({ action: 'Removed attachment', entityType: a.entity_type, entityId: a.entity_id, entityRef: a.original_name }, conn);
    });
    ok(res, null, 'Attachment removed');
  },
};
