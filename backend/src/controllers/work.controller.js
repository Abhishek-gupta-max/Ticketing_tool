// Controllers for tasks, requests/catalog, problems, changes, approvals and major incidents.
import * as tasks from '../services/task.service.js';
import * as requests from '../services/request.service.js';
import * as catalog from '../services/catalog.service.js';
import * as problems from '../services/problem.service.js';
import * as changes from '../services/change.service.js';
import * as approvals from '../services/approval.service.js';
import * as mi from '../services/majorIncident.service.js';
import { ok, created } from '../utils/response.js';

const p = (req, k) => req.valid.params[k];

export const task = {
  list: async (req, res) => { const r = await tasks.list(req.valid.query, req.user); ok(res, r.items, 'OK', { ...r.meta, kpis: r.kpis }); },
  get: async (req, res) => ok(res, await tasks.get(p(req, 'number'))),
  create: async (req, res) => created(res, await tasks.create(req.valid.body, req.user), 'Task created'),
  update: async (req, res) => ok(res, await tasks.update(p(req, 'number'), req.valid.body, req.user), 'Task updated'),
  state: async (req, res) => ok(res, await tasks.setState(p(req, 'number'), req.valid.body, req.user), `${p(req, 'number')}: ${req.valid.body.state}`),
  note: async (req, res) => created(res, await tasks.addNote(p(req, 'number'), req.valid.body.body, req.user), 'Work note added'),
  attach: async (req, res) => created(res, await tasks.addAttachments(p(req, 'number'), req.files, req.user), 'Files attached'),
};

export const request = {
  catalog: async (req, res) => ok(res, await requests.catalog({ includeInactive: req.query.all === 'true' && req.user.can('catalog:manage') })),
  kpis: async (req, res) => ok(res, await requests.kpis()),
  list: async (req, res) => { const r = await requests.list(req.valid.query, req.user); ok(res, r.items, 'OK', r.meta); },
  get: async (req, res) => ok(res, await requests.get(p(req, 'number'), req.user)),
  submit: async (req, res) => {
    const r = await requests.submit(req.valid.body, req.user, req.files || []);
    created(res, r, `${r.reqNumber} submitted with ${r.items.length} item${r.items.length > 1 ? 's' : ''}`);
  },
  createItem: async (req, res) => created(res, await catalog.create(req.valid.body, req.user), 'Catalog item created'),
  updateItem: async (req, res) => ok(res, await catalog.update(p(req, 'id'), req.valid.body, req.user), 'Catalog item saved'),
};

export const problem = {
  list: async (req, res) => ok(res, await problems.list(req.valid.query)),
  options: async (req, res) => ok(res, await problems.options()),
  get: async (req, res) => ok(res, await problems.get(p(req, 'number'))),
  create: async (req, res) => created(res, await problems.create(req.valid.body, req.user), 'Problem created'),
  fromSuggestion: async (req, res) => { const r = await problems.createFromSuggestion(req.valid.body.title, req.user); created(res, r.problem, `${r.problem.number} created with ${r.linked} incidents`); },
  update: async (req, res) => ok(res, await problems.update(p(req, 'number'), req.valid.body, req.user), 'Saved'),
  status: async (req, res) => { const r = await problems.changeStatus(p(req, 'number'), req.valid.body, req.user); ok(res, r.problem, r.problem.status === 'Fixed' ? `${r.problem.number} marked as fixed${r.resolvedIncidents ? `. ${r.resolvedIncidents} incidents resolved.` : ''}` : `${r.problem.number}: ${r.problem.status}`); },
  knownError: async (req, res) => ok(res, await problems.toggleKnownError(p(req, 'number'), req.user), 'Known error updated'),
  note: async (req, res) => created(res, await problems.addNote(p(req, 'number'), req.valid.body.body, req.user), 'Work note added'),
  link: async (req, res) => ok(res, await problems.linkIncident(p(req, 'number'), req.valid.body.ticketNumber, req.user), 'Incident linked'),
  attach: async (req, res) => created(res, await problems.addAttachments(p(req, 'number'), req.files, req.user), 'Files attached'),
};

export const change = {
  list: async (req, res) => ok(res, await changes.list(req.valid.query)),
  get: async (req, res) => ok(res, await changes.get(p(req, 'number'))),
  create: async (req, res) => { const r = await changes.create(req.valid.body, req.user); created(res, r.change, r.submitError ? `${r.change.number} saved. ${r.submitError}` : `${r.change.number} saved`); },
  update: async (req, res) => ok(res, await changes.update(p(req, 'number'), req.valid.body, req.user), 'Saved'),
  fields: async (req, res) => ok(res, await changes.updateFields(p(req, 'number'), req.valid.body, req.user), 'Saved'),
  schedule: async (req, res) => ok(res, await changes.reschedule(p(req, 'number'), req.valid.body, req.user), 'Window changed'),
  owner: async (req, res) => ok(res, await changes.setOwner(p(req, 'number'), req.valid.body.ownerId, req.user), 'Assignment updated'),
  transition: async (req, res) => ok(res, await changes.transition(p(req, 'number'), req.valid.body, req.user), `${p(req, 'number')}: ${req.valid.body.to}`),
  decide: async (req, res) => ok(res, await changes.decide(p(req, 'number'), p(req, 'approvalId'), req.valid.body, req.user), 'Decision recorded'),
  attach: async (req, res) => created(res, await changes.addAttachments(p(req, 'number'), req.files, req.user), 'Files attached'),
};

export const approval = {
  overview: async (req, res) => ok(res, await approvals.overview(req.user)),
};

export const major = {
  overview: async (req, res) => ok(res, await mi.overview()),
  declare: async (req, res) => created(res, await mi.declare(req.valid.body, req.user), 'Major incident declared'),
  update: async (req, res) => created(res, await mi.postUpdate(p(req, 'id'), req.valid.body.body, req.user), 'Update posted'),
  resolve: async (req, res) => ok(res, await mi.resolve(p(req, 'id'), req.valid.body.summary, req.user), 'Major incident resolved'),
};
