// Presentation constants only. Business values (categories, channels, SLA,
// codes) come from the API through useMeta().
export const PRI = { 1: 'Critical', 2: 'High', 3: 'Medium', 4: 'Low' };
export const PRI_OPTIONS = [[1, 'P1 Critical'], [2, 'P2 High'], [3, 'P3 Medium'], [4, 'P4 Low']];
export const IU_OPTIONS = [[1, '1 - High'], [2, '2 - Medium'], [3, '3 - Low']];
export const OPEN_ST = ['New', 'In Progress', 'On Hold', 'Awaiting approval'];
export const ST_CLS = { New: 'info', 'In Progress': 'ok', 'On Hold': 'warn', 'Awaiting approval': 'violet', Resolved: 'grey', Closed: 'grey' };
export const TST_CLS = { Waiting: 'grey', Ready: 'info', 'In progress': 'ok', Done: 'grey', 'Not done': 'bad', 'Not needed': 'grey' };
export const TASK_DONE = ['Done', 'Not done', 'Not needed'];
export const CHG_CLS = { Draft: 'grey', 'Risk review': 'info', Approval: 'warn', Scheduled: 'info', Doing: 'bad', Verify: 'violet', Closed: 'ok', Canceled: 'grey' };
export const CHG_DONE = ['Closed', 'Canceled'];
export const HOLD_REQUESTER = 'Waiting for requester';

export const QUICK_VIEWS = [['open', 'All open'], ['mine', 'Mine'], ['unassigned', 'Unassigned'], ['breached', 'Breached'], ['risk', 'At risk'], ['onhold', 'On hold'], ['resolved', 'Resolved'], ['all', 'All']];
export const TASK_VIEWS = [['mine', 'Assigned to me'], ['open', 'All open'], ['overdue', 'Overdue'], ['unassigned', 'Unassigned'], ['closed', 'Closed'], ['all', 'All']];
export const PAGE_SIZE = 25;

export const NAV = [
  ['Work', [
    ['grid', 'Overview', '/overview', 'dashboard:view', null],
    ['ticket', 'Tickets', '/tickets', 'ticket:view', 'tickets'],
    ['alert', 'Incidents', '/incidents', 'ticket:view_all', 'incidents'],
    ['task', 'Tasks', '/tasks', 'task:view', 'tasks'],
    ['inbox', 'Service requests', '/requests', 'request:view', 'requests'],
    ['search', 'Problems', '/problems', 'problem:view', 'problems'],
    ['branch', 'Changes', '/changes', 'change:view', 'changes'],
    ['approve', 'Approvals', '/approvals', 'approval:view', 'approvals'],
  ]],
  ['Insight', [
    ['chart', 'Reports', '/reports', 'report:view', null],
    ['server', 'Assets', '/assets', 'asset:view', null],
    ['book', 'Knowledge base', '/kb', 'kb:view', null],
    ['gear', 'Settings', '/settings', 'settings:manage', null],
  ]],
];
