// Roles and permissions, the default teams, ticket categories with routing,
// the service catalog and the first administrator account.
// Idempotent: re-running only adds what is missing.

const TEAMS = [
  { code: 'sd', name: 'Service desk', type: 'Support', description: 'First line support for every customer.', email: 'servicedesk@veltrixsecure.example' },
  { code: 'soc', name: 'Security operations', type: 'Support', description: 'Monitors alerts and handles security incidents.', email: 'soc@veltrixsecure.example' },
  { code: 'infra', name: 'Infrastructure', type: 'Support', description: 'Servers, network, storage and cloud platforms.', email: 'infra@veltrixsecure.example' },
  { code: 'apps', name: 'Applications', type: 'Support', description: 'Business applications and integrations.', email: 'apps@veltrixsecure.example' },
  { code: 'cab', name: 'Change advisory board', type: 'Approval', description: 'Approves normal and emergency changes.', email: 'cab@veltrixsecure.example' },
];

const CATEGORIES = [
  ['Access and identity', 'sd'], ['Software and apps', 'sd'], ['Hardware and devices', 'sd'], ['Network and VPN', 'infra'],
  ['Security alerts', 'soc'], ['Onboarding and HR', 'sd'], ['Facilities and other', 'sd'],
];

export const CATALOG = [
  { code: 'c1', name: 'New starter setup', cat: 'Onboarding and HR', icon: 'user', desc: 'Laptop, accounts and access for a new employee.', approval: true, hours: 48,
    fields: [{ k: 'name', l: 'New starter name', t: 'text', req: 1 }, { k: 'start', l: 'Start date', t: 'date', req: 1 }, { k: 'dept', l: 'Department', t: 'select', o: ['Engineering', 'Finance', 'Sales', 'Operations', 'HR'] }, { k: 'device', l: 'Device', t: 'select', o: ['Windows laptop', 'MacBook', 'No device needed'] }],
    tasks: ['Create user accounts', 'Order and configure laptop', 'Add to standard groups'] },
  { code: 'c2', name: 'Software licence', cat: 'Software and apps', icon: 'box', desc: 'Request a licence for an approved application.', approval: true, hours: 24,
    fields: [{ k: 'app', l: 'Application', t: 'text', req: 1 }, { k: 'why', l: 'Business reason', t: 'textarea', req: 1 }],
    tasks: ['Purchase licence', 'Install and confirm with user'] },
  { code: 'c3', name: 'Shared mailbox access', cat: 'Access and identity', icon: 'mail', desc: 'Get access to a team mailbox.', approval: true, hours: 24,
    fields: [{ k: 'mailbox', l: 'Mailbox address', t: 'text', req: 1 }, { k: 'level', l: 'Access level', t: 'select', o: ['Read only', 'Read and send', 'Full access'] }],
    tasks: ['Grant mailbox permissions'] },
  { code: 'c4', name: 'Security token replacement', cat: 'Access and identity', icon: 'key', desc: 'Replace a lost, broken or expired security token.', approval: false, hours: 8,
    fields: [{ k: 'reason', l: 'Reason', t: 'select', o: ['Lost', 'Broken', 'Expired'], req: 1 }, { k: 'loc', l: 'Delivery location', t: 'text' }],
    tasks: ['Ship replacement token'] },
  { code: 'c5', name: 'VPN access', cat: 'Network and VPN', icon: 'shield', desc: 'Add or change remote access for a user or contractor.', approval: true, hours: 24,
    fields: [{ k: 'user', l: 'User name', t: 'text', req: 1 }, { k: 'until', l: 'Access needed until', t: 'date' }],
    tasks: ['Create VPN profile', 'Confirm access with user'] },
  { code: 'c6', name: 'Meeting room AV setup', cat: 'Facilities and other', icon: 'monitor', desc: 'Book AV equipment or help for a meeting or event.', approval: false, hours: 24,
    fields: [{ k: 'room', l: 'Room', t: 'text', req: 1 }, { k: 'when', l: 'Date and time', t: 'text' }],
    tasks: ['Prepare equipment'] },
  { code: 'c7', name: 'Firewall rule change', cat: 'Network and VPN', icon: 'shield', desc: 'Open or close a network port. Reviewed by Security operations.', approval: true, hours: 72,
    fields: [{ k: 'src', l: 'Source', t: 'text', req: 1 }, { k: 'dst', l: 'Destination', t: 'text', req: 1 }, { k: 'port', l: 'Port and protocol', t: 'text', req: 1 }, { k: 'why', l: 'Business reason', t: 'textarea' }],
    tasks: ['Security review', 'Apply firewall rule'] },
  { code: 'c8', name: 'Hardware replacement', cat: 'Hardware and devices', icon: 'laptop', desc: 'Replace a faulty laptop, monitor or accessory.', approval: false, hours: 48,
    fields: [{ k: 'item', l: 'What needs replacing', t: 'text', req: 1 }, { k: 'tag', l: 'Asset tag (if known)', t: 'text' }],
    tasks: ['Order replacement', 'Deliver and set up'] },
  { code: 'c9', name: 'Data access request', cat: 'Access and identity', icon: 'db', desc: 'Ask for access to a dataset or report.', approval: true, hours: 48,
    fields: [{ k: 'data', l: 'Dataset or report', t: 'text', req: 1 }, { k: 'why', l: 'Business reason', t: 'textarea', req: 1 }],
    tasks: ['Data owner sign-off', 'Grant access'] },
  { code: 'c10', name: 'Guest Wi-Fi access', cat: 'Network and VPN', icon: 'wifi', desc: 'Temporary Wi-Fi for visitors.', approval: false, hours: 8,
    fields: [{ k: 'guest', l: 'Guest name', t: 'text', req: 1 }, { k: 'days', l: 'Days needed', t: 'select', o: ['1', '2', '3', '5'] }],
    tasks: ['Create guest voucher'] },
];

export default async function seed({ db, log, hashPassword, env, randomPassword, constants }) {
  const { ROLE_DEFINITIONS, PERMISSION_DESCRIPTIONS } = constants;
  const { insertIgnore, insertOne, findOne, count } = db;

  // Roles and permissions
  for (const [code, description] of Object.entries(PERMISSION_DESCRIPTIONS)) {
    await insertIgnore('permissions', { code, description });
  }
  for (const role of ROLE_DEFINITIONS) {
    await insertIgnore('roles', { name: role.name, description: role.description });
    const r = await findOne('roles', { name: role.name });
    for (const code of role.permissions) {
      const p = await findOne('permissions', { code });
      if (p) await insertIgnore('role_permissions', { role_id: r.id, permission_id: p.id });
    }
  }
  log('roles and permissions');

  // Teams and category routing
  for (const t of TEAMS) await insertIgnore('teams', { code: t.code, name: t.name, type: t.type, description: t.description, email: t.email });
  let order = 0;
  for (const [name, teamCode] of CATEGORIES) {
    const team = await findOne('teams', { code: teamCode });
    order += 1;
    if (team) await insertIgnore('ticket_categories', { name, default_team_id: team.id, sort_order: order });
  }
  log('teams and categories');

  // Service catalog
  order = 0;
  for (const c of CATALOG) {
    order += 1;
    const category = await findOne('ticket_categories', { name: c.cat });
    if (!category) continue;
    await insertIgnore('catalog_items', {
      code: c.code, name: c.name, category_id: category.id, icon: c.icon, description: c.desc, requires_approval: c.approval ? 1 : 0,
      fulfilment_hours: c.hours, sort_order: order,
    });
    const item = await findOne('catalog_items', { code: c.code });
    if (!(await count('catalog_fields', { catalog_item_id: item.id }))) {
      let i = 0;
      for (const f of c.fields) {
        await insertOne('catalog_fields', {
          catalog_item_id: item.id, field_key: f.k, label: f.l, field_type: f.t, is_required: f.req ? 1 : 0, options: f.o ? JSON.stringify(f.o) : null, sort_order: ++i,
        });
      }
      i = 0;
      for (const title of c.tasks) await insertOne('catalog_tasks', { catalog_item_id: item.id, title, sort_order: ++i });
    }
  }
  log('service catalog');

  // First administrator
  const adminRole = await findOne('roles', { name: 'Admin' });
  const existing = await findOne('users', { role_id: adminRole.id });
  if (!existing) {
    const password = env.SEED_ADMIN_PASSWORD || randomPassword();
    const userId = await insertOne('users', {
      role_id: adminRole.id, name: 'Service Desk Admin', email: env.SEED_ADMIN_EMAIL, password_hash: await hashPassword(password), password_changed_at: new Date(),
    });
    const sd = await findOne('teams', { code: 'sd' });
    await insertOne('agents', { user_id: userId, primary_team_id: sd.id });
    await insertOne('team_members', { team_id: sd.id, user_id: userId });
    log(`administrator created: ${env.SEED_ADMIN_EMAIL}`);
    if (!env.SEED_ADMIN_PASSWORD) log(`generated admin password (shown once, change it after signing in): ${password}`);
  } else {
    log('administrator already exists');
  }
}
