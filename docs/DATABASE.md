# Database

The application uses the MySQL / MariaDB database `tickenting_tools` (utf8mb4). Every table is created by the migrations in `database/migrations`; `database/schema.sql` is the same schema in one file, generated with `npm run db:schema`.

## Starting point

Before this migration the `tickenting_tools` database existed but contained no tables (checked on MariaDB 10.4.32: `information_schema.tables` returned 0 rows), and the original application kept all data in the browser (`localStorage` key `veltrixsecure-servicedesk-v4`, attachments in IndexedDB). There was therefore no existing server data to migrate or preserve. The migrations only ever use `CREATE TABLE IF NOT EXISTS` / `CREATE OR REPLACE VIEW`; none drops a table or deletes rows.

## Running migrations

```bash
npm run db:migrate     # apply pending migrations (creates the database if missing)
npm run db:status      # list applied / pending migrations
npm run db:seed        # reference data: roles, permissions, priorities, lookups, teams, categories, catalog, first admin
npm run db:seed:demo   # optional sample workspace (refuses to run with NODE_ENV=production)
npm run db:schema      # regenerate database/schema.sql
```

Applied migrations are recorded in `schema_migrations` with a SHA-256 checksum; `db:migrate` warns if an applied file was edited later. To change the schema, add a new numbered file (for example `020_add_ticket_source.sql`); never edit an applied one. The runner understands `DELIMITER` blocks, so files also run unchanged in phpMyAdmin or the `mysql` client.

## Tables

| Area | Tables | Notes |
|---|---|---|
| Access control | `roles`, `permissions`, `role_permissions`, `users` | Granular permissions such as `ticket:create`; bcrypt password hashes; lockout and reset-token columns; `token_version` invalidates sessions. |
| Organisation | `teams`, `team_members`, `agents`, `customers`, `people` | An agent is a user with an `agents` profile and one or more team memberships (`is_on_call` per team). `people` are requesters of a customer, optionally linked to a portal login (`user_id`). |
| Configuration | `priorities`, `ticket_categories`, `lookup_values`, `automation_rules`, `canned_responses`, `settings`, `sequences` | SLA targets per priority, routing per category (`default_team_id`), pick lists (channels, hold reasons, resolution codes...), rules r1-r5, key/value settings. |
| Tickets | `tickets`, `ticket_tags`, `ticket_comments`, `ticket_activities`, `ticket_history`, `major_incidents`, `major_incident_updates` | Incidents and request order items. Comments are replies (`comment`) or agent-only work notes (`note`); activities are system timeline lines; history is field-level old/new values. |
| Requests and catalog | `catalog_items`, `catalog_fields`, `catalog_tasks`, `requests`, `request_items`, `request_item_values` | A request (`REQ-...`) has one or more order items; each item is a `tickets` row of kind `request` (`REQ-....1`) linked through `request_items`, with the submitted form answers in `request_item_values`. |
| Tasks | `tasks`, `task_comments`, `task_activities` | Parent is a ticket, problem or change through three nullable foreign keys; a CHECK allows at most one. Sequential tasks open in order. |
| Problems | `problems`, `problem_activities` | Root cause, workaround, known error, resolution. |
| Changes | `changes`, `change_assets`, `change_activities` | Plans, risk answers and score, schedule, close code. |
| Approvals | `approvals` (+ view `change_approvals`) | One reusable table. `approval_type = 'request'` rows belong to a ticket (line manager); `'change'` rows are one per CAB approver. Status `Pending / Approved / Rejected / Cancelled`, approver, decider, comment, time. |
| Assets | `asset_types`, `assets`, `asset_dependencies` | Tag, serial number, owner / user / manager / support team, department, location, purchase and warranty dates, dependencies (recursive CTE finds everything affected). |
| Knowledge | `knowledge_categories`, `knowledge_articles`, `knowledge_article_tags`, `knowledge_article_votes`, `knowledge_article_views` | Draft / Published / Archived; one vote per user; one counted view per user per day. FULLTEXT index on title and body. |
| Files | `attachments` (+ view `ticket_attachments`) | Metadata only: original name, random stored name, MIME type, size, SHA-256, uploader, parent record, optional comment. The bytes live in `UPLOAD_DIR`. |
| Notifications | `notifications` | Per user, with a `dedupe_key` so background jobs never notify twice. |
| Audit | `audit_logs` | User, action, entity, old/new values, IP address, user agent, request id, time. Triggers reject UPDATE and DELETE, so the log is append-only. |
| Reports | `report_schedules` | Scheduled report definitions. |

## Design decisions

- **Normalised relations, foreign keys everywhere.** Every reference is a foreign key with an explicit `ON DELETE` rule. Business records are soft-deleted (`deleted_at`) where users can delete them (tickets, assets, articles, attachments), so history and audit links stay valid.
- **JSON only where a block is read and written as a unit:** `settings.value` (organisation, business hours, integrations...), `catalog_fields.options` (the choices of one select field) and `audit_logs.old_values/new_values` (a snapshot). Each has a `JSON_VALID` check. Everything that is queried or joined has its own columns and tables.
- **Timestamps are UTC** (`DATETIME(3)`); the connection sets `time_zone = '+00:00'`. Reports convert to the organisation time zone with `CONVERT_TZ` using a numeric offset, so no time-zone tables are needed.
- **Workflow states** (ticket, task, problem and change states) are enforced by CHECK constraints and by the service layer, because the business rules depend on them. Pure pick lists are rows in `lookup_values` and can be changed without code.
- **SLA columns:** `sla_response_due_at` and `sla_resolution_due_at` are set at creation (and recalculated when an incident's priority changes). Time spent On Hold with the reason *Waiting for requester* is accumulated in `paused_seconds`; `paused_at` is set while the clock is stopped. Breached / at-risk filters are SQL expressions over these columns, so they work with pagination.

## Record numbers

`sequences (prefix, seq_year, last_value)` issues every business number. The creating transaction runs

```sql
INSERT INTO sequences (prefix, seq_year, last_value) VALUES (?, ?, LAST_INSERT_ID(1))
ON DUPLICATE KEY UPDATE last_value = LAST_INSERT_ID(last_value + 1);
SELECT LAST_INSERT_ID();
```

The upsert locks the sequence row until the transaction ends, so concurrent requests queue and each gets a unique value; if the transaction rolls back, the number is released with it. Unique keys on every `*_number` column are a second safety net. Yearly prefixes (INC, REQ, TSK, PRB, CHG, KB) restart each year; AST and MI use `seq_year = 0`.

## Transactions

Multi-step operations run in one transaction (`withTransaction` in `backend/src/config/database.js`) and are rolled back completely on any error, including the audit entry. Examples: create ticket + activities + approval or catalog tasks + audit; submit request + request row + every order item + form values; approve a request + status + assignment + tasks; change transitions and CAB decisions; resolve a problem + its linked incidents; asset CSV import; attachment metadata (files already written are removed if the transaction fails). Records being changed are locked with `SELECT ... FOR UPDATE`.

## Indexes

Chosen for the queries the application runs, for example: `tickets` on `ticket_number` (unique), `status`, `priority`, `assigned_to`, `created_at`, `category_id`, `team_id`, `customer_id`, `requester_id`, `(kind, status)`, `resolved_at`, `updated_at`, `problem_id`, `asset_id`; `ticket_comments (ticket_id, created_at)`; `tasks (assigned_to, state)` and per parent; `approvals (approver_id, status)`; `notifications (user_id, is_read, created_at)`; `audit_logs (user_id)`, `(created_at)`, `(entity_type, entity_id)`; FULLTEXT on `tickets.title` and on article title and body.

## From the original browser data model

| Original (`localStorage`) | Now |
|---|---|
| `db.tickets[]` with nested `activity[]`, `sla`, `approval`, `tags`, `form`, `attachments` | `tickets` + `ticket_comments` + `ticket_activities` + `ticket_history` + `approvals` + `ticket_tags` + `request_item_values` + `attachments` |
| `db.requests[]` | `requests` + `request_items` |
| `db.tasks[]` (`parent` string) | `tasks` with `ticket_id` / `problem_id` / `change_id` foreign keys |
| `db.problems[]`, `db.changes[]` (with `approvals[]`, `assets[]`) | `problems`, `changes`, `change_assets`, `approvals`, activity tables |
| `db.assets[]` (`dependsOn[]`) | `assets`, `asset_types`, `asset_dependencies` |
| `db.kb[]` | `knowledge_articles` + tags / votes / views |
| `db.agents[]`, `db.teams[]` (`onCall[]`), `db.customers[]`, `db.people[]` | `users` + `agents` + `team_members`, `teams`, `customers`, `people` |
| `db.settings` (SLA, rules, routing, canned, notify, integrations, schedules) | `priorities`, `automation_rules`, `ticket_categories.default_team_id`, `canned_responses`, `settings`, `report_schedules` |
| `db.audit[]` (capped at 400) | `audit_logs` (append-only, unlimited) |
| `db.majors[]` | `major_incidents` + `major_incident_updates` |
| `db.seq` | `sequences` |
| `CATALOG`, `CAT_TASKS`, `CATS`, `CHANNELS`, `HOLD_REASONS`, ... constants | `catalog_*`, `ticket_categories`, `lookup_values` |
| IndexedDB file blobs | files in `UPLOAD_DIR` + `attachments` metadata |

## Backups

See [DEPLOYMENT.md](DEPLOYMENT.md#database-backup). Back up the database and the upload directory together; attachment rows refer to files by their stored name.
