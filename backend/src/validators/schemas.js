import { z } from 'zod';
import { id, optId, nullableId, text, optText, bool, priority, level, isoDate, dateOnly, list, paging } from './common.js';
import { TICKET_STATUSES, TASK_STATES, TASK_TYPES, PROBLEM_STEPS, CHANGE_STEPS, CHANGE_TYPES, CRITICALITIES, ASSET_STATUSES, KB_STATUSES, KB_AUDIENCES } from '../constants/workflow.js';

// ---------- auth ----------
export const auth = {
  login: z.object({ email: z.string().trim().email('Enter a valid email address.').max(190), password: z.string().min(1, 'Enter your password.').max(200) }),
  forgot: z.object({ email: z.string().trim().email('Enter a valid email address.').max(190) }),
  reset: z.object({ token: z.string().regex(/^[a-f0-9]{64}$/, 'This reset link is invalid.'), password: z.string().min(1).max(128) }),
  change: z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(128) }),
};

// ---------- tickets ----------
const QUICK = ['open', 'mine', 'unassigned', 'breached', 'risk', 'onhold', 'resolved', 'all'];
export const tickets = {
  query: z.object({
    ...paging,
    quick: z.enum(QUICK).optional(),
    kind: z.enum(['incident', 'request']).optional(),
    status: list(z.enum(TICKET_STATUSES)),
    priority: list(priority),
    teamId: optId,
    assignee: z.union([z.literal('none'), z.literal('me'), z.string().regex(/^\d+$/)]).optional(),
    customerId: optId,
    categoryId: optId,
    problemId: optId,
    assetId: optId,
    withoutProblem: bool.optional(),
    search: optText(100),
    dateFrom: isoDate.optional(),
    dateTo: isoDate.optional(),
    sortBy: z.enum(['created', 'created_at', 'title', 'cust', 'customer', 'priority', 'status', 'assignee', 'sla', 'updated', 'updated_at', 'number']).optional(),
  }),
  create: z.object({
    kind: z.enum(['incident', 'request']).default('incident'),
    title: text(5, 255, 'Summary'),
    description: optText(20000),
    customerId: optId,
    requesterId: optId,
    categoryId: id,
    assetId: optId,
    impact: level.default(2),
    urgency: level.default(2),
    assignee: z.union([z.literal('auto'), z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (v === '' ? null : v)),
    teamId: optId,
    channel: optText(30),
    problemId: optId,
    parentNumber: optText(40),
  }),
  update: z.object({
    title: text(5, 255, 'Summary').optional(),
    description: optText(20000),
    categoryId: optId,
    teamId: optId,
    impact: level.optional(),
    urgency: level.optional(),
    assetId: nullableId.optional(),
    tags: z.array(z.string().trim().max(60)).max(20).optional(),
    holdReason: optText(60),
  }),
  status: z.object({
    status: z.enum(TICKET_STATUSES),
    holdReason: optText(60),
    comment: optText(10000),
    resolutionCode: optText(60),
    resolutionNotes: optText(10000),
    createArticle: bool.optional(),
  }),
  assign: z.object({ assigneeId: nullableId }),
  priority: z.object({ priority: priority.optional(), impact: level.optional(), urgency: level.optional() }).refine((v) => v.priority || v.impact || v.urgency, 'Give a priority or impact and urgency.'),
  comment: z.object({ body: optText(20000), internal: bool.optional(), holdAfter: bool.optional() }),
  approval: z.object({ decision: z.enum(['approve', 'reject']), comment: optText(2000) }),
  csat: z.object({ rating: z.coerce.number().int().min(1).max(5) }),
  bulk: z.object({ numbers: z.array(z.string().max(40)).min(1).max(100), assigneeId: nullableId.optional(), status: z.enum(['In Progress', 'On Hold', 'Closed']).optional() })
    .refine((v) => v.assigneeId !== undefined || v.status, 'Choose an assignee or a state.'),
  problemLink: z.object({ problemNumber: z.string().max(40).nullable() }),
  problemCreate: z.object({ title: text(5, 255, 'Summary'), priority: priority.default(3), ownerId: optId, linkSimilar: bool.optional() }),
  activityQuery: z.object({ filter: z.enum(['all', 'comments', 'notes', 'system']).default('all') }),
};

export const majors = {
  declare: z.object({ ticketNumber: z.string().max(40), impact: text(5, 2000, 'Customer impact'), commanderId: id }),
  update: z.object({ body: text(1, 5000, 'Update') }),
  resolve: z.object({ summary: text(5, 5000, 'Summary') }),
};

// ---------- tasks ----------
export const tasks = {
  query: z.object({
    ...paging,
    quick: z.enum(['mine', 'open', 'overdue', 'unassigned', 'closed', 'all']).optional(),
    type: z.enum(TASK_TYPES).optional(),
    teamId: optId,
    assignee: z.union([z.literal('none'), z.string().regex(/^\d+$/)]).optional(),
    state: z.enum(TASK_STATES).optional(),
    search: optText(100),
    sortBy: z.enum(['due', 'created', 'number', 'priority', 'state', 'title']).optional(),
  }),
  create: z.object({
    title: text(3, 255, 'Summary'), description: optText(10000), parentNumber: optText(40), teamId: id, assigneeId: optId,
    priority: priority.default(3), dueAt: isoDate.optional().nullable(),
  }),
  update: z.object({ priority: priority.optional(), teamId: optId, assigneeId: nullableId.optional(), dueAt: isoDate.nullable().optional() }),
  state: z.object({ state: z.enum(TASK_STATES), note: optText(5000) }),
  note: z.object({ body: text(1, 10000, 'Note') }),
};

// ---------- catalog and requests ----------
const field = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/, 'Field keys use lowercase letters, digits and _'),
  label: text(1, 120, 'Label'), type: z.enum(['text', 'textarea', 'select', 'date']), required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
});
export const catalog = {
  item: z.object({
    name: text(3, 120, 'Name'), categoryId: id, icon: z.enum(['user', 'box', 'mail', 'key', 'shield', 'monitor', 'laptop', 'db', 'wifi', 'cloud', 'server']).default('box'),
    description: text(5, 500, 'Description'), requiresApproval: z.boolean().default(false), fulfilmentHours: z.coerce.number().int().min(1).max(2000),
    isActive: z.boolean().default(true), fields: z.array(field).max(20).default([]), tasks: z.array(z.string().trim().min(2).max(200)).max(20).default([]),
  }),
};
export const requests = {
  query: z.object({ ...paging, search: optText(100) }),
  submit: z.object({
    customerId: optId, requestedForId: optId,
    items: z.array(z.object({ catalogItemId: id, values: z.record(z.string(), z.string().max(4000)).default({}) })).min(1, 'Add at least one item.').max(20),
  }),
};

// ---------- problems ----------
export const problems = {
  query: z.object({ view: z.enum(['open', 'known', 'resolved', 'all']).default('open'), search: optText(100) }),
  create: z.object({ title: text(5, 255, 'Summary'), priority: priority.default(3), ownerId: optId }),
  update: z.object({ title: text(5, 255, 'Summary').optional(), rootCause: optText(20000), workaround: optText(20000), priority: priority.optional(), ownerId: optId }),
  status: z.object({ status: z.enum(PROBLEM_STEPS), resolutionCode: optText(60), fixNotes: optText(10000), resolveLinked: bool.optional() }),
  note: z.object({ body: text(1, 10000, 'Note') }),
  link: z.object({ ticketNumber: z.string().max(40) }),
  suggestion: z.object({ title: text(3, 255, 'Title') }),
};

// ---------- changes ----------
const changeBody = z.object({
  title: text(5, 255, 'Summary'), type: z.enum(CHANGE_TYPES), ownerId: id, customerId: optId, description: optText(20000),
  plannedStart: isoDate, plannedEnd: isoDate.optional(), durationHours: z.coerce.number().min(1).max(72).optional(),
  impact: level.optional(), urgency: level.optional(),
  riskScope: z.coerce.number().int().min(1).max(3), riskDowntime: z.coerce.number().int().min(0).max(2), riskTested: z.boolean(), riskBackout: z.boolean(),
  implementationPlan: optText(20000), backoutPlan: optText(20000), assetIds: z.array(id).max(100).optional(),
});
export const changes = {
  query: z.object({ view: z.enum(['active', 'Approval', 'Closed', 'all']).default('active'), from: isoDate.optional(), to: isoDate.optional(), search: optText(100) }),
  create: changeBody.extend({ ticketNumbers: z.array(z.string().max(40)).max(20).optional(), problemNumber: optText(40), submit: z.boolean().optional() }),
  update: changeBody,
  fields: z.object({ implementationPlan: optText(20000), backoutPlan: optText(20000), testPlan: optText(20000) }),
  schedule: z.object({ plannedStart: isoDate.optional(), plannedEnd: isoDate.optional() }),
  owner: z.object({ ownerId: id }),
  transition: z.object({ to: z.enum([...CHANGE_STEPS, 'Canceled']), closeCode: optText(60), closeNotes: optText(10000), force: z.boolean().optional() }),
  decision: z.object({ decision: z.enum(['approve', 'reject']), comment: optText(2000) }),
};

// ---------- assets ----------
export const assets = {
  query: z.object({
    ...paging, search: optText(100), typeId: optId, criticality: z.enum(CRITICALITIES).optional(), status: z.enum(ASSET_STATUSES).optional(),
    customerId: optId, teamId: optId, ownerId: optId, sortBy: z.enum(['tag', 'name', 'type', 'criticality', 'status', 'warranty', 'updated']).optional(),
  }),
  body: z.object({
    name: text(2, 160, 'Name'), typeId: id, criticality: z.enum(CRITICALITIES), status: z.enum(ASSET_STATUSES), environment: optText(40),
    customerId: id, department: optText(80), location: optText(120), serialNumber: optText(120), platform: optText(120),
    purchaseDate: dateOnly.nullable().optional(), warrantyEnd: dateOnly.nullable().optional(), assignedToId: nullableId.optional(), ownedById: nullableId.optional(),
    managedById: nullableId.optional(), supportTeamId: nullableId.optional(), notes: optText(5000), dependsOnIds: z.array(id).max(100).optional(),
  }),
};

// ---------- knowledge base ----------
export const kb = {
  query: z.object({ search: optText(100), categoryId: optId, audience: z.enum(KB_AUDIENCES).optional(), status: z.enum([...KB_STATUSES, 'all']).optional() }),
  body: z.object({
    title: text(5, 255, 'Title'), categoryId: id, audience: z.enum(KB_AUDIENCES).default('Public'), status: z.enum(KB_STATUSES).default('Draft'),
    body: text(10, 100000, 'Content'), tags: z.array(z.string().trim().max(60)).max(15).default([]),
  }),
  status: z.object({ status: z.enum(KB_STATUSES) }),
  vote: z.object({ helpful: z.boolean() }),
};

// ---------- reports ----------
export const reports = {
  query: z.object({ range: z.coerce.number().refine((v) => [7, 30, 90].includes(v), 'Use 7, 30 or 90.').default(30), customerId: optId, teamId: optId,
    tab: z.enum(['incident', 'request', 'problem', 'change', 'security']).optional() }),
  schedule: z.object({ name: text(2, 120, 'Name'), frequency: z.enum(['Daily', 'Weekly', 'Monthly']), format: z.enum(['PDF', 'CSV']), recipient: z.string().trim().email('Enter a valid email address.'), when: text(2, 60, 'When') }),
};

// ---------- settings / admin ----------
export const settings = {
  general: z.object({
    name: text(2, 120, 'Organisation name').optional(), timezone: optText(60),
    hours: z.object({ start: z.string().regex(/^\d{2}:\d{2}$/).optional(), end: z.string().regex(/^\d{2}:\d{2}$/).optional(), days: z.array(z.number().int().min(0).max(6)).max(7).optional() }).optional(),
  }),
  sla: z.object({ rows: z.array(z.object({ priority, responseMinutes: z.coerce.number().int().min(1).max(525600), resolutionMinutes: z.coerce.number().int().min(1).max(525600) })).min(1).max(4) }),
  rule: z.object({ enabled: z.boolean() }),
  autoClose: z.object({ days: z.coerce.number().int().min(1).max(30) }),
  routing: z.object({ categoryId: id, teamId: id }),
  notifications: z.object({ newAssigned: z.boolean().optional(), breachWarn: z.boolean().optional(), majorIncident: z.boolean().optional(), approvals: z.boolean().optional(), dailyDigest: z.boolean().optional() }),
  integration: z.object({ on: z.boolean().optional(), url: z.string().trim().max(500).refine((v) => !v || /^https:\/\//.test(v), 'Use an https:// URL.').optional(), address: z.string().email().optional() }),
  cab: z.object({ approvers: z.array(z.object({ userId: id, role: text(2, 60, 'Role') })).max(10) }),
  canned: z.object({ name: text(2, 120, 'Name'), body: text(2, 5000, 'Text') }),
};

export const users = {
  create: z.object({ name: text(3, 120, 'Name'), email: z.string().trim().email('Enter a valid email address.').max(190), role: z.enum(['Agent', 'Manager', 'Admin']), teamIds: z.array(id).min(1, 'Choose at least one team.'), password: z.string().max(128) }),
  update: z.object({ name: text(3, 120, 'Name').optional(), email: z.string().trim().email().max(190).optional(), role: z.enum(['Agent', 'Manager', 'Admin']).optional(), teamIds: z.array(id).min(1).optional(), password: z.string().max(128).optional().or(z.literal('').transform(() => undefined)) }),
  status: z.object({ active: z.boolean() }),
};

export const teams = {
  body: z.object({ name: text(2, 120, 'Team name'), type: z.enum(['Support', 'Approval']), managerId: nullableId.optional(), description: optText(500), email: z.string().trim().email('Enter a valid email address.').max(190).optional().or(z.literal('')), memberIds: z.array(id).optional() }),
  member: z.object({ userId: id }),
  onCall: z.object({ on: z.boolean() }),
};

export const customers = {
  create: z.object({ name: text(2, 160, 'Name'), plan: z.enum(['Enterprise', 'Business', 'Starter']) }),
  peopleQuery: z.object({ customerId: optId, search: optText(100) }),
  person: z.object({ customerId: id, name: text(3, 120, 'Name'), email: z.string().trim().email('Enter a valid email address.').max(190), department: optText(80), jobTitle: optText(80), location: optText(80), phone: optText(40), vip: z.boolean().default(false) }),
  vip: z.object({ vip: z.boolean() }),
};

export const audit = {
  query: z.object({ ...paging, userId: optId, entityType: optText(40), entityRef: optText(60), search: optText(100), from: isoDate.optional(), to: isoDate.optional() }),
};
