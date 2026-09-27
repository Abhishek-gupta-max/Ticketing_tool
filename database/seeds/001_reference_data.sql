-- Reference data required by the application. Safe to run more than once:
-- INSERT IGNORE never overwrites values an administrator has changed.

-- Priorities with their default SLA targets (minutes).
INSERT IGNORE INTO priorities (id, name, response_minutes, resolution_minutes) VALUES
  (1, 'Critical', 15, 240),
  (2, 'High', 30, 480),
  (3, 'Medium', 120, 1440),
  (4, 'Low', 240, 4320);

-- Pick lists.
INSERT IGNORE INTO lookup_values (list_key, value, sort_order) VALUES
  ('channel', 'Portal', 1), ('channel', 'Email', 2), ('channel', 'Phone', 3), ('channel', 'Chat', 4), ('channel', 'Monitoring', 5),
  ('hold_reason', 'Waiting for requester', 1), ('hold_reason', 'Waiting for a change', 2), ('hold_reason', 'Waiting for a fix', 3), ('hold_reason', 'Waiting for supplier', 4),
  ('resolution_code', 'Fixed', 1), ('resolution_code', 'Workaround given', 2), ('resolution_code', 'Fixed remotely', 3), ('resolution_code', 'Guidance given', 4),
  ('resolution_code', 'Resolved by requester', 5), ('resolution_code', 'Duplicate', 6), ('resolution_code', 'Cannot reproduce', 7), ('resolution_code', 'Won''t fix', 8),
  ('resolution_code', 'Cancelled by requester', 9),
  ('problem_code', 'Fixed permanently', 1), ('problem_code', 'Workaround accepted', 2), ('problem_code', 'Duplicate problem', 3),
  ('change_close_code', 'Worked as planned', 1), ('change_close_code', 'Worked with problems', 2), ('change_close_code', 'Did not work', 3),
  ('department', 'Finance', 1), ('department', 'Engineering', 2), ('department', 'Operations', 3), ('department', 'HR', 4), ('department', 'Sales', 5),
  ('environment', 'Production', 1), ('environment', 'Staging', 2), ('environment', 'Development', 3), ('environment', 'Disaster recovery', 4),
  ('timezone', 'Asia/Kolkata', 1), ('timezone', 'Europe/London', 2), ('timezone', 'Europe/Berlin', 3), ('timezone', 'America/New_York', 4),
  ('timezone', 'America/Los_Angeles', 5), ('timezone', 'Asia/Singapore', 6), ('timezone', 'Australia/Sydney', 7);

INSERT IGNORE INTO asset_types (name, icon, is_subscription, is_personal_device, sort_order) VALUES
  ('Server', 'server', 0, 0, 1),
  ('Laptop', 'laptop', 0, 1, 2),
  ('Mobile device', 'monitor', 0, 1, 3),
  ('Network device', 'wifi', 0, 0, 4),
  ('Firewall', 'shield', 0, 0, 5),
  ('Application', 'box', 1, 0, 6),
  ('Cloud service', 'cloud', 1, 0, 7),
  ('Printer', 'monitor', 0, 0, 8),
  ('Other', 'monitor', 0, 0, 9);

INSERT IGNORE INTO knowledge_categories (name, sort_order) VALUES
  ('Access and identity', 1), ('Software and apps', 2), ('Hardware and devices', 3), ('Network and VPN', 4),
  ('Security alerts', 5), ('Onboarding and HR', 6), ('Facilities and other', 7);

INSERT IGNORE INTO automation_rules (code, name, description, is_enabled, sort_order) VALUES
  ('r1', 'Route security alerts to Security operations', 'When the category is Security alerts, the ticket goes to the Security operations team.', 1, 1),
  ('r2', 'Assign critical tickets to the on-call agent', 'Critical tickets go to the on-call person of the assignment group when nobody is chosen.', 1, 2),
  ('r3', 'Auto-close resolved tickets after a set number of days', 'Resolved tickets close by themselves after the number of days below.', 1, 3),
  ('r4', 'Raise priority by one level for VIP requesters', 'A VIP requester gets one priority level higher, up to critical.', 0, 4),
  ('r5', 'Use the support group of the affected asset', 'When a ticket names a configuration item, its support group becomes the assignment group.', 1, 5);

INSERT IGNORE INTO canned_responses (name, body, sort_order) VALUES
  ('Acknowledge', 'Thanks for getting in touch. I have picked this up and will update you shortly.', 1),
  ('Need more information', 'Could you share a few more details so I can investigate? Please include when this started and any error messages you see.', 2),
  ('Resolved, please confirm', 'I have applied a fix and everything looks normal on our side. Please let me know if you still see the problem and I will reopen this ticket.', 3),
  ('Waiting on you', 'I am waiting for your reply before I can continue. This ticket will be paused until then.', 4);

INSERT IGNORE INTO settings (setting_key, value) VALUES
  ('organisation', '{"name":"Veltrixsecure","timezone":"Asia/Kolkata"}'),
  ('business_hours', '{"start":"09:00","end":"18:00","days":[1,2,3,4,5]}'),
  ('automation', '{"autoCloseDays":3}'),
  ('notifications', '{"newAssigned":true,"breachWarn":true,"majorIncident":true,"approvals":true,"dailyDigest":false}'),
  ('integrations', '{"email":{"on":true,"address":"support@veltrixsecure.example"},"siem":{"on":true},"slack":{"on":false},"teams":{"on":false},"sso":{"on":false},"webhook":{"on":false,"url":"","keyHash":null,"keyPreview":null}}'),
  ('request_sla', '{"responseMinutes":120}'),
  ('cab_approvers', '[]');
