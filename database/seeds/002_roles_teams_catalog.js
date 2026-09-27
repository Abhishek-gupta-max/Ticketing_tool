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

export default async function seed({ conn, log, hashPassword, env, randomPassword, constants }) {
  const { ROLE_DEFINITIONS, PERMISSION_DESCRIPTIONS } = constants;

  // Roles and permissions
  for (const [code, description] of Object.entries(PERMISSION_DESCRIPTIONS)) {
    await conn.query('INSERT IGNORE INTO permissions (code, description) VALUES (?, ?)', [code, description]);
  }
  for (const role of ROLE_DEFINITIONS) {
    await conn.query('INSERT IGNORE INTO roles (name, description) VALUES (?, ?)', [role.name, role.description]);
    const [[r]] = await conn.query('SELECT id FROM roles WHERE name = ?', [role.name]);
    for (const code of role.permissions) {
      await conn.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE code = ?', [r.id, code]);
    }
  }
  log('roles and permissions');

  // Teams and category routing
  for (const t of TEAMS) {
    await conn.query('INSERT IGNORE INTO teams (code, name, type, description, email) VALUES (?, ?, ?, ?, ?)', [t.code, t.name, t.type, t.description, t.email]);
  }
  let order = 0;
  for (const [name, teamCode] of CATEGORIES) {
    await conn.query(
      'INSERT IGNORE INTO ticket_categories (name, default_team_id, sort_order) SELECT ?, id, ? FROM teams WHERE code = ?',
      [name, ++order, teamCode],
    );
  }
  log('teams and categories');

  // Service catalog
  order = 0;
  for (const c of CATALOG) {
    await conn.query(
      `INSERT IGNORE INTO catalog_items (code, name, category_id, icon, description, requires_approval, fulfilment_hours, sort_order)
       SELECT ?, ?, id, ?, ?, ?, ?, ? FROM ticket_categories WHERE name = ?`,
      [c.code, c.name, c.icon, c.desc, c.approval ? 1 : 0, c.hours, ++order, c.cat],
    );
    const [[item]] = await conn.query('SELECT id FROM catalog_items WHERE code = ?', [c.code]);
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM catalog_fields WHERE catalog_item_id = ?', [item.id]);
    if (!n) {
      let i = 0;
      for (const f of c.fields) {
        await conn.query(
          'INSERT INTO catalog_fields (catalog_item_id, field_key, label, field_type, is_required, options, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [item.id, f.k, f.l, f.t, f.req ? 1 : 0, f.o ? JSON.stringify(f.o) : null, ++i],
        );
      }
      i = 0;
      for (const title of c.tasks) await conn.query('INSERT INTO catalog_tasks (catalog_item_id, title, sort_order) VALUES (?, ?, ?)', [item.id, title, ++i]);
    }
  }
  log('service catalog');

  // First administrator
  const [[existing]] = await conn.query("SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'Admin' LIMIT 1");
  if (!existing) {
    const password = env.SEED_ADMIN_PASSWORD || randomPassword();
    const [[role]] = await conn.query("SELECT id FROM roles WHERE name = 'Admin'");
    const [res] = await conn.query(
      'INSERT INTO users (role_id, name, email, password_hash, password_changed_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))',
      [role.id, 'Service Desk Admin', env.SEED_ADMIN_EMAIL, await hashPassword(password)],
    );
    const [[sd]] = await conn.query("SELECT id FROM teams WHERE code = 'sd'");
    await conn.query('INSERT INTO agents (user_id, primary_team_id) VALUES (?, ?)', [res.insertId, sd.id]);
    await conn.query('INSERT INTO team_members (team_id, user_id) VALUES (?, ?)', [sd.id, res.insertId]);
    log(`administrator created: ${env.SEED_ADMIN_EMAIL}`);
    if (!env.SEED_ADMIN_PASSWORD) log(`generated admin password (shown once, change it after signing in): ${password}`);
  } else {
    log('administrator already exists');
  }
}
