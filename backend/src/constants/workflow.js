// Workflow states and rules. These drive business logic, so they live in code;
// pick lists that are pure configuration (channels, hold reasons, codes) live
// in the lookup_values table instead.

export const PRIORITY_NAMES = { 1: 'Critical', 2: 'High', 3: 'Medium', 4: 'Low' };

export const TICKET_STATUSES = ['New', 'In Progress', 'On Hold', 'Awaiting approval', 'Resolved', 'Closed'];
export const OPEN_STATUSES = ['New', 'In Progress', 'On Hold', 'Awaiting approval'];
export const TICKET_KINDS = ['incident', 'request'];

export const WAITING_FOR_REQUESTER = 'Waiting for requester';
export const REQUEST_REJECTED_CODE = 'Request rejected';

export const IMPACT_LABELS = ['', 'High: many users or a critical service', 'Medium: a team or a single important user', 'Low: one user, workaround exists'];
export const URGENCY_LABELS = ['', 'High: work is blocked now', 'Medium: work is slowed', 'Low: can wait'];

/** Priority from impact and urgency (1 = high). */
export const PRIORITY_MATRIX = [[1, 2, 3], [2, 3, 4], [3, 4, 4]];
export const priorityOf = (impact, urgency) => PRIORITY_MATRIX[impact - 1][urgency - 1];

/** States a ticket may move to from its current state. */
export function allowedTicketStates(status) {
  switch (status) {
    case 'New': return ['New', 'In Progress', 'On Hold', 'Resolved'];
    case 'In Progress': return ['In Progress', 'On Hold', 'Resolved'];
    case 'On Hold': return ['On Hold', 'In Progress', 'Resolved'];
    case 'Resolved': return ['Resolved', 'In Progress', 'Closed'];
    default: return [status];
  }
}

export const TASK_STATES = ['Waiting', 'Ready', 'In progress', 'Done', 'Not done', 'Not needed'];
export const TASK_CLOSED_STATES = ['Done', 'Not done', 'Not needed'];
export const TASK_TYPES = ['Task', 'Incident task', 'Catalog task', 'Change task', 'Problem task'];

export function allowedTaskStates(state) {
  if (TASK_CLOSED_STATES.includes(state)) return [state];
  if (state === 'Waiting') return ['Waiting'];
  return ['Ready', 'In progress', 'Done', 'Not done', 'Not needed'];
}

export const PROBLEM_STEPS = ['Logged', 'Investigating', 'Finding cause', 'Fix underway', 'Fixed', 'Closed'];
export const PROBLEM_OPEN = ['Logged', 'Investigating', 'Finding cause', 'Fix underway'];

export const CHANGE_TYPES = ['Standard', 'Normal', 'Emergency'];
export const CHANGE_STEPS = ['Draft', 'Risk review', 'Approval', 'Scheduled', 'Doing', 'Verify', 'Closed'];
export const CHANGE_STEPS_STANDARD = ['Draft', 'Scheduled', 'Doing', 'Verify', 'Closed'];
export const CHANGE_DONE = ['Closed', 'Canceled'];
export const CHANGE_CANCELABLE = ['Draft', 'Risk review', 'Approval', 'Scheduled'];
export const CHANGE_DEFAULT_TASKS = ['Notify affected users', 'Take a snapshot or configuration backup', 'Apply the change', 'Run the post-change checks'];

/** Risk score 1..9 from the four risk questions. */
export const changeScore = ({ scope = 1, downtime = 0, tested = true, backout = true }) =>
  (scope || 1) + (downtime || 0) + (tested ? 0 : 2) + (backout ? 0 : 2);
export const riskOf = (score) => (score <= 3 ? 'Low' : score <= 5 ? 'Medium' : 'High');

export const ASSET_STATUSES = ['In use', 'In maintenance', 'In stock', 'Retired'];
export const CRITICALITIES = ['Low', 'Medium', 'High', 'Critical'];

export const KB_STATUSES = ['Draft', 'Published', 'Archived'];
export const KB_AUDIENCES = ['Public', 'Internal'];

export const APPROVAL_STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled'];

// Number prefixes for server-generated record numbers.
export const NUMBER_PREFIX = { incident: 'INC', request: 'REQ', task: 'TSK', change: 'CHG', problem: 'PRB', kb: 'KB', asset: 'AST', major: 'MI' };

export const REQUEST_RESPONSE_MINUTES = 120;
