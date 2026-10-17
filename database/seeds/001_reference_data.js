// Reference data required by the application. Safe to run more than once:
// existing records are never overwritten (values an administrator changed stay).

const PRIORITIES = [
  [1, 'Critical', 15, 240],
  [2, 'High', 30, 480],
  [3, 'Medium', 120, 1440],
  [4, 'Low', 240, 4320],
];

const LOOKUPS = {
  channel: ['Portal', 'Email', 'Phone', 'Chat', 'Monitoring'],
  hold_reason: ['Waiting for requester', 'Waiting for a change', 'Waiting for a fix', 'Waiting for supplier'],
  resolution_code: ['Fixed', 'Workaround given', 'Fixed remotely', 'Guidance given', 'Resolved by requester', 'Duplicate', 'Cannot reproduce', "Won't fix", 'Cancelled by requester'],
  problem_code: ['Fixed permanently', 'Workaround accepted', 'Duplicate problem'],
  change_close_code: ['Worked as planned', 'Worked with problems', 'Did not work'],
  department: ['Finance', 'Engineering', 'Operations', 'HR', 'Sales'],
  environment: ['Production', 'Staging', 'Development', 'Disaster recovery'],
  timezone: ['Asia/Kolkata', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore', 'Australia/Sydney'],
};

const ASSET_TYPES = [
  ['Server', 'server', 0, 0], ['Laptop', 'laptop', 0, 1], ['Mobile device', 'monitor', 0, 1], ['Network device', 'wifi', 0, 0], ['Firewall', 'shield', 0, 0],
  ['Application', 'box', 1, 0], ['Cloud service', 'cloud', 1, 0], ['Printer', 'monitor', 0, 0], ['Other', 'monitor', 0, 0],
];

const KB_CATEGORIES = ['Access and identity', 'Software and apps', 'Hardware and devices', 'Network and VPN', 'Security alerts', 'Onboarding and HR', 'Facilities and other'];

const RULES = [
  ['r1', 'Route security alerts to Security operations', 'When the category is Security alerts, the ticket goes to the Security operations team.', 1],
  ['r2', 'Assign critical tickets to the on-call agent', 'Critical tickets go to the on-call person of the assignment group when nobody is chosen.', 1],
  ['r3', 'Auto-close resolved tickets after a set number of days', 'Resolved tickets close by themselves after the number of days below.', 1],
  ['r4', 'Raise priority by one level for VIP requesters', 'A VIP requester gets one priority level higher, up to critical.', 0],
  ['r5', 'Use the support group of the affected asset', 'When a ticket names a configuration item, its support group becomes the assignment group.', 1],
];

const CANNED = [
  ['Acknowledge', 'Thanks for getting in touch. I have picked this up and will update you shortly.'],
  ['Need more information', 'Could you share a few more details so I can investigate? Please include when this started and any error messages you see.'],
  ['Resolved, please confirm', 'I have applied a fix and everything looks normal on our side. Please let me know if you still see the problem and I will reopen this ticket.'],
  ['Waiting on you', 'I am waiting for your reply before I can continue. This ticket will be paused until then.'],
];

const SETTINGS = {
  organisation: { name: 'Veltrixsecure', timezone: 'Asia/Kolkata' },
  business_hours: { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] },
  automation: { autoCloseDays: 3 },
  notifications: { newAssigned: true, breachWarn: true, majorIncident: true, approvals: true, dailyDigest: false },
  integrations: {
    email: { on: true, address: 'support@veltrixsecure.example' }, siem: { on: true }, slack: { on: false }, teams: { on: false }, sso: { on: false },
    webhook: { on: false, url: '', keyHash: null, keyPreview: null },
  },
  request_sla: { responseMinutes: 120 },
  cab_approvers: [],
};

export default async function seed({ db, log }) {
  const { insertIgnore } = db;
  for (const [id, name, response, resolution] of PRIORITIES) {
    await insertIgnore('priorities', { id, name, response_minutes: response, resolution_minutes: resolution });
  }
  for (const [listKey, values] of Object.entries(LOOKUPS)) {
    let order = 0;
    for (const value of values) await insertIgnore('lookup_values', { list_key: listKey, value, sort_order: ++order });
  }
  let order = 0;
  for (const [name, icon, sub, personal] of ASSET_TYPES) {
    await insertIgnore('asset_types', { name, icon, is_subscription: sub, is_personal_device: personal, sort_order: ++order });
  }
  order = 0;
  for (const name of KB_CATEGORIES) await insertIgnore('knowledge_categories', { name, sort_order: ++order });
  order = 0;
  for (const [code, name, description, enabled] of RULES) {
    await insertIgnore('automation_rules', { code, name, description, is_enabled: enabled, sort_order: ++order });
  }
  order = 0;
  for (const [name, body] of CANNED) await insertIgnore('canned_responses', { name, body, sort_order: ++order });
  for (const [key, value] of Object.entries(SETTINGS)) await insertIgnore('settings', { setting_key: key, value: JSON.stringify(value) });
  log('done');
}
