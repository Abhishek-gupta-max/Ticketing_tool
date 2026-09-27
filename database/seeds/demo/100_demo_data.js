// Demo data: a port of the sample workspace that the original single-file
// application generated in the browser. It gives every screen realistic data
// for evaluation and training. Do NOT run it against a production database;
// production only needs the reference seed.

import { CATALOG } from '../002_roles_teams_catalog.js';

const MIN = 60000, HOUR = 3600000, DAY = 86400000;

function rng(seed) {
  return function next() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const TPL = [
  { t: 'MFA push notifications not arriving', c: 'Access and identity', p: 3, d: 'Users report that MFA approval prompts arrive late or not at all, which blocks sign-in.' },
  { t: 'Account locked after password reset', c: 'Access and identity', d: 'The account was locked immediately after a self-service password reset.' },
  { t: 'Cannot open shared finance drive', c: 'Access and identity', d: 'Access to the shared drive is denied although the user is in the correct group.' },
  { t: 'SSO sign-in loop on HR portal', c: 'Access and identity', d: 'After entering credentials the user is sent back to the login page.' },
  { t: 'Outlook profile corruption after update', c: 'Software and apps', d: 'Outlook will not open and asks to recreate the profile after the latest update.' },
  { t: 'CRM export job times out overnight', c: 'Software and apps', team: 'apps', d: 'The scheduled CRM export fails with a timeout before it completes.' },
  { t: 'Payroll portal returns 502 error', c: 'Software and apps', team: 'apps', d: 'HR users see a 502 Bad Gateway when opening the payroll portal.' },
  { t: 'Certificate expiry alert not firing for API gateway', c: 'Software and apps', team: 'apps', p: 5, d: 'Monitoring did not alert before the gateway certificate was due to expire.' },
  { t: 'Microsoft Teams crashes on start', c: 'Software and apps', d: 'Teams closes immediately after launch on some laptops.' },
  { t: 'Backup verification failed on file server', c: 'Software and apps', team: 'infra', p: 6, d: 'The nightly backup verification job reported errors on the file server.' },
  { t: 'Laptop battery draining fast', c: 'Hardware and devices', d: 'Battery drops from full to empty in under two hours.' },
  { t: 'External monitor not detected', c: 'Hardware and devices', d: 'The docking station no longer detects the external monitor.' },
  { t: 'Printer offline on floor 3', c: 'Hardware and devices', d: 'Users cannot print. The printer shows as offline.' },
  { t: 'Keyboard keys unresponsive', c: 'Hardware and devices', d: 'Several keys stopped responding after a coffee spill.' },
  { t: 'VPN drops on macOS 15 after sleep', c: 'Network and VPN', p: 2, d: 'The VPN tunnel drops when the laptop wakes from sleep and needs a manual reconnect.' },
  { t: 'Wi-Fi drops on floor 4', c: 'Network and VPN', d: 'Wi-Fi disconnects several times an hour near the east side of floor 4.' },
  { t: 'Intermittent DNS timeouts at branch office', c: 'Network and VPN', p: 1, d: 'Name lookups time out for a few seconds at random. Web apps feel slow.' },
  { t: 'Slow file transfers to branch office', c: 'Network and VPN', d: 'Copying files over the WAN link is much slower than normal.' },
  { t: 'EDR agent failing to update', c: 'Security alerts', p: 4, d: 'The endpoint protection agent cannot reach its update channel on Windows Server 2016 hosts.' },
  { t: 'Suspected phishing email reported', c: 'Security alerts', d: 'A user reported an email asking them to confirm their credentials.' },
  { t: 'Unusual sign-in from new country', c: 'Security alerts', d: 'Identity provider flagged an impossible-travel sign-in.' },
  { t: 'Malware detection on endpoint', c: 'Security alerts', d: 'Endpoint protection quarantined a file and raised an alert.' },
  { t: 'Vulnerability scan: patch overdue', c: 'Security alerts', d: 'The latest scan lists critical patches past their remediation date.' },
  { t: 'Badge reader not working at main entrance', c: 'Facilities and other', d: 'Badges are not accepted at the main entrance reader.' },
  { t: 'Meeting room display offline', c: 'Facilities and other', d: 'The display in the boardroom shows no signal.' },
];
const VARIANTS = { c2: ['Design tool', 'PDF editor', 'Whiteboard tool', 'API testing tool', 'Issue tracker'], c3: ['Audit team', 'Finance ops', 'Support inbox'], c7: ['Warehouse scanners', 'HQ guest network', 'Partner SFTP'], c8: ['Laptop charger', 'Monitor', 'Headset', 'Docking station'] };
const FIRST_REPLY = ['Thanks for reporting this. I am looking into it now and will update you shortly.', 'Hi, I have picked this up. Could you confirm when it last worked as expected?', 'We have reproduced the issue and are working on a fix.', 'Thanks for the details. I am checking the logs and will come back to you.'];
const RES_NOTES = ['Restarted the service and confirmed normal operation.', 'Applied the vendor patch and verified with the user.', 'Reset the configuration and tested end to end.', 'Provided a workaround. The permanent fix is tracked in the linked problem.', 'Replaced the faulty part and confirmed with the user.'];
const FN = ['Ava', 'Noah', 'Meera', 'Liam', 'Zara', 'Omar', 'Chloe', 'Ravi', 'Elena', 'Jonas', 'Nadia', 'Marcus', 'Hana', 'Tomas', 'Leila', 'Owen', 'Yara', 'Felix', 'Sana', 'Diego'];
const LN = ['Shah', 'Keller', 'Rao', 'Novak', 'Silva', 'Lindqvist', 'Bose', 'Duarte', 'Ortiz', 'Kaplan', 'Weber', 'Mishra', 'Ahmed', 'Fischer', 'Costa', 'Nair', 'Bauer', 'Iyer', 'Moreau', 'Sato'];
const DEPTS = ['Finance', 'Engineering', 'Operations', 'HR', 'Sales'], TITLES = ['Analyst', 'Manager', 'Engineer', 'Coordinator', 'Specialist'], LOCS = ['Pune', 'Frankfurt', 'Mumbai', 'Delhi', 'HQ'];
const CHANNELS = ['Portal', 'Email', 'Phone', 'Chat', 'Monitoring'];
const HOLD_REASONS = ['Waiting for requester', 'Waiting for a change', 'Waiting for a fix', 'Waiting for supplier'];
const CAT_TEAM = { 'Access and identity': 'sd', 'Software and apps': 'sd', 'Hardware and devices': 'sd', 'Network and VPN': 'infra', 'Security alerts': 'soc', 'Onboarding and HR': 'sd', 'Facilities and other': 'sd' };
const CAT_ASSET = { 'Hardware and devices': ['Laptop', 'Printer', 'Mobile device'], 'Network and VPN': ['Network device', 'Firewall'], 'Security alerts': ['Server', 'Laptop'], 'Software and apps': ['Application', 'Cloud service'], 'Access and identity': ['Cloud service'], 'Facilities and other': ['Other'] };
const SLA = { 1: { resp: 15, res: 240 }, 2: { resp: 30, res: 480 }, 3: { resp: 120, res: 1440 }, 4: { resp: 240, res: 4320 } };
const AUTO_CLOSE_DAYS = 3;

const AGENTS = [
  { key: 'a1', name: 'Aarav Mehta', teams: ['sd'], role: 'Agent', email: 'aarav@veltrixsecure.example' },
  { key: 'a2', name: 'Priya Nair', teams: ['sd', 'apps'], role: 'Agent', email: 'priya@veltrixsecure.example' },
  { key: 'a3', name: 'Sofia Marin', teams: ['sd', 'cab'], role: 'Manager', email: 'sofia@veltrixsecure.example' },
  { key: 'a4', name: 'Kenji Watanabe', teams: ['soc', 'cab'], role: 'Agent', email: 'kenji@veltrixsecure.example' },
  { key: 'a5', name: 'Amira Haddad', teams: ['soc'], role: 'Agent', email: 'amira@veltrixsecure.example' },
  { key: 'a6', name: 'Daniel Okafor', teams: ['infra'], role: 'Agent', email: 'daniel@veltrixsecure.example' },
  { key: 'a7', name: 'Isha Kapoor', teams: ['infra'], role: 'Agent', email: 'isha@veltrixsecure.example' },
  { key: 'a8', name: 'Lucas Brandt', teams: ['apps', 'cab'], role: 'Agent', email: 'lucas@veltrixsecure.example' },
];
const CUSTOMERS = [
  { code: 'c-nw', name: 'Kestrel Bank', plan: 'Enterprise', bias: 0.05 }, { code: 'c-hx', name: 'Helix Health', plan: 'Enterprise', bias: -0.03 },
  { code: 'c-ob', name: 'Orbit Logistics', plan: 'Business', bias: 0.01 }, { code: 'c-sr', name: 'Summit Retail', plan: 'Business', bias: -0.01 },
  { code: 'c-in', name: 'Veltrixsecure internal', plan: 'Internal', bias: -0.04, internal: true },
];

async function insertRows(conn, table, rows, chunk = 300) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    await conn.query(`INSERT INTO ${table} (${cols.map((c) => '`' + c + '`').join(',')}) VALUES ?`, [part.map((r) => cols.map((c) => r[c] ?? null))]);
  }
}

export default async function seed({ conn, log, hashPassword, env, randomPassword, writeUpload }) {
  const [[{ n: existing }]] = await conn.query('SELECT COUNT(*) AS n FROM tickets');
  if (existing) { log(`skipped: ${existing} tickets already exist`); return; }

  const R = rng(20260919), now = Date.now(), YR = new Date().getFullYear();
  const pick = (a) => a[Math.floor(R() * a.length)];
  const wpick = (items, w) => { let s = w.reduce((a, b) => a + b, 0) * R(); for (let i = 0; i < items.length; i++) { s -= w[i]; if (s <= 0) return items[i]; } return items[items.length - 1]; };
  const num = (p, n) => `${p}-${YR}-${String(n).padStart(4, '0')}`;
  const d = (ms) => new Date(ms);

  // ---------- lookups ----------
  const [teamRows] = await conn.query('SELECT id, code FROM teams');
  const TEAM = Object.fromEntries(teamRows.map((t) => [t.code, t.id]));
  const [catRows] = await conn.query('SELECT id, name FROM ticket_categories');
  const CAT = Object.fromEntries(catRows.map((c) => [c.name, c.id]));
  const [kbCatRows] = await conn.query('SELECT id, name FROM knowledge_categories');
  const KBCAT = Object.fromEntries(kbCatRows.map((c) => [c.name, c.id]));
  const [typeRows] = await conn.query('SELECT id, name FROM asset_types');
  const ATYPE = Object.fromEntries(typeRows.map((c) => [c.name, c.id]));
  const [ciRows] = await conn.query('SELECT id, code FROM catalog_items');
  const CI = Object.fromEntries(ciRows.map((c) => [c.code, c.id]));
  const [ctRows] = await conn.query('SELECT catalog_item_id, title, sort_order FROM catalog_tasks ORDER BY catalog_item_id, sort_order');
  const CI_TASKS = {};
  ctRows.forEach((r) => { (CI_TASKS[r.catalog_item_id] = CI_TASKS[r.catalog_item_id] || []).push(r.title); });
  const [roleRows] = await conn.query('SELECT id, name FROM roles');
  const ROLE = Object.fromEntries(roleRows.map((r) => [r.name, r.id]));

  // ---------- agents ----------
  const demoPassword = env.SEED_DEMO_PASSWORD || randomPassword();
  const demoHash = await hashPassword(demoPassword);
  const [[admin]] = await conn.query("SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'Admin' ORDER BY u.id LIMIT 1");
  const U = { a0: admin.id };
  const agentTeams = { a0: ['sd'] };
  for (const a of AGENTS) {
    const [[found]] = await conn.query('SELECT id FROM users WHERE email = ?', [a.email]);
    let id = found?.id;
    if (!id) {
      const [res] = await conn.query('INSERT INTO users (role_id, name, email, password_hash, password_changed_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))', [ROLE[a.role], a.name, a.email, demoHash]);
      id = res.insertId;
      await conn.query('INSERT INTO agents (user_id, primary_team_id) VALUES (?, ?)', [id, TEAM[a.teams[0]]]);
      for (const t of a.teams) await conn.query('INSERT IGNORE INTO team_members (team_id, user_id) VALUES (?, ?)', [TEAM[t], id]);
    }
    U[a.key] = id; agentTeams[a.key] = a.teams;
  }
  const managers = { sd: 'a3', soc: 'a4', infra: 'a6', apps: 'a8', cab: 'a3' };
  for (const [code, key] of Object.entries(managers)) await conn.query('UPDATE teams SET manager_id = ? WHERE code = ?', [U[key], code]);
  await conn.query('UPDATE team_members SET is_on_call = 1 WHERE (team_id = ? AND user_id = ?) OR (team_id = ? AND user_id = ?)', [TEAM.soc, U.a4, TEAM.infra, U.a6]);
  await conn.query("UPDATE settings SET value = ? WHERE setting_key = 'cab_approvers'", [JSON.stringify([
    { userId: U.a3, role: 'Change manager' }, { userId: U.a4, role: 'Security lead' }, { userId: U.a8, role: 'Service owner' }])]);
  const nameOf = { a0: 'Service Desk Admin', ...Object.fromEntries(AGENTS.map((a) => [a.key, a.name])) };
  const agentsOf = (tm) => Object.keys(agentTeams).filter((k) => agentTeams[k].includes(tm));
  log(`agents (demo password ${env.SEED_DEMO_PASSWORD ? 'from SEED_DEMO_PASSWORD' : 'generated: ' + demoPassword})`);

  // ---------- customers and people ----------
  const CUST = {};
  for (const c of CUSTOMERS) {
    await conn.query('INSERT IGNORE INTO customers (code, name, plan, is_internal) VALUES (?, ?, ?, ?)', [c.code, c.name, c.plan, c.internal ? 1 : 0]);
    const [[row]] = await conn.query('SELECT id FROM customers WHERE code = ?', [c.code]);
    CUST[c.code] = row.id;
  }
  const people = [];
  let pn = 0;
  const usedEmails = new Set();
  for (const c of CUSTOMERS) {
    for (let i = 0; i < 4; i++) {
      const nm = FN[(pn * 3 + i * 7) % FN.length] + ' ' + LN[(pn * 5 + i * 3) % LN.length];
      pn++;
      let email = nm.toLowerCase().replace(/\s+/g, '.') + '@' + c.name.toLowerCase().replace(/[^a-z]/g, '') + '.example';
      while (usedEmails.has(email)) email = email.replace('@', pn + '@');
      usedEmails.add(email);
      const [res] = await conn.query(
        'INSERT INTO people (customer_id, name, email, is_vip, department, job_title, location, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [CUST[c.code], nm, email, i === 0 ? 1 : 0, DEPTS[pn % 5], TITLES[(pn * 3) % 5], LOCS[(pn * 2) % 5], '+91 20 555 ' + String(1000 + pn * 7)],
      );
      people.push({ id: res.insertId, cust: c.code, name: nm, email });
    }
  }
  const P = (cu, i) => people.filter((p) => p.cust === cu)[i].id;
  // A customer portal login for the first Kestrel Bank requester.
  const portal = people.find((p) => p.cust === 'c-nw');
  const [portalUser] = await conn.query('INSERT INTO users (role_id, name, email, password_hash, password_changed_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))', [ROLE.Customer, portal.name, portal.email, demoHash]);
  await conn.query('UPDATE people SET user_id = ? WHERE id = ?', [portalUser.insertId, portal.id]);
  log(`customers and ${people.length} requesters (portal login: ${portal.email})`);

  // ---------- assets ----------
  const assets = [];
  const ad = (name, type, crit, cu, loc, ident, os, wDays, status) => assets.push({ name, type, crit, cu, loc, ident, os, warranty: new Date(now + wDays * DAY).toISOString().slice(0, 10), status: status || 'In use', env: 'Production', deps: [] });
  ad('dc-fra-01', 'Server', 'Critical', 'c-nw', 'Frankfurt DC', '10.20.1.11', 'Windows Server 2022', 380);
  ad('dc-fra-02', 'Server', 'Critical', 'c-nw', 'Frankfurt DC', '10.20.1.12', 'Windows Server 2022', 380);
  ad('fs-pune-01', 'Server', 'High', 'c-in', 'Pune office', '10.40.2.20', 'Windows Server 2016', 45);
  ad('app-crm-01', 'Server', 'High', 'c-ob', 'Mumbai DC', '10.30.5.14', 'Ubuntu 22.04', 210);
  ad('db-prod-02', 'Server', 'Critical', 'c-hx', 'Mumbai DC', '10.30.6.32', 'RHEL 9', 300);
  ad('edr-mgmt-01', 'Server', 'High', 'c-in', 'Pune office', '10.40.2.55', 'Windows Server 2019', 150);
  ad('jump-legacy-01', 'Server', 'Low', 'c-in', 'Pune office', '10.40.2.99', 'Windows Server 2012 R2', -120, 'In maintenance');
  ad('bak-01', 'Server', 'High', 'c-in', 'Pune office', '10.40.2.70', 'Debian 12', 260);
  ad('fw-hq-01', 'Firewall', 'Critical', 'c-in', 'HQ', '10.0.0.1', 'FortiOS 7.4', 500);
  ad('fw-wh-02', 'Firewall', 'High', 'c-ob', 'Warehouse 2', '10.50.0.1', 'FortiOS 7.2', 60);
  ad('sw-pune-core', 'Network device', 'Critical', 'c-in', 'Pune office', '10.40.0.2', 'Cisco IOS XE', 700);
  ad('wlc-pune-01', 'Network device', 'Medium', 'c-in', 'Pune office', '10.40.0.10', 'Aruba AOS', 330);
  ad('vpn-gw-01', 'Network device', 'Critical', 'c-in', 'HQ', '10.0.0.5', 'GlobalProtect 6.1', 410);
  ad('Okta single sign-on', 'Cloud service', 'Critical', 'c-in', 'Cloud', 'okta.example', 'SaaS', 0);
  ad('Microsoft 365', 'Cloud service', 'Critical', 'c-in', 'Cloud', 'm365.example', 'SaaS', 0);
  ad('Payroll portal', 'Application', 'High', 'c-hx', 'Cloud', 'payroll.example', 'SaaS', 0);
  ad('CRM platform', 'Application', 'High', 'c-ob', 'Cloud', 'crm.example', 'SaaS', 0);
  ad('SIEM', 'Application', 'Critical', 'c-in', 'Cloud', 'siem.example', 'SaaS', 0);
  ad('API gateway', 'Application', 'High', 'c-nw', 'Mumbai DC', 'api.example', 'Kong 3.6', 0);
  ad('LT-4471', 'Laptop', 'Medium', 'c-in', 'Pune office', 'SN4471X9', 'macOS 15', 260);
  ad('LT-2213', 'Laptop', 'Medium', 'c-nw', 'Frankfurt', 'SN2213K4', 'Windows 11', 140);
  ad('LT-3305', 'Laptop', 'Medium', 'c-hx', 'Mumbai', 'SN3305P1', 'Windows 11', 20);
  ad('LT-5120', 'Laptop', 'Medium', 'c-ob', 'Warehouse 2', 'SN5120M7', 'Windows 11', 600);
  ad('LT-1098', 'Laptop', 'Low', 'c-sr', 'Delhi store', 'SN1098Q2', 'Windows 10', -40, 'Retired');
  ad('Printer floor 3', 'Printer', 'Low', 'c-in', 'Pune office', '10.40.8.14', 'n/a', 90);
  ad('Badge readers HQ', 'Other', 'Medium', 'c-in', 'HQ', 'n/a', 'n/a', 180);
  ad('Boardroom display', 'Other', 'Low', 'c-in', 'HQ', 'n/a', 'n/a', 400);
  ad('SFTP gateway', 'Server', 'Medium', 'c-sr', 'Delhi DC', '10.60.1.9', 'Ubuntu 22.04', 95);
  ad('ERP database', 'Application', 'Critical', 'c-sr', 'Delhi DC', 'erp.example', 'PostgreSQL 15', 0);
  ad('LT-6001', 'Laptop', 'Medium', 'c-nw', 'Frankfurt', 'SN6001A1', 'Windows 11', 300);
  ad('LT-6002', 'Laptop', 'Medium', 'c-hx', 'Mumbai', 'SN6002B2', 'Windows 11', 420);
  ad('LT-6003', 'Laptop', 'Medium', 'c-ob', 'Warehouse 2', 'SN6003C3', 'Windows 11', 90);
  ad('MOB-7001', 'Mobile device', 'Low', 'c-nw', 'Frankfurt', 'IMEI 3567001', 'iOS 18', 200);
  ad('MOB-7002', 'Mobile device', 'Low', 'c-in', 'Pune office', 'IMEI 3567002', 'Android 15', 150);
  const A = (n) => assets.find((a) => a.name === n);
  const own = (name, o) => Object.assign(A(name), { user: o.user || null, owner: o.owner || null, mgr: o.mgr || null, grp: o.grp || null, env: o.env || 'Production' });
  own('dc-fra-01', { owner: P('c-nw', 1), mgr: 'a6', grp: 'infra' }); own('dc-fra-02', { owner: P('c-nw', 1), mgr: 'a6', grp: 'infra' });
  own('fs-pune-01', { owner: P('c-in', 2), mgr: 'a7', grp: 'infra' }); own('app-crm-01', { owner: P('c-ob', 1), mgr: 'a8', grp: 'apps' });
  own('db-prod-02', { owner: P('c-hx', 2), mgr: 'a7', grp: 'infra' }); own('edr-mgmt-01', { owner: P('c-in', 1), mgr: 'a4', grp: 'soc' });
  own('jump-legacy-01', { owner: P('c-in', 2), mgr: 'a7', grp: 'infra' }); own('bak-01', { owner: P('c-in', 2), mgr: 'a7', grp: 'infra', env: 'Disaster recovery' });
  own('fw-hq-01', { owner: P('c-in', 1), mgr: 'a6', grp: 'infra' }); own('fw-wh-02', { owner: P('c-ob', 2), mgr: 'a6', grp: 'infra' });
  own('sw-pune-core', { owner: P('c-in', 1), mgr: 'a7', grp: 'infra' }); own('wlc-pune-01', { owner: P('c-in', 1), mgr: 'a7', grp: 'infra' }); own('vpn-gw-01', { owner: P('c-in', 1), mgr: 'a6', grp: 'infra' });
  own('Okta single sign-on', { owner: P('c-in', 1), mgr: 'a5', grp: 'soc' }); own('Microsoft 365', { owner: P('c-in', 0), mgr: 'a2', grp: 'sd' });
  own('Payroll portal', { owner: P('c-hx', 1), mgr: 'a8', grp: 'apps' }); own('CRM platform', { owner: P('c-ob', 2), mgr: 'a8', grp: 'apps' });
  own('SIEM', { owner: P('c-in', 0), mgr: 'a4', grp: 'soc' }); own('API gateway', { owner: P('c-nw', 2), mgr: 'a8', grp: 'apps' });
  own('ERP database', { owner: P('c-sr', 1), mgr: 'a8', grp: 'apps' }); own('SFTP gateway', { owner: P('c-sr', 0), mgr: 'a7', grp: 'infra', env: 'Staging' });
  own('LT-4471', { user: P('c-in', 3), owner: P('c-in', 0), mgr: 'a1', grp: 'sd' }); own('LT-2213', { user: P('c-nw', 0), owner: P('c-nw', 0), mgr: 'a1', grp: 'sd' });
  own('LT-3305', { user: P('c-hx', 3), owner: P('c-hx', 0), mgr: 'a2', grp: 'sd' }); own('LT-5120', { user: P('c-ob', 0), owner: P('c-ob', 0), mgr: 'a2', grp: 'sd' });
  own('LT-1098', { user: P('c-sr', 2), owner: P('c-sr', 0), mgr: 'a1', grp: 'sd' }); own('LT-6001', { user: P('c-nw', 2), owner: P('c-nw', 0), mgr: 'a1', grp: 'sd' });
  own('LT-6002', { user: P('c-hx', 1), owner: P('c-hx', 0), mgr: 'a2', grp: 'sd' }); own('LT-6003', { user: P('c-ob', 3), owner: P('c-ob', 0), mgr: 'a1', grp: 'sd' });
  own('MOB-7001', { user: P('c-nw', 3), owner: P('c-nw', 0), mgr: 'a1', grp: 'sd' }); own('MOB-7002', { user: P('c-in', 2), owner: P('c-in', 0), mgr: 'a1', grp: 'sd' });
  own('Printer floor 3', { owner: P('c-in', 2), mgr: 'a1', grp: 'sd' }); own('Badge readers HQ', { owner: P('c-in', 1), mgr: 'a1', grp: 'sd' }); own('Boardroom display', { owner: P('c-in', 2), mgr: 'a1', grp: 'sd' });
  const deps = { 'API gateway': ['dc-fra-01', 'Okta single sign-on'], 'Payroll portal': ['db-prod-02', 'Okta single sign-on'], 'CRM platform': ['app-crm-01'], 'edr-mgmt-01': ['sw-pune-core'], 'fs-pune-01': ['sw-pune-core'], 'wlc-pune-01': ['sw-pune-core'], 'vpn-gw-01': ['fw-hq-01'] };
  let an = 0;
  for (const a of assets) {
    a.tag = 'AST-' + String(++an).padStart(3, '0');
    const [res] = await conn.query(
      `INSERT INTO assets (asset_tag, name, asset_type_id, criticality, status, environment, customer_id, location, serial_number, platform, warranty_end,
        assigned_person_id, owner_person_id, managed_by, support_team_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.tag, a.name, ATYPE[a.type], a.crit, a.status, a.env, CUST[a.cu], a.loc, a.ident, a.os, a.warranty, a.user || null, a.owner || null, a.mgr ? U[a.mgr] : null, a.grp ? TEAM[a.grp] : null, U.a0],
    );
    a.id = res.insertId;
  }
  for (const [name, list] of Object.entries(deps)) for (const dn of list) await conn.query('INSERT INTO asset_dependencies (asset_id, depends_on_asset_id) VALUES (?, ?)', [A(name).id, A(dn).id]);
  log(`${assets.length} assets`);

  // ---------- tickets ----------
  const catalogByCode = Object.fromEntries(CATALOG.map((c) => [c.code, c]));
  const list = [];
  const mk = (o) => {
    const pri = o.pri, tp = SLA[pri];
    let respT = tp.resp, resT = tp.res;
    if (o.kind === 'request') { respT = 120; resT = (o.ci.hours || 24) * 60; }
    const impUrg = { 1: [1, 1], 2: pick([[1, 2], [2, 1]]), 3: pick([[2, 2], [1, 3], [3, 1]]), 4: pick([[2, 3], [3, 2], [3, 3]]) }[pri];
    return {
      kind: o.kind, title: o.title, desc: o.desc, cust: o.cust, requester: o.requester, cat: o.cat, team: o.team, impact: impUrg[0], urgency: impUrg[1], priority: pri,
      status: 'New', assignee: null, channel: o.channel || wpick(CHANNELS, [0.4, 0.25, 0.12, 0.1, 0.13]), createdAt: o.createdAt, firstResponseAt: null, resolvedAt: null, closedAt: null,
      resolution: '', resCode: '', csat: null, reopened: 0, assetId: o.assetId || null, prob: o.prob || null, change: null, pausedAt: null,
      slaResp: o.createdAt + respT * MIN, slaRes: o.createdAt + resT * MIN, approval: null, catalogCode: o.ci ? o.ci.code : null, major: false, holdReason: null,
      acts: [], comments: [], tasks: [],
    };
  };
  const sys = (t, at, text) => t.acts.push({ at, text });
  for (let i = 0; i < 470; i++) {
    let ts = now - Math.pow(R(), 1.1) * 90 * DAY;
    const dt = new Date(ts);
    if ((dt.getDay() === 0 || dt.getDay() === 6) && R() < 0.7) ts -= (dt.getDay() === 0 ? 2 : 1) * DAY;
    dt.setTime(ts); dt.setHours(8 + Math.floor(R() * 11), Math.floor(R() * 60), 0, 0); ts = dt.getTime();
    if (ts > now - 10 * MIN) ts = now - 10 * MIN - Math.floor(R() * 4 * HOUR);
    const kind = R() < 0.76 ? 'incident' : 'request';
    let title, desc, cat, tm, prob = null, ci = null;
    if (kind === 'incident') { const tp = pick(TPL); title = tp.t; desc = tp.d; cat = tp.c; tm = tp.team || CAT_TEAM[cat]; if (tp.p && R() < 0.85) prob = tp.p; }
    else { ci = pick(CATALOG); title = VARIANTS[ci.code] ? ci.name + ': ' + pick(VARIANTS[ci.code]) : ci.name; desc = ci.desc; cat = ci.cat; tm = CAT_TEAM[cat]; }
    const cu = wpick(CUSTOMERS, [0.3, 0.24, 0.18, 0.13, 0.15]);
    const req = pick(people.filter((p) => p.cust === cu.code));
    const pri = kind === 'request' ? (R() < 0.3 ? 4 : 3) : wpick([1, 2, 3, 4], [cat === 'Security alerts' ? 0.1 : 0.03, 0.17, 0.47, 0.33]);
    const t = mk({ kind, title, desc, cust: cu.code, requester: req.id, cat, team: tm, pri, createdAt: ts, prob, ci });
    const pool = assets.filter((a) => (CAT_ASSET[cat] || []).includes(a.type) && (a.cu === cu.code || a.cu === 'c-in'));
    if (pool.length && R() < 0.55) t.assetId = pick(pool).id;
    const respT = kind === 'request' ? 120 : SLA[pri].resp, resT = kind === 'request' ? ci.hours * 60 : SLA[pri].res;
    let frt = respT * (0.08 + R() * 0.8); if (R() < 0.07) frt = respT * (1.15 + R() * 1.2);
    let rt = frt + resT * (0.08 + R() * 0.75); if (R() < 0.045 + cu.bias) rt = resT * (1.1 + R() * 0.9);
    const age = (now - ts) / DAY, pOpen = age < 1 ? 0.7 : age < 3 ? 0.35 : age < 7 ? 0.15 : age < 21 ? 0.05 : 0.015;
    let open = R() < pOpen;
    const respAt = ts + frt * MIN, resAt = ts + Math.max(rt, frt + 5) * MIN;
    if (open && (now - ts) / MIN > resT * 1.05 && R() < 0.95) open = false;
    if (!open && resAt > now) open = true;
    const members = agentsOf(tm);
    const ag = wpick(members, members.map((k) => (k === 'a0' ? 0.5 : 1)));
    sys(t, ts, 'Ticket created via ' + t.channel);
    if (ci && ci.approval) { t.approval = { state: 'Approved', at: ts + 20 * MIN }; if (open && R() < 0.25) t.approval = { state: 'Pending', at: ts }; }
    if (open) {
      const young = (now - ts) / MIN < respT * 0.9;
      const st = t.approval && t.approval.state === 'Pending' ? 'Awaiting approval' : wpick(['New', 'In Progress', 'On Hold'], young ? [0.35, 0.5, 0.15] : [0, 0.78, 0.22]);
      t.status = st;
      if (st !== 'New' && st !== 'Awaiting approval') {
        t.assignee = ag; sys(t, ts + 4 * MIN, 'Assigned to ' + nameOf[ag]);
        if (respAt < now) { t.firstResponseAt = respAt; t.comments.push({ at: respAt, by: ag, type: 'comment', text: pick(FIRST_REPLY) }); }
      }
      if (st === 'On Hold') { t.holdReason = wpick(HOLD_REASONS, [0.7, 0.08, 0.07, 0.15]); if (t.holdReason === 'Waiting for requester') t.pausedAt = Math.max(ts + 30 * MIN, now - R() * 8 * HOUR); }
    } else {
      t.assignee = ag; t.firstResponseAt = respAt; t.resolvedAt = resAt;
      sys(t, ts + 4 * MIN, 'Assigned to ' + nameOf[ag]);
      t.comments.push({ at: respAt, by: ag, type: 'comment', text: pick(FIRST_REPLY) });
      t.resCode = wpick(['Fixed', 'Workaround given', 'Fixed remotely', 'Guidance given', 'Resolved by requester', 'Cannot reproduce'], [0.34, 0.14, 0.24, 0.1, 0.1, 0.08]);
      t.resolution = pick(RES_NOTES);
      sys(t, resAt, 'Resolved (' + t.resCode + '): ' + t.resolution);
      if (now - resAt > AUTO_CLOSE_DAYS * DAY) { t.status = 'Closed'; t.closedAt = resAt + AUTO_CLOSE_DAYS * DAY; sys(t, t.closedAt, 'Closed automatically'); } else t.status = 'Resolved';
      if (R() < 0.55) t.csat = wpick([1, 2, 3, 4, 5], [0.03, 0.05, 0.12, 0.3, 0.5]);
      if (R() < 0.04) t.reopened = 1;
    }
    list.push(t);
  }

  const feat = [
    ['major', 'Replication lag between domain controllers in Frankfurt', 'incident', 'Network and VPN', 'c-nw', 1, 'In Progress', 'a6', 310, 'Branch sign-ins to Kestrel Bank are slow. Replication between dc-fra-01 and dc-fra-02 is more than 20 minutes behind. Payments are not affected.', 'dc-fra-01'],
    ['phish', 'Suspected phishing wave reported by finance', 'incident', 'Security alerts', 'c-nw', 1, 'In Progress', 'a4', 95, 'Six users in finance received an email with a link to a fake payroll page. Two clicked it.', null],
    [null, 'Payroll portal returns 502 for HR users', 'incident', 'Software and apps', 'c-hx', 2, 'In Progress', 'a8', 620, 'HR users see a 502 error after logging in. Started after last night\'s deployment.', 'Payroll portal'],
    [null, 'MFA push notifications not arriving', 'incident', 'Access and identity', 'c-in', 2, 'On Hold', 'a2', 400, 'A group of users get no push prompt. Waiting for the requester to confirm whether SMS fallback works.', 'Okta single sign-on', 3],
    [null, 'New starter laptops not delivered for Monday', 'request', 'Onboarding and HR', 'c-ob', 3, 'On Hold', 'a7', 3000, 'Three laptops for the Monday cohort have not arrived from the supplier.', null],
    [null, 'EDR agent failing to update on 38 hosts', 'incident', 'Security alerts', 'c-hx', 2, 'New', null, 1900, 'Agents on Windows Server 2016 hosts stay on an old version and report update errors.', 'edr-mgmt-01', 4],
    [null, 'Wi-Fi drops on floor 4 in the Pune office', 'incident', 'Network and VPN', 'c-in', 3, 'In Progress', 'a7', 1500, 'Users near the east wall lose Wi-Fi several times an hour.', 'wlc-pune-01'],
    [null, 'OpenSSH patch overdue on 12 servers', 'incident', 'Security alerts', 'c-hx', 2, 'In Progress', 'a6', 470, 'The latest vulnerability scan lists 12 servers still on the vulnerable OpenSSH version.', 'edr-mgmt-01'],
    [null, 'Certificate expiry alert not firing for API gateway', 'incident', 'Software and apps', 'c-nw', 2, 'New', null, 420, 'The gateway certificate expires in 6 days and no alert has been raised.', 'API gateway', 5],
    ['vpn', 'VPN drops on macOS 15 after sleep', 'incident', 'Network and VPN', 'c-in', 3, 'In Progress', 'a0', 700, 'After the laptop wakes from sleep the VPN shows connected but no traffic passes.', 'LT-4471', 2],
    [null, 'Unusual sign-in from new country on finance account', 'incident', 'Security alerts', 'c-ob', 1, 'In Progress', 'a5', 200, 'Impossible-travel alert for a finance user. Session revoked, awaiting confirmation from the user.', null],
    [null, 'Shared mailbox access for the audit team', 'request', 'Access and identity', 'c-nw', 4, 'Awaiting approval', null, 300, 'Read and send access to the audit team mailbox for three new joiners.', null],
    [null, 'Printer offline on floor 3', 'incident', 'Hardware and devices', 'c-in', 4, 'New', null, 60, 'Nobody on floor 3 can print. The printer shows offline.', 'Printer floor 3'],
    [null, 'CRM export job times out overnight', 'incident', 'Software and apps', 'c-ob', 3, 'On Hold', 'a0', 900, 'The nightly export fails. Asked the requester for the job log.', 'CRM platform'],
    [null, 'Laptop battery draining fast', 'incident', 'Hardware and devices', 'c-hx', 3, 'In Progress', 'a0', 200, 'Battery lasts under two hours since the last firmware update.', 'LT-3305'],
    [null, 'New starter setup: Jane Cole', 'request', 'Onboarding and HR', 'c-hx', 3, 'In Progress', 'a1', 2900, 'Laptop, accounts and access for Jane Cole, who starts on Monday.', null, null, 'bundle'],
    [null, 'Software licence: Design tool', 'request', 'Software and apps', 'c-hx', 3, 'In Progress', 'a1', 2900, 'Design licence for the new starter.', null, null, 'bundle'],
    [null, 'Security token replacement', 'request', 'Access and identity', 'c-hx', 4, 'In Progress', 'a2', 2900, 'Hardware token for the new starter.', null, null, 'bundle'],
  ];
  const keyed = {};
  for (const f of feat) {
    const [key, title, kind, cat, cu, pri, st, ass, ageMin, desc, assetName, prob, grp] = f;
    const ci = kind === 'request' ? catalogByCode[title.startsWith('Shared') ? 'c3' : title.startsWith('Software') ? 'c2' : title.startsWith('Security token') ? 'c4' : 'c1'] : null;
    const req = people.filter((p) => p.cust === cu)[1];
    const ts = now - ageMin * MIN;
    const t = mk({ kind, title, desc, cust: cu, requester: req.id, cat, team: CAT_TEAM[cat], pri, createdAt: ts, prob, ci, assetId: assetName ? A(assetName).id : null, channel: key === 'major' ? 'Monitoring' : undefined });
    if ((cat === 'Security alerts' && title.startsWith('EDR')) || title.startsWith('OpenSSH')) t.team = 'soc';
    if (/Payroll|CRM|Certificate/.test(title)) t.team = 'apps';
    t.status = st; t.assignee = ass;
    sys(t, ts, 'Ticket created via ' + t.channel);
    if (ass) {
      sys(t, ts + 3 * MIN, 'Assigned to ' + nameOf[ass]);
      const rt = Math.min(ts + 12 * MIN, now - MIN); t.firstResponseAt = rt;
      t.comments.push({ at: rt, by: ass, type: 'comment', text: pick(FIRST_REPLY) });
      if (key === 'major' || pri === 1) t.comments.push({ at: Math.min(ts + 40 * MIN, now - MIN), by: ass, type: 'note', text: 'Checked logs and monitoring. Escalating to the resolver group and keeping the requester updated every 30 minutes.' });
    }
    if (st === 'On Hold') { t.holdReason = title.startsWith('New starter') ? 'Waiting for supplier' : 'Waiting for requester'; if (t.holdReason === 'Waiting for requester') t.pausedAt = Math.max(ts + 30 * MIN, now - 3 * HOUR); }
    if (st === 'Awaiting approval') t.approval = { state: 'Pending', at: ts };
    else if (ci && ci.approval) t.approval = { state: 'Approved', at: ts + 10 * MIN };
    if (key) keyed[key] = t;
    if (grp) t.grp = grp;
    list.push(t);
  }

  // Numbers in creation order; request items are grouped under a REQ number.
  list.sort((a, b) => a.createdAt - b.createdAt);
  let incN = 0, reqN = 0;
  const reqOf = {}, requests = [];
  for (const t of list) {
    if (t.kind === 'incident') { t.number = num('INC', ++incN); continue; }
    const key = t.grp || Symbol('solo');
    let r = typeof key === 'string' ? reqOf[key] : null;
    if (!r) { r = { number: num('REQ', ++reqN), requestedFor: t.requester, cust: t.cust, createdAt: t.createdAt, items: [] }; requests.push(r); if (typeof key === 'string') reqOf[key] = r; }
    r.items.push(t); t.request = r; t.line = r.items.length; t.number = r.number + '.' + t.line;
  }
  for (const r of requests) {
    const [res] = await conn.query('INSERT INTO requests (request_number, requested_for_id, customer_id, opened_by, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)', [r.number, r.requestedFor, CUST[r.cust], d(r.createdAt), d(r.createdAt)]);
    r.id = res.insertId;
  }

  // ---------- problems (needed before ticket insert for the FK) ----------
  const T = (days) => now - days * DAY;
  const problems = [
    [1, 'Intermittent DNS timeouts at branch offices', 'Finding cause', 2, 'a6', '', 'Fail over branch resolvers to the secondary DNS server and flush the resolver cache.', 34, false],
    [2, 'VPN client disconnects on macOS 15 after sleep', 'Fix underway', 3, 'a2', 'Vendor VPN client v5.2 does not re-establish the tunnel after sleep on macOS 15.', 'Disconnect and reconnect the VPN after waking the laptop. Vendor fix expected in v5.3.', 52, true],
    [3, 'MFA push notifications delayed or not delivered', 'Finding cause', 2, 'a5', '', 'Ask users to use the SMS or authenticator code fallback.', 21, false],
    [4, 'EDR agent update failures on Windows Server 2016', 'Fix underway', 2, 'a4', 'The hardening baseline disables the TLS ciphers the update channel needs.', 'Install the agent package manually from the management server.', 44, true],
    [5, 'Certificate expiry alerts not firing', 'Investigating', 2, 'a8', '', 'Check certificate dates weekly from the certificate inventory.', 9, false],
    [6, 'Backup verification failures on file servers', 'Fixed', 3, 'a7', 'A disk on the backup target ran out of space during verification.', 'Not needed.', 40, false],
  ];
  const PRB = {};
  for (const [n, title, status, pri, owner, rc, wa, days, known] of problems) {
    const fixed = status === 'Fixed';
    const [res] = await conn.query(
      `INSERT INTO problems (problem_number, title, status, priority, owner_id, root_cause, workaround, is_known_error, resolution_code, fix_notes, resolved_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [num('PRB', n), title, status, pri, U[owner], rc, wa, known ? 1 : 0, fixed ? 'Fixed permanently' : null, fixed ? 'Capacity added to the backup target.' : null, fixed ? d(T(28)) : null, U[owner], d(T(days)), d(T(Math.max(0, days - 3)))],
    );
    PRB[n] = res.insertId;
    await conn.query('INSERT INTO problem_activities (problem_id, type, body, created_at) VALUES (?, ?, ?, ?)', [res.insertId, 'system', 'Problem record created', d(T(days))]);
    if (fixed) await conn.query('INSERT INTO problem_activities (problem_id, type, body, created_at) VALUES (?, ?, ?, ?)', [res.insertId, 'system', 'Resolved (Fixed permanently). Capacity added to the backup target.', d(T(28))]);
  }

  // Major incident prep (activities appended before insert)
  const openMajor = keyed.major;
  openMajor.major = true;
  sys(openMajor, openMajor.createdAt + 15 * MIN, 'Declared as a major incident (MI-1)');

  const lastAt = (t) => Math.max(t.createdAt, ...t.acts.map((a) => a.at), ...t.comments.map((c) => c.at));
  await insertRows(conn, 'tickets', list.map((t) => ({
    ticket_number: t.number, kind: t.kind, title: t.title, description: t.desc, customer_id: CUST[t.cust], requester_id: t.requester, category_id: CAT[t.cat],
    team_id: TEAM[t.team], assigned_to: t.assignee ? U[t.assignee] : null, channel: t.channel, impact: t.impact, urgency: t.urgency, priority: t.priority, status: t.status,
    hold_reason: t.holdReason, is_major: t.major ? 1 : 0, sla_response_due_at: d(t.slaResp), sla_resolution_due_at: d(t.slaRes), paused_at: t.pausedAt ? d(t.pausedAt) : null, paused_seconds: 0,
    first_response_at: t.firstResponseAt ? d(t.firstResponseAt) : null, resolved_at: t.resolvedAt ? d(t.resolvedAt) : null, closed_at: t.closedAt ? d(t.closedAt) : null,
    resolution_code: t.resCode || null, resolution_notes: t.resolution || null, csat: t.csat, reopened_count: t.reopened, asset_id: t.assetId, problem_id: t.prob ? PRB[t.prob] : null,
    request_id: t.request ? t.request.id : null, catalog_item_id: t.catalogCode ? CI[t.catalogCode] : null, created_by: null,
    created_at: d(t.createdAt), updated_at: d(lastAt(t)),
  })));
  const [idRows] = await conn.query('SELECT id, ticket_number FROM tickets');
  const TID = Object.fromEntries(idRows.map((r) => [r.ticket_number, r.id]));
  list.forEach((t) => { t.id = TID[t.number]; });

  await insertRows(conn, 'ticket_activities', list.flatMap((t) => t.acts.map((a) => ({ ticket_id: t.id, user_id: null, body: a.text, created_at: d(a.at) }))));
  await insertRows(conn, 'ticket_comments', list.flatMap((t) => t.comments.map((c) => ({ ticket_id: t.id, user_id: U[c.by], type: c.type, body: c.text, created_at: d(c.at) }))));
  await insertRows(conn, 'request_items', list.filter((t) => t.request).map((t) => ({ request_id: t.request.id, ticket_id: t.id, catalog_item_id: CI[t.catalogCode], line_no: t.line, created_at: d(t.createdAt) })));
  await insertRows(conn, 'approvals', list.filter((t) => t.approval).map((t) => ({
    approval_type: 'request', ticket_id: t.id, approver_id: null, approver_role: 'Line manager', status: t.approval.state,
    decided_by: t.approval.state === 'Approved' ? U.a3 : null, decided_at: t.approval.state === 'Approved' ? d(t.approval.at) : null, requested_at: d(t.createdAt),
  })));
  log(`${list.length} tickets in ${requests.length} requests`);

  // ---------- tasks ----------
  const tasks = [];
  const mkTask = (o) => {
    const t = { type: o.type || 'Task', ticket_id: o.ticket || null, problem_id: o.problem || null, change_id: o.change || null, title: o.title, description: o.desc || null, state: o.state || 'Ready', priority: o.priority || 3,
      assigned_to: o.assignee ? U[o.assignee] : null, team_id: TEAM[o.team || 'sd'], due_at: o.due ? d(o.due) : null, sort_order: o.order || 0, is_sequential: o.sequential ? 1 : 0,
      closed_at: o.closedAt ? d(o.closedAt) : null, created_at: d(o.createdAt || now), updated_at: d(o.createdAt || now) };
    tasks.push(t); return t;
  };
  for (const t of [...list].reverse()) {
    if (t.kind !== 'request' || !t.catalogCode) continue;
    const recent = t.resolvedAt && now - t.resolvedAt < 30 * DAY;
    const active = ['New', 'In Progress', 'On Hold'].includes(t.status) && t.status !== 'New';
    if (!active && !recent) continue;
    const names = CI_TASKS[CI[t.catalogCode]] || ['Fulfil the request'];
    const k = Math.floor(R() * names.length);
    names.forEach((n, i) => {
      const state = recent ? 'Done' : i < k ? 'Done' : i === k ? 'In progress' : 'Waiting';
      mkTask({ type: 'Catalog task', ticket: t.id, title: n, assignee: t.assignee, team: t.team, priority: t.priority, order: i, sequential: true, state, due: t.slaRes, createdAt: t.createdAt + 30 * MIN,
        closedAt: state === 'Done' ? (recent ? t.resolvedAt - HOUR : now - (k - i) * HOUR) : null });
    });
  }
  mkTask({ type: 'Incident task', ticket: openMajor.id, title: 'Check replication topology and site links', assignee: 'a6', team: 'infra', priority: 1, order: 0, state: 'In progress', due: now + HOUR, createdAt: openMajor.createdAt + 20 * MIN });
  mkTask({ type: 'Incident task', ticket: openMajor.id, title: 'Ask the network provider to check the path between sites', assignee: 'a7', team: 'infra', priority: 1, order: 1, state: 'Ready', due: now + 2 * HOUR, createdAt: openMajor.createdAt + 25 * MIN });
  mkTask({ title: 'Review access recertification results for Q3', desc: 'Check the quarterly access review and follow up on exceptions.', assignee: 'a0', team: 'sd', priority: 3, due: now + 3 * DAY, createdAt: now - 2 * DAY });
  mkTask({ title: 'Update the new starter checklist in the knowledge base', assignee: 'a1', team: 'sd', priority: 4, due: now + 6 * DAY, createdAt: now - DAY });
  mkTask({ title: 'Prepare the monthly service review deck', desc: 'Summarise SLA results, major incidents and open problems for the customer review.', assignee: 'a0', team: 'sd', priority: 3, due: now + 5 * DAY, createdAt: now - DAY });
  mkTask({ title: 'Renew the certificate for the status page', assignee: 'a8', team: 'apps', priority: 2, due: now + DAY, createdAt: now - 3 * DAY, state: 'In progress' });
  mkTask({ type: 'Problem task', problem: PRB[1], title: 'Capture DNS traces at the branch router', assignee: 'a6', team: 'infra', priority: 2, order: 0, state: 'In progress', due: now + 2 * DAY, createdAt: T(20) });
  mkTask({ type: 'Problem task', problem: PRB[1], title: 'Compare resolver logs between branches', assignee: 'a7', team: 'infra', priority: 2, order: 1, state: 'Ready', due: now + 4 * DAY, createdAt: T(20) });
  mkTask({ type: 'Problem task', problem: PRB[2], title: 'Test the vendor beta client v5.3 on a macOS 15 laptop', assignee: 'a2', team: 'sd', priority: 3, order: 0, state: 'Ready', due: now + 5 * DAY, createdAt: T(10) });

  // ---------- major incident ----------
  const [mi] = await conn.query('INSERT INTO major_incidents (mi_number, ticket_id, title, status, commander_id, impact, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['MI-1', openMajor.id, openMajor.title, 'Active', U.a6, 'Kestrel Bank branch sign-ins are slow. Payments are not affected.', d(openMajor.createdAt)]);
  await insertRows(conn, 'major_incident_updates', [
    { major_incident_id: mi.insertId, user_id: U.a6, body: 'Major incident declared. Infrastructure is investigating replication between the two Frankfurt domain controllers.', created_at: d(openMajor.createdAt + 15 * MIN) },
    { major_incident_id: mi.insertId, user_id: U.a6, body: 'Replication queue is draining slowly. Network path between the sites is being checked. Next update in 30 minutes.', created_at: d(Math.min(openMajor.createdAt + 140 * MIN, now - MIN)) },
  ]);

  // ---------- changes ----------
  const ownerTeam = { a4: 'soc', a6: 'infra', a7: 'infra', a8: 'apps' };
  const changeDefs = [
    ['Firewall rule update for warehouse scanners', 'Normal', 'Approval', 'a6', 'c-ob', ['fw-wh-02'], 52, 2, [1, 1, true, true], ['Approved', 'Pending', 'Pending'], 'Open the ports needed by the new warehouse handheld scanners.'],
    ['Upgrade endpoint agent to v8.2', 'Normal', 'Scheduled', 'a4', 'c-in', ['edr-mgmt-01'], 76, 3, [2, 0, true, true], ['Approved', 'Approved', 'Approved'], 'Roll out the new endpoint agent in three waves.', 'EDR agent failing'],
    ['Rotate service account keys', 'Normal', 'Approval', 'a8', 'c-nw', ['API gateway'], 120, 2, [3, 1, false, true], ['Approved', 'Pending', 'Pending'], 'Rotate the keys used by the payment integration service accounts.'],
    ['Database minor version patch', 'Standard', 'Scheduled', 'a7', 'c-hx', ['db-prod-02'], 26, 1, [2, 1, true, true], ['Approved', 'Approved', 'Approved'], 'Apply the vendor minor patch during the weekly maintenance window.'],
    ['Emergency patch: OpenSSH on 12 servers', 'Emergency', 'Doing', 'a6', 'c-hx', ['edr-mgmt-01'], -1, 3, [2, 1, false, true], ['Approved', 'Approved', 'Approved'], 'Patch OpenSSH on the 12 servers flagged in the latest vulnerability scan.', 'OpenSSH'],
    ['Replace core switch in the Pune office', 'Normal', 'Closed', 'a7', 'c-in', ['sw-pune-core'], -240, 4, [3, 2, true, true], ['Approved', 'Approved', 'Approved'], 'Replace the ageing core switch and move all uplinks.', null, ['Worked as planned', 'All uplinks moved. No incidents raised.']],
    ['Enable conditional access policy', 'Normal', 'Closed', 'a4', 'c-in', ['Okta single sign-on'], -480, 1, [3, 0, true, true], ['Approved', 'Approved', 'Approved'], 'Require a compliant device for access to Microsoft 365.', null, ['Worked with problems', 'Two users needed device enrolment help.']],
    ['Migrate file server to new storage', 'Normal', 'Closed', 'a7', 'c-in', ['fs-pune-01'], -360, 6, [2, 2, false, true], ['Approved', 'Approved', 'Approved'], 'Move file shares to the new storage array. Backed out after data verification failed.', null, ['Did not work', 'Data verification failed. Backed out to the old array.']],
    ['Update VPN gateway firmware', 'Normal', 'Verify', 'a6', 'c-in', ['vpn-gw-01'], -30, 2, [3, 1, true, true], ['Approved', 'Approved', 'Approved'], 'Apply the latest firmware to fix the reconnect issue.'],
    ['Decommission legacy jump host', 'Normal', 'Draft', 'a7', 'c-in', ['jump-legacy-01'], 210, 2, [1, 0, true, false], ['Pending', 'Pending', 'Pending'], 'Retire the old jump host after moving admin access to the new bastion.'],
    ['Patch operating system on EDR management server', 'Normal', 'Scheduled', 'a7', 'c-in', ['edr-mgmt-01'], 77, 2, [2, 1, true, true], ['Approved', 'Approved', 'Approved'], 'Apply the monthly operating system updates.'],
    ['Upgrade Wi-Fi controller firmware', 'Normal', 'Risk review', 'a7', 'c-in', ['wlc-pune-01'], 168, 2, [2, 1, true, true], ['Pending', 'Pending', 'Pending'], 'Move the Pune Wi-Fi controller to the current firmware release.'],
  ];
  const approvers = [['a3', 'Change manager'], ['a4', 'Security lead'], ['a8', 'Service owner']];
  let cn = 0;
  const CHG = [];
  for (const [title, type, status, owner, cu, assetNames, startOff, hrs, [scope, down, tested, backout], dec, desc, ticketTitle, close] of changeDefs) {
    const score = scope + down + (tested ? 0 : 2) + (backout ? 0 : 2);
    const start = now + startOff * HOUR, end = start + hrs * HOUR;
    const [res] = await conn.query(
      `INSERT INTO changes (change_number, title, type, status, owner_id, customer_id, planned_start, planned_end, risk, risk_scope, risk_downtime, risk_tested, risk_backout,
        description, implementation_plan, backout_plan, test_plan, close_code, close_notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [num('CHG', ++cn), title, type, status, U[owner], CUST[cu], d(start), d(end), score <= 3 ? 'Low' : score <= 5 ? 'Medium' : 'High', scope, down, tested ? 1 : 0, backout ? 1 : 0, desc,
        '1. Notify affected users.\n2. Take a snapshot or configuration backup.\n3. Apply the change in the agreed window.\n4. Run the post-change checks.',
        backout ? 'Restore the snapshot or configuration backup taken before the change.' : '', tested ? 'Tested in the staging environment last week with no issues.' : '',
        close ? close[0] : null, close ? close[1] : null, U[owner], d(now - 6 * DAY), d(now - DAY)],
    );
    const id = res.insertId;
    CHG.push({ id, status, owner, start, end, close });
    for (const n of assetNames) await conn.query('INSERT INTO change_assets (change_id, asset_id) VALUES (?, ?)', [id, A(n).id]);
    await insertRows(conn, 'approvals', approvers.map(([who, role], i) => ({
      approval_type: 'change', change_id: id, approver_id: U[who], approver_role: role, status: dec[i], is_requested: status === 'Draft' || status === 'Risk review' ? 0 : 1,
      decided_by: dec[i] === 'Pending' ? null : U[who], decided_at: dec[i] === 'Pending' ? null : d(now - DAY), sort_order: i, requested_at: d(now - 6 * DAY),
    })));
    await conn.query('INSERT INTO change_activities (change_id, type, body, created_at) VALUES (?, ?, ?, ?)', [id, 'system', 'Change created', d(now - 6 * DAY)]);
    if (close) await conn.query('INSERT INTO change_activities (change_id, type, body, created_at) VALUES (?, ?, ?, ?)', [id, 'system', `Closed (${close[0]})`, d(end)]);
    if (ticketTitle) {
      const t = list.filter((x) => x.title.startsWith(ticketTitle)).sort((a, b) => b.createdAt - a.createdAt)[0];
      if (t) await conn.query('UPDATE tickets SET change_id = ? WHERE id = ?', [id, t.id]);
    }
    if (['Doing', 'Verify', 'Closed'].includes(status)) {
      ['Notify affected users', 'Take a snapshot or configuration backup', 'Apply the change', 'Run the post-change checks'].forEach((n, i) => {
        const st = status === 'Closed' ? (close && close[0] === 'Did not work' && i >= 2 ? 'Not done' : 'Done') : status === 'Verify' ? 'Done' : (i < 2 ? 'Done' : i === 2 ? 'In progress' : 'Ready');
        mkTask({ type: 'Change task', change: id, title: n, assignee: owner, team: ownerTeam[owner] || 'sd', priority: 3, order: i, state: st, due: end, createdAt: now - 6 * DAY,
          closedAt: ['Done', 'Not done', 'Not needed'].includes(st) ? start + (i + 1) * 20 * MIN : null });
      });
    }
  }
  log(`${CHG.length} changes`);

  let tn = 0;
  tasks.sort((a, b) => a.created_at - b.created_at).forEach((t) => { t.task_number = num('TSK', ++tn); });
  await insertRows(conn, 'tasks', tasks);
  const [taskRows] = await conn.query('SELECT id, created_at FROM tasks');
  await insertRows(conn, 'task_activities', taskRows.map((t) => ({ task_id: t.id, user_id: null, body: 'Task created', created_at: t.created_at })));
  log(`${tasks.length} tasks`);

  // ---------- knowledge base ----------
  const kb = [
    ['Fix VPN drops after your Mac wakes from sleep', 'Network and VPN', 'Public', 'Some Macs on macOS 15 lose the VPN connection after sleep.\n\n## Quick fix\n1. Open the VPN app from the menu bar.\n2. Select **Disconnect**, wait five seconds, then select **Connect**.\n3. Check that internal sites open.\n\n## Prevent it\n- In **System settings > Battery**, turn off "Put hard disks to sleep when possible".\n- Keep the VPN client on the latest version. A vendor fix is planned in v5.3.\n\nIf this does not help, raise a ticket and include the time it last dropped.', 482, [61, 7], ['vpn', 'macos']],
    ['Reset or re-enrol multi-factor authentication', 'Access and identity', 'Public', 'Use this when you get a new phone or your prompts stop arriving.\n\n## Steps\n1. Go to the sign-in page and choose **Use a code instead**.\n2. Sign in with your password and the SMS or authenticator code.\n3. Open **Security settings** and select **Add a device**.\n4. Scan the QR code with your authenticator app.\n\nIf you cannot sign in at all, contact the service desk and we will verify your identity and reset MFA.', 910, [132, 11], ['mfa', 'okta']],
    ['Rebuild your Outlook profile', 'Software and apps', 'Public', 'If Outlook will not open after an update, rebuilding the profile usually fixes it.\n\n1. Close Outlook.\n2. Open **Control Panel > Mail > Show Profiles**.\n3. Select **Add**, name the new profile and enter your email address.\n4. Choose the new profile as default and start Outlook.\n\nYour mail stays on the server, so nothing is lost.', 356, [44, 5], ['outlook', 'email']],
    ['Connect to office Wi-Fi', 'Network and VPN', 'Public', '## Staff\nSelect the **Veltrix-Corp** network and sign in with your work account.\n\n## Guests\nAsk your host to request guest access from the service catalog. Codes are valid for the days requested.\n\n## Still dropping?\nNote the floor and time and raise a ticket. Include the name of the access point if you can see it.', 288, [33, 6], ['wifi']],
    ['Report a suspected phishing email', 'Security alerts', 'Public', 'Do not click links or open attachments.\n\n1. Use the **Report phishing** button in your mail client.\n2. If you already clicked a link, tell the service desk straight away and change your password.\n3. Do not forward the email to colleagues.\n\nThe security team will check the message and tell you the outcome.', 640, [98, 3], ['phishing', 'security']],
    ['Get access to a shared drive or mailbox', 'Access and identity', 'Public', 'Access is granted by group membership.\n\n1. Request the drive or mailbox from the **Service catalog**.\n2. Your manager gets an approval request.\n3. Once approved, access is added within one working day.\n\nSign out and back in after approval so the new access takes effect.', 205, [27, 4], ['access']],
    ['Printer shows offline', 'Hardware and devices', 'Public', '1. Check the printer is on and shows a network address.\n2. On your computer open **Printers and scanners**, select the printer and choose **Open queue**.\n3. Clear stuck jobs and select **Use printer online**.\n\nIf several people are affected, raise one ticket with the floor and printer name.', 174, [19, 8], ['printer']],
    ['New starter checklist', 'Onboarding and HR', 'Internal', 'Use this when a new employee joins.\n\n- Confirm the start date and department with HR.\n- Raise **New starter setup** at least five working days ahead.\n- Order the device and check stock.\n- Create accounts and add the user to the standard groups.\n- Book 30 minutes on day one to hand over the laptop and explain MFA.', 88, [12, 0], ['onboarding', 'agents']],
    ['Major incident communication playbook', 'Security alerts', 'Internal', '## When to declare\nDeclare a major incident when a critical service is down or many users are blocked.\n\n## Roles\n- **Incident commander** owns decisions.\n- **Communications lead** posts updates.\n\n## Update rhythm\n- First update within 15 minutes.\n- Then every 30 minutes until resolved.\n- Always state what is known, what is being done and when the next update is due.', 131, [21, 1], ['major incident', 'process']],
    ['Handling a compromised account', 'Security alerts', 'Internal', '1. Revoke all active sessions and reset the password.\n2. Re-enrol MFA after identity is verified by phone.\n3. Check mailbox rules for forwarding to external addresses.\n4. Search sign-in logs for the past seven days.\n5. Create a security incident and link the account.\n\nRecord findings in the ticket so they appear in the monthly report.', 97, [15, 0], ['security', 'account']],
    ['Draft: Cloud storage retention guide', 'Software and apps', 'Internal', '## Retention\n- Working files: 3 years.\n- Financial records: 7 years.\n\nThis article is a draft and needs review by legal.', 3, [0, 0], ['draft']],
  ];
  let kn = 0;
  for (const [title, cat, aud, body, views, [h, nh], tags] of kb) {
    const draft = kn === kb.length - 1;
    const upd = now - Math.floor(R() * 60) * DAY;
    const [res] = await conn.query(
      `INSERT INTO knowledge_articles (article_number, title, category_id, audience, status, body, view_count, helpful_count, not_helpful_count, author_id, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [num('KB', ++kn), title, KBCAT[cat], aud, draft ? 'Draft' : 'Published', body, views, h, nh, U[pick(['a1', 'a2', 'a3', 'a4'])], draft ? null : d(upd), d(upd - 30 * DAY), d(upd)],
    );
    for (const tag of tags) await conn.query('INSERT INTO knowledge_article_tags (article_id, tag) VALUES (?, ?)', [res.insertId, tag]);
  }
  log(`${kb.length} knowledge articles`);

  // ---------- sample attachments ----------
  const files = [
    [keyed.phish, 'email-headers.txt', 'Received: from mail.payroll-verify.example (203.0.113.44)\nFrom: "Payroll Team" <hr-update@payroll-verify.example>\nSubject: Confirm your details today\nReply-To: collect@payroll-verify.example\nX-Mailer: bulk-sender 2.1\nSPF: fail\nDKIM: none\n'],
    [keyed.major, 'repadmin-showrepl.txt', 'Source: DC-FRA-02\nDestination: DC-FRA-01\nLast attempt @ 13:41 was successful.\nQueue length: 3412 (growing)\nLargest delta: 21 minutes\n'],
    [keyed.vpn, 'vpn-client.log', '12:03:11 tunnel up\n12:41:52 system sleep\n12:58:07 system wake\n12:58:09 keepalive timeout\n12:58:09 tunnel state=stale (no reconnect attempted)\n'],
  ];
  for (const [t, name, text] of files) {
    const meta = await writeUpload(Buffer.from(text, 'utf8'));
    await conn.query(
      'INSERT INTO attachments (entity_type, entity_id, original_name, stored_name, mime_type, extension, size_bytes, sha256, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['ticket', t.id, name, meta.storedName, 'text/plain', name.split('.').pop(), meta.size, meta.sha256, t.assignee ? U[t.assignee] : U.a0, d(t.createdAt + 5 * MIN)],
    );
  }

  // ---------- audit samples ----------
  await insertRows(conn, 'audit_logs', [
    { user_id: U.a6, action: 'Declared major incident MI-1', entity_type: 'ticket', entity_id: String(openMajor.id), entity_ref: openMajor.number, created_at: d(now - 2 * HOUR) },
    { user_id: U.a4, action: 'Set priority to Critical', entity_type: 'ticket', entity_id: String(keyed.phish.id), entity_ref: keyed.phish.number, created_at: d(now - 90 * MIN) },
    { user_id: U.a3, action: 'Approved change', entity_type: 'change', entity_id: String(CHG[3].id), entity_ref: num('CHG', 4), created_at: d(now - 5 * HOUR) },
    { user_id: U.a0, action: 'Updated SLA policy', entity_type: 'settings', entity_id: null, entity_ref: 'Settings', created_at: d(now - DAY) },
  ].map((r) => ({ ...r, old_values: null, new_values: null, ip_address: null, user_agent: 'seed', request_id: null })));

  // ---------- sequences ----------
  const seq = { INC: incN, REQ: reqN, TSK: tn, CHG: cn, PRB: problems.length, KB: kn, MI: 1 };
  for (const [prefix, value] of Object.entries(seq)) {
    await conn.query('INSERT INTO sequences (prefix, seq_year, last_value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE last_value = GREATEST(last_value, VALUES(last_value))', [prefix, prefix === 'MI' ? 0 : YR, value]);
  }
  await conn.query('INSERT INTO sequences (prefix, seq_year, last_value) VALUES (?, 0, ?) ON DUPLICATE KEY UPDATE last_value = GREATEST(last_value, VALUES(last_value))', ['AST', an]);
  log('sequences');
}
