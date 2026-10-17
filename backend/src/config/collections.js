// MongoDB collections: one per former MySQL table, with the same field names.
// This file is the schema: it lists every field with its default (applied on
// insert, because MongoDB has none), the unique keys and the indexes.
//
//   id: true     numeric auto-increment "id" (from the counters collection)
//   touch: true  updated_at is set on every update (MySQL ON UPDATE)
//   fields       default per field; NOW = insert time, REQUIRED = must be given
//   unique       unique keys (case-insensitive, like the MySQL collation)
//   indexes      other indexes

export const NOW = Symbol('now');
export const REQUIRED = Symbol('required');

const ts = { created_at: NOW, updated_at: NOW };

export const COLLECTIONS = {
  roles: { id: true, touch: true, fields: { name: REQUIRED, description: null, is_system: 1, ...ts }, unique: [['name']] },
  permissions: { id: true, fields: { code: REQUIRED, description: null, created_at: NOW }, unique: [['code']] },
  role_permissions: { fields: { role_id: REQUIRED, permission_id: REQUIRED }, unique: [['role_id', 'permission_id']], indexes: [['permission_id']] },

  users: {
    id: true, touch: true,
    fields: {
      role_id: REQUIRED, name: REQUIRED, email: REQUIRED, password_hash: REQUIRED, status: 'active', token_version: 0, failed_login_count: 0,
      locked_until: null, last_login_at: null, password_changed_at: null, reset_token_hash: null, reset_token_expires_at: null, ...ts, deleted_at: null,
    },
    unique: [['email']],
    indexes: [['role_id'], ['status'], ['reset_token_hash']],
  },

  teams: {
    id: true, touch: true,
    fields: { code: REQUIRED, name: REQUIRED, type: 'Support', description: null, email: null, manager_id: null, is_active: 1, ...ts },
    unique: [['code'], ['name']],
    indexes: [['manager_id']],
  },
  agents: { touch: true, fields: { user_id: REQUIRED, primary_team_id: null, job_title: null, ...ts }, unique: [['user_id']], indexes: [['primary_team_id']] },
  team_members: { fields: { team_id: REQUIRED, user_id: REQUIRED, is_on_call: 0, created_at: NOW }, unique: [['team_id', 'user_id']], indexes: [['user_id']] },

  customers: {
    id: true, touch: true,
    fields: { code: REQUIRED, name: REQUIRED, plan: 'Business', is_internal: 0, ...ts, deleted_at: null },
    unique: [['code'], ['name']],
  },
  people: {
    id: true, touch: true,
    fields: {
      customer_id: REQUIRED, user_id: null, name: REQUIRED, email: REQUIRED, is_vip: 0, department: null, job_title: null, location: null, phone: null,
      ...ts, deleted_at: null,
    },
    unique: [['email']],
    indexes: [['customer_id'], ['name'], ['user_id']],
  },

  priorities: { touch: true, fields: { id: REQUIRED, name: REQUIRED, response_minutes: REQUIRED, resolution_minutes: REQUIRED, updated_at: NOW }, unique: [['id'], ['name']] },
  ticket_categories: {
    id: true, touch: true,
    fields: { name: REQUIRED, default_team_id: null, sort_order: 0, is_active: 1, ...ts },
    unique: [['name']],
    indexes: [['default_team_id']],
  },
  lookup_values: { id: true, fields: { list_key: REQUIRED, value: REQUIRED, sort_order: 0, is_active: 1 }, unique: [['list_key', 'value']], indexes: [['list_key', 'sort_order']] },
  sequences: { touch: true, fields: { prefix: REQUIRED, seq_year: REQUIRED, last_value: 0, updated_at: NOW }, unique: [['prefix', 'seq_year']] },
  settings: { touch: true, fields: { setting_key: REQUIRED, value: REQUIRED, updated_by: null, updated_at: NOW }, unique: [['setting_key']] },
  automation_rules: {
    id: true, touch: true,
    fields: { code: REQUIRED, name: REQUIRED, description: null, is_enabled: 1, sort_order: 0, updated_at: NOW },
    unique: [['code']],
  },
  canned_responses: { id: true, touch: true, fields: { name: REQUIRED, body: REQUIRED, sort_order: 0, ...ts }, unique: [['name']] },

  asset_types: {
    id: true,
    fields: { name: REQUIRED, icon: 'box', is_subscription: 0, is_personal_device: 0, sort_order: 0 },
    unique: [['name']],
  },
  assets: {
    id: true, touch: true,
    fields: {
      asset_tag: REQUIRED, name: REQUIRED, asset_type_id: REQUIRED, criticality: 'Medium', status: 'In use', environment: 'Production', customer_id: REQUIRED,
      department: null, location: null, serial_number: null, platform: null, purchase_date: null, warranty_end: null, assigned_person_id: null,
      owner_person_id: null, managed_by: null, support_team_id: null, notes: null, created_by: null, ...ts, deleted_at: null,
    },
    unique: [['asset_tag'], ['name']],
    indexes: [['asset_type_id'], ['status'], ['customer_id'], ['assigned_person_id'], ['owner_person_id'], ['support_team_id']],
  },
  asset_dependencies: { fields: { asset_id: REQUIRED, depends_on_asset_id: REQUIRED }, unique: [['asset_id', 'depends_on_asset_id']], indexes: [['depends_on_asset_id']] },

  problems: {
    id: true, touch: true,
    fields: {
      problem_number: REQUIRED, title: REQUIRED, status: 'Logged', priority: 3, owner_id: null, team_id: null, customer_id: null, root_cause: null,
      workaround: null, is_known_error: 0, resolution_code: null, fix_notes: null, resolved_at: null, created_by: null, ...ts, deleted_at: null,
    },
    unique: [['problem_number']],
    indexes: [['status'], ['owner_id'], ['created_at']],
  },
  problem_activities: {
    id: true,
    fields: { problem_id: REQUIRED, user_id: null, type: 'system', body: REQUIRED, created_at: NOW },
    indexes: [['problem_id', 'created_at']],
  },

  changes: {
    id: true, touch: true,
    fields: {
      change_number: REQUIRED, title: REQUIRED, type: 'Normal', status: 'Draft', owner_id: null, customer_id: null, problem_id: null,
      planned_start: REQUIRED, planned_end: REQUIRED, impact: 2, urgency: 2, risk: 'Medium', risk_scope: 2, risk_downtime: 1, risk_tested: 1,
      risk_backout: 1, description: null, implementation_plan: null, backout_plan: null, test_plan: null, close_code: null, close_notes: null,
      created_by: null, ...ts, deleted_at: null,
    },
    unique: [['change_number']],
    indexes: [['status'], ['planned_start'], ['owner_id'], ['problem_id']],
  },
  change_assets: { fields: { change_id: REQUIRED, asset_id: REQUIRED }, unique: [['change_id', 'asset_id']], indexes: [['asset_id']] },
  change_activities: {
    id: true,
    fields: { change_id: REQUIRED, user_id: null, type: 'system', body: REQUIRED, created_at: NOW },
    indexes: [['change_id', 'created_at']],
  },

  catalog_items: {
    id: true, touch: true,
    fields: {
      code: REQUIRED, name: REQUIRED, category_id: REQUIRED, icon: 'box', description: REQUIRED, requires_approval: 0, fulfilment_hours: 24,
      is_active: 1, sort_order: 0, ...ts,
    },
    unique: [['code'], ['name']],
    indexes: [['category_id']],
  },
  catalog_fields: {
    id: true,
    fields: { catalog_item_id: REQUIRED, field_key: REQUIRED, label: REQUIRED, field_type: 'text', is_required: 0, options: null, sort_order: 0 },
    unique: [['catalog_item_id', 'field_key']],
  },
  catalog_tasks: { id: true, fields: { catalog_item_id: REQUIRED, title: REQUIRED, sort_order: 0 }, indexes: [['catalog_item_id', 'sort_order']] },

  requests: {
    id: true, touch: true,
    fields: { request_number: REQUIRED, requested_for_id: REQUIRED, customer_id: REQUIRED, opened_by: null, ...ts },
    unique: [['request_number']],
    indexes: [['requested_for_id'], ['customer_id'], ['created_at']],
  },

  tickets: {
    // updated_at is maintained by the repository (no automatic touch).
    id: true,
    fields: {
      ticket_number: REQUIRED, kind: REQUIRED, title: REQUIRED, description: null, customer_id: REQUIRED, requester_id: REQUIRED, category_id: REQUIRED,
      team_id: null, assigned_to: null, channel: 'Portal', impact: 2, urgency: 2, priority: 3, status: 'New', hold_reason: null, is_major: 0,
      sla_response_due_at: REQUIRED, sla_resolution_due_at: REQUIRED, paused_at: null, paused_seconds: 0, first_response_at: null, resolved_at: null,
      closed_at: null, resolution_code: null, resolution_notes: null, csat: null, reopened_count: 0, asset_id: null, problem_id: null, change_id: null,
      parent_ticket_id: null, request_id: null, catalog_item_id: null, created_by: null, ...ts, deleted_at: null,
    },
    unique: [['ticket_number']],
    indexes: [['status'], ['priority'], ['assigned_to'], ['created_at'], ['category_id'], ['team_id'], ['customer_id'], ['requester_id'],
      ['kind', 'status'], ['resolved_at'], ['updated_at'], ['asset_id'], ['problem_id'], ['change_id'], ['request_id'], ['parent_ticket_id']],
  },
  ticket_tags: { fields: { ticket_id: REQUIRED, tag: REQUIRED }, unique: [['ticket_id', 'tag']], indexes: [['tag']] },
  ticket_comments: { id: true, fields: { ticket_id: REQUIRED, user_id: null, type: 'comment', body: REQUIRED, created_at: NOW }, indexes: [['ticket_id', 'created_at']] },
  ticket_activities: { id: true, fields: { ticket_id: REQUIRED, user_id: null, body: REQUIRED, created_at: NOW }, indexes: [['ticket_id', 'created_at']] },
  ticket_history: {
    id: true,
    fields: { ticket_id: REQUIRED, field: REQUIRED, old_value: null, new_value: null, changed_by: null, changed_at: NOW },
    indexes: [['ticket_id', 'changed_at']],
  },
  major_incidents: {
    id: true,
    fields: { mi_number: REQUIRED, ticket_id: REQUIRED, title: REQUIRED, status: 'Active', commander_id: null, impact: REQUIRED, started_at: NOW, resolved_at: null },
    unique: [['mi_number']],
    indexes: [['status'], ['ticket_id']],
  },
  major_incident_updates: {
    id: true,
    fields: { major_incident_id: REQUIRED, user_id: null, body: REQUIRED, created_at: NOW },
    indexes: [['major_incident_id', 'created_at']],
  },

  request_items: {
    id: true,
    fields: { request_id: REQUIRED, ticket_id: REQUIRED, catalog_item_id: null, line_no: REQUIRED, created_at: NOW },
    unique: [['ticket_id'], ['request_id', 'line_no']],
    indexes: [['catalog_item_id']],
  },
  request_item_values: {
    id: true,
    fields: { request_item_id: REQUIRED, field_key: REQUIRED, label: REQUIRED, value: null, sort_order: 0 },
    unique: [['request_item_id', 'field_key']],
  },

  tasks: {
    id: true, touch: true,
    fields: {
      task_number: REQUIRED, type: 'Task', ticket_id: null, problem_id: null, change_id: null, title: REQUIRED, description: null, state: 'Ready',
      priority: 3, assigned_to: null, team_id: null, due_at: null, sort_order: 0, is_sequential: 0, closed_at: null, close_notes: null,
      created_by: null, ...ts,
    },
    unique: [['task_number']],
    indexes: [['ticket_id', 'sort_order'], ['problem_id', 'sort_order'], ['change_id', 'sort_order'], ['assigned_to', 'state'], ['state'], ['team_id'], ['due_at']],
  },
  task_comments: { id: true, fields: { task_id: REQUIRED, user_id: null, body: REQUIRED, created_at: NOW }, indexes: [['task_id', 'created_at']] },
  task_activities: { id: true, fields: { task_id: REQUIRED, user_id: null, body: REQUIRED, created_at: NOW }, indexes: [['task_id', 'created_at']] },

  approvals: {
    id: true, touch: true,
    fields: {
      approval_type: REQUIRED, ticket_id: null, change_id: null, approver_id: null, approver_role: REQUIRED, status: 'Pending', is_requested: 1,
      comment: null, decided_by: null, decided_at: null, sort_order: 0, requested_at: NOW, updated_at: NOW,
    },
    indexes: [['ticket_id'], ['change_id', 'sort_order'], ['approver_id', 'status'], ['status', 'approval_type'], ['decided_at']],
  },

  attachments: {
    id: true,
    fields: {
      entity_type: REQUIRED, entity_id: REQUIRED, comment_id: null, original_name: REQUIRED, stored_name: REQUIRED, mime_type: REQUIRED,
      extension: REQUIRED, size_bytes: REQUIRED, sha256: REQUIRED, uploaded_by: null, created_at: NOW, deleted_at: null,
    },
    unique: [['stored_name']],
    indexes: [['entity_type', 'entity_id'], ['comment_id']],
  },

  knowledge_categories: { id: true, fields: { name: REQUIRED, sort_order: 0 }, unique: [['name']] },
  knowledge_articles: {
    id: true, touch: true,
    fields: {
      article_number: REQUIRED, title: REQUIRED, category_id: REQUIRED, audience: 'Public', status: 'Draft', body: REQUIRED, view_count: 0,
      helpful_count: 0, not_helpful_count: 0, author_id: null, published_at: null, ...ts, deleted_at: null,
    },
    unique: [['article_number']],
    indexes: [['status', 'audience'], ['category_id'], ['view_count']],
  },
  knowledge_article_tags: { fields: { article_id: REQUIRED, tag: REQUIRED }, unique: [['article_id', 'tag']], indexes: [['tag']] },
  knowledge_article_votes: { fields: { article_id: REQUIRED, user_id: REQUIRED, is_helpful: REQUIRED, voted_at: NOW }, unique: [['article_id', 'user_id']] },
  knowledge_article_views: { fields: { article_id: REQUIRED, user_id: REQUIRED, view_date: REQUIRED }, unique: [['article_id', 'user_id', 'view_date']] },

  notifications: {
    id: true,
    fields: {
      user_id: REQUIRED, type: REQUIRED, severity: 'info', title: REQUIRED, link: null, dedupe_key: null, is_read: 0, read_at: null, created_at: NOW,
    },
    // A missing dedupe_key never collides (MySQL allowed many NULLs).
    unique: [{ keys: ['user_id', 'dedupe_key'], partial: { dedupe_key: { $type: 'string' } } }],
    indexes: [['user_id', 'is_read', 'created_at']],
  },

  // Append-only: the application never updates or deletes audit entries.
  audit_logs: {
    id: true,
    fields: {
      user_id: null, action: REQUIRED, entity_type: REQUIRED, entity_id: null, entity_ref: null, old_values: null, new_values: null,
      ip_address: null, user_agent: null, request_id: null, created_at: NOW,
    },
    indexes: [['user_id'], ['created_at'], ['entity_type', 'entity_id']],
  },

  report_schedules: {
    id: true,
    fields: { name: REQUIRED, frequency: 'Weekly', format: 'PDF', recipient: REQUIRED, run_when: REQUIRED, created_by: null, created_at: NOW },
  },
};

// Case-insensitive comparisons and sorting, like MySQL's utf8mb4_unicode_ci.
export const COLLATION = { locale: 'en', strength: 2 };
