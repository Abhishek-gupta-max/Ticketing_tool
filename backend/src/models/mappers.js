// Shape database rows into the API representation (camelCase, nested refs).
import { slaInfo } from '../utils/sla.js';
import { PRIORITY_NAMES } from '../constants/workflow.js';

const ref = (id, name, extra = {}) => (id ? { id, name, ...extra } : null);
const bool = (v) => v === 1 || v === true;

export function ticket(r, now = Date.now()) {
  if (!r) return null;
  return {
    id: r.id,
    number: r.ticket_number,
    kind: r.kind,
    title: r.title,
    description: r.description || '',
    customer: { id: r.customer_id, name: r.customer_name, isInternal: bool(r.customer_internal) },
    requester: { id: r.requester_id, name: r.requester_name, email: r.requester_email, vip: bool(r.requester_vip) },
    category: { id: r.category_id, name: r.category_name },
    team: ref(r.team_id, r.team_name),
    assignee: ref(r.assigned_to, r.assignee_name),
    channel: r.channel,
    impact: r.impact,
    urgency: r.urgency,
    priority: r.priority,
    priorityName: PRIORITY_NAMES[r.priority],
    status: r.status,
    holdReason: r.hold_reason || null,
    isMajor: bool(r.is_major),
    sla: {
      responseDueAt: r.sla_response_due_at,
      resolutionDueAt: r.sla_resolution_due_at,
      pausedAt: r.paused_at,
      pausedSeconds: r.paused_seconds,
      policyResolutionMinutes: r.policy_resolution_minutes,
      ...slaInfo(r, r.policy_resolution_minutes, now),
    },
    firstResponseAt: r.first_response_at,
    resolvedAt: r.resolved_at,
    closedAt: r.closed_at,
    resolutionCode: r.resolution_code || null,
    resolutionNotes: r.resolution_notes || null,
    csat: r.csat,
    reopenedCount: r.reopened_count,
    assetId: r.asset_id,
    problemId: r.problem_id,
    changeId: r.change_id,
    parentId: r.parent_ticket_id,
    requestId: r.request_id,
    catalogItemId: r.catalog_item_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function task(r) {
  if (!r) return null;
  const parentRoute = { ticket: 'tickets', problem: 'problems', change: 'changes' }[r.parent_type];
  return {
    id: r.id,
    number: r.task_number,
    type: r.type,
    title: r.title,
    description: r.description || '',
    state: r.state,
    priority: r.priority,
    assignee: ref(r.assigned_to, r.assignee_name),
    team: ref(r.team_id, r.team_name),
    dueAt: r.due_at,
    sortOrder: r.sort_order,
    isSequential: bool(r.is_sequential),
    closedAt: r.closed_at,
    closeNotes: r.close_notes || '',
    parent: r.parent_type ? { type: r.parent_type, number: r.parent_number, title: r.parent_title, status: r.parent_status, route: parentRoute } : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function problem(r) {
  if (!r) return null;
  return {
    id: r.id,
    number: r.problem_number,
    title: r.title,
    status: r.status,
    priority: r.priority,
    owner: ref(r.owner_id, r.owner_name),
    rootCause: r.root_cause || '',
    workaround: r.workaround || '',
    isKnownError: bool(r.is_known_error),
    resolutionCode: r.resolution_code || null,
    fixNotes: r.fix_notes || null,
    resolvedAt: r.resolved_at,
    incidentCount: Number(r.incident_count || 0),
    openIncidentCount: Number(r.open_incident_count || 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function change(r) {
  if (!r) return null;
  return {
    id: r.id,
    number: r.change_number,
    title: r.title,
    type: r.type,
    status: r.status,
    owner: ref(r.owner_id, r.owner_name),
    customer: ref(r.customer_id, r.customer_name),
    problem: r.problem_id ? { id: r.problem_id, number: r.problem_number } : null,
    plannedStart: r.planned_start,
    plannedEnd: r.planned_end,
    impact: r.impact,
    urgency: r.urgency,
    risk: r.risk,
    riskAnswers: { scope: r.risk_scope, downtime: r.risk_downtime, tested: bool(r.risk_tested), backout: bool(r.risk_backout) },
    description: r.description || '',
    implementationPlan: r.implementation_plan || '',
    backoutPlan: r.backout_plan || '',
    testPlan: r.test_plan || '',
    closeCode: r.close_code || null,
    closeNotes: r.close_notes || null,
    approvalSummary: r.approval_summary || 'Not yet requested',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function asset(r) {
  if (!r) return null;
  const isSub = bool(r.is_subscription), personal = bool(r.is_personal_device);
  const ownerId = isSub ? r.owner_person_id : personal ? (r.assigned_person_id || r.owner_person_id) : r.owner_person_id;
  const ownerName = isSub ? r.owner_name : personal ? (r.assigned_name || r.owner_name) : r.owner_name;
  return {
    id: r.id,
    tag: r.asset_tag,
    name: r.name,
    type: { id: r.asset_type_id, name: r.type_name, icon: r.type_icon, isSubscription: isSub, isPersonalDevice: personal },
    criticality: r.criticality,
    status: r.status,
    environment: r.environment,
    customer: { id: r.customer_id, name: r.customer_name, isInternal: bool(r.customer_internal) },
    department: r.department || '',
    location: r.location || '',
    serialNumber: r.serial_number || '',
    platform: r.platform || '',
    purchaseDate: r.purchase_date ? toDateString(r.purchase_date) : null,
    warrantyEnd: r.warranty_end ? toDateString(r.warranty_end) : null,
    assignedTo: r.assigned_person_id ? { id: r.assigned_person_id, name: r.assigned_name, jobTitle: r.assigned_title, department: r.assigned_dept } : null,
    ownedBy: r.owner_person_id ? { id: r.owner_person_id, name: r.owner_name, jobTitle: r.owner_title, department: r.owner_dept } : null,
    managedBy: ref(r.managed_by, r.managed_by_name),
    supportTeam: ref(r.support_team_id, r.support_team_name),
    owner: ownerId ? { id: ownerId, name: ownerName } : null,
    ownerLabel: isSub ? 'Application owner' : personal ? 'Device owner' : 'Business owner',
    notes: r.notes || '',
    openTickets: Number(r.open_tickets || 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** DATE columns come back as JS Dates at UTC midnight; keep them as YYYY-MM-DD. */
export function toDateString(v) {
  if (typeof v === 'string') return v.slice(0, 10);
  const d = new Date(v);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function article(r, tags = []) {
  if (!r) return null;
  return {
    id: r.id,
    number: r.article_number,
    title: r.title,
    category: { id: r.category_id, name: r.category_name },
    audience: r.audience,
    status: r.status,
    body: r.body,
    views: r.view_count,
    helpful: r.helpful_count,
    notHelpful: r.not_helpful_count,
    author: ref(r.author_id, r.author_name),
    publishedAt: r.published_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    tags,
  };
}

export function timelineEntry(r, files = []) {
  return {
    id: `${r.type === 'system' ? 's' : 'c'}${r.id}`,
    type: r.type,
    body: r.body,
    at: r.created_at,
    user: r.user_id ? { id: r.user_id, name: r.user_name } : null,
    files,
  };
}

export function attachment(r) {
  return {
    id: r.id,
    name: r.original_name,
    mimeType: r.mime_type,
    size: r.size_bytes,
    commentId: r.comment_id,
    uploadedBy: ref(r.uploaded_by, r.uploaded_by_name),
    createdAt: r.created_at,
  };
}
