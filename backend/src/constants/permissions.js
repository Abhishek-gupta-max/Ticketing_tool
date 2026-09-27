// Granular permissions. The backend authorises every protected route with
// these; the frontend receives the same list to decide which controls to show.

export const P = Object.freeze({
  DASHBOARD_VIEW: 'dashboard:view',

  TICKET_VIEW: 'ticket:view',
  TICKET_VIEW_ALL: 'ticket:view_all',
  TICKET_CREATE: 'ticket:create',
  TICKET_UPDATE: 'ticket:update',
  TICKET_DELETE: 'ticket:delete',
  TICKET_ASSIGN: 'ticket:assign',
  TICKET_CLOSE: 'ticket:close',
  TICKET_COMMENT: 'ticket:comment',
  TICKET_NOTE: 'ticket:note',
  TICKET_EXPORT: 'ticket:export',
  MAJOR_DECLARE: 'major:declare',

  REQUEST_VIEW: 'request:view',
  REQUEST_CREATE: 'request:create',
  REQUEST_APPROVE: 'request:approve',
  CATALOG_VIEW: 'catalog:view',
  CATALOG_MANAGE: 'catalog:manage',

  TASK_VIEW: 'task:view',
  TASK_CREATE: 'task:create',
  TASK_UPDATE: 'task:update',

  PROBLEM_VIEW: 'problem:view',
  PROBLEM_CREATE: 'problem:create',
  PROBLEM_UPDATE: 'problem:update',

  CHANGE_VIEW: 'change:view',
  CHANGE_CREATE: 'change:create',
  CHANGE_UPDATE: 'change:update',
  CHANGE_APPROVE: 'change:approve',
  APPROVAL_VIEW: 'approval:view',
  APPROVAL_OVERRIDE: 'approval:override',

  ASSET_VIEW: 'asset:view',
  ASSET_CREATE: 'asset:create',
  ASSET_UPDATE: 'asset:update',
  ASSET_DELETE: 'asset:delete',
  ASSET_IMPORT: 'asset:import',

  KB_VIEW: 'kb:view',
  KB_VIEW_INTERNAL: 'kb:view_internal',
  KB_CREATE: 'kb:create',
  KB_UPDATE: 'kb:update',
  KB_PUBLISH: 'kb:publish',
  KB_DELETE: 'kb:delete',

  ATTACHMENT_UPLOAD: 'attachment:upload',
  ATTACHMENT_DELETE: 'attachment:delete',

  REPORT_VIEW: 'report:view',
  REPORT_SCHEDULE: 'report:schedule',

  USER_VIEW: 'user:view',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  TEAM_MANAGE: 'team:manage',
  CUSTOMER_VIEW: 'customer:view',
  CUSTOMER_MANAGE: 'customer:manage',
  SETTINGS_MANAGE: 'settings:manage',
  AUDIT_VIEW: 'audit:view',
  DATA_EXPORT: 'data:export',
});

export const PERMISSION_DESCRIPTIONS = {
  'dashboard:view': 'See the agent overview',
  'ticket:view': 'View tickets',
  'ticket:view_all': 'View every ticket, not only your own requests',
  'ticket:create': 'Create tickets',
  'ticket:update': 'Edit tickets and change their state',
  'ticket:delete': 'Delete tickets',
  'ticket:assign': 'Assign tickets',
  'ticket:close': 'Close tickets',
  'ticket:comment': 'Reply on tickets',
  'ticket:note': 'Add internal work notes and see them',
  'ticket:export': 'Export ticket lists',
  'major:declare': 'Declare and run major incidents',
  'request:view': 'View service requests',
  'request:create': 'Order from the service catalog',
  'request:approve': 'Approve or reject catalog requests',
  'catalog:view': 'Browse the service catalog',
  'catalog:manage': 'Create and edit catalog items',
  'task:view': 'View tasks',
  'task:create': 'Create tasks',
  'task:update': 'Update tasks',
  'problem:view': 'View problems',
  'problem:create': 'Create problems',
  'problem:update': 'Update problems',
  'change:view': 'View changes',
  'change:create': 'Create changes',
  'change:update': 'Edit and move changes',
  'change:approve': 'Decide on change approvals assigned to you',
  'approval:view': 'See the approvals queue',
  'approval:override': 'Decide approvals on behalf of another approver',
  'asset:view': 'View assets',
  'asset:create': 'Create assets',
  'asset:update': 'Edit assets',
  'asset:delete': 'Delete assets',
  'asset:import': 'Import assets from CSV',
  'kb:view': 'Read public knowledge articles',
  'kb:view_internal': 'Read internal articles and drafts',
  'kb:create': 'Write knowledge articles',
  'kb:update': 'Edit knowledge articles',
  'kb:publish': 'Publish and unpublish articles',
  'kb:delete': 'Delete knowledge articles',
  'attachment:upload': 'Upload attachments',
  'attachment:delete': 'Remove attachments',
  'report:view': 'View reports',
  'report:schedule': 'Schedule reports',
  'user:view': 'List agents',
  'user:create': 'Create agents and logins',
  'user:update': 'Edit agents and logins',
  'team:manage': 'Create and edit teams',
  'customer:view': 'Look up customers and requesters',
  'customer:manage': 'Create customers and requesters',
  'settings:manage': 'Change settings, SLA and automation',
  'audit:view': 'Read the audit log',
  'data:export': 'Export all data',
};

const ALL = Object.values(P);

const AGENT = [
  P.DASHBOARD_VIEW,
  P.TICKET_VIEW, P.TICKET_VIEW_ALL, P.TICKET_CREATE, P.TICKET_UPDATE, P.TICKET_ASSIGN, P.TICKET_CLOSE,
  P.TICKET_COMMENT, P.TICKET_NOTE, P.TICKET_EXPORT, P.MAJOR_DECLARE,
  P.REQUEST_VIEW, P.REQUEST_CREATE, P.CATALOG_VIEW,
  P.TASK_VIEW, P.TASK_CREATE, P.TASK_UPDATE,
  P.PROBLEM_VIEW, P.PROBLEM_CREATE, P.PROBLEM_UPDATE,
  P.CHANGE_VIEW, P.CHANGE_CREATE, P.CHANGE_UPDATE, P.CHANGE_APPROVE, P.APPROVAL_VIEW,
  P.ASSET_VIEW, P.ASSET_CREATE, P.ASSET_UPDATE,
  P.KB_VIEW, P.KB_VIEW_INTERNAL, P.KB_CREATE, P.KB_UPDATE, P.KB_PUBLISH,
  P.ATTACHMENT_UPLOAD, P.ATTACHMENT_DELETE,
  P.REPORT_VIEW, P.USER_VIEW, P.CUSTOMER_VIEW,
];

const MANAGER = [...AGENT, P.REQUEST_APPROVE, P.KB_DELETE, P.TICKET_DELETE, P.ASSET_DELETE, P.REPORT_SCHEDULE];

const CUSTOMER = [
  P.TICKET_VIEW, P.TICKET_CREATE, P.TICKET_COMMENT,
  P.REQUEST_VIEW, P.REQUEST_CREATE, P.CATALOG_VIEW,
  P.KB_VIEW, P.ATTACHMENT_UPLOAD,
];

export const ROLES = Object.freeze({ ADMIN: 'Admin', MANAGER: 'Manager', AGENT: 'Agent', CUSTOMER: 'Customer' });

export const ROLE_DEFINITIONS = [
  { name: ROLES.ADMIN, description: 'Full access, including settings, people, teams and data.', permissions: ALL },
  { name: ROLES.MANAGER, description: 'Agent access plus approvals and deletions.', permissions: MANAGER },
  { name: ROLES.AGENT, description: 'Works tickets, tasks, problems, changes and assets.', permissions: AGENT },
  { name: ROLES.CUSTOMER, description: 'Portal user: raises and follows their own tickets and requests.', permissions: CUSTOMER },
];

export const STAFF_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.AGENT];
