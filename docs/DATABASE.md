# Database

The application uses MongoDB (tested with MongoDB 8.2 locally; MongoDB Atlas in the cloud). The database name is `MONGODB_DB` (default `Ticketing_tools`) on the server given by `MONGODB_URI` (default `mongodb://localhost:27017`).

The schema is defined in one file, `backend/src/config/collections.js`: every collection with its fields and defaults, unique keys and indexes. `npm run db:migrate` creates whatever is missing from it.

## Commands

```bash
npm run db:migrate        # create missing collections and indexes (idempotent)
npm run db:status         # list collections that exist / are missing
npm run db:seed           # reference data: roles, permissions, priorities, lookups, teams, categories, catalog, first admin
npm run db:seed:demo      # optional sample workspace (refuses to run with NODE_ENV=production)
npm run db:import-mysql   # one-time copy of the former MySQL database (see below)
```

Seeds are idempotent: unique keys make them skip records that already exist, so running them again only adds what is missing.

## How the relational model maps to MongoDB

The application was first built on MySQL. To keep the services, API responses and the React app unchanged, each former table is a collection with the **same field names** and the same values:

- **Numeric ids.** Every document has a numeric `id` (MongoDB's own `_id` is never exposed). New ids come from the `counters` collection with an atomic `$inc`, so they are unique under concurrency. References between records (`customer_id`, `assigned_to`, `ticket_id`...) are these numeric ids.
- **Defaults.** MongoDB has no column defaults, so `insertOne` in `backend/src/config/database.js` applies the defaults listed in `collections.js` (for example `status: 'New'`, `created_at: now`). Collections marked `touch` get `updated_at` refreshed on every update, which the former `ON UPDATE CURRENT_TIMESTAMP` did.
- **Case-insensitive text.** Every collection is created with the collation `{ locale: 'en', strength: 2 }`, so equality, sorting and unique keys ignore case, as the MySQL `utf8mb4_unicode_ci` collation did (`Admin@x.com` and `admin@x.com` are the same email). Searches use case-insensitive regular expressions.
- **Flags** stay `0` / `1` numbers and timestamps are UTC `Date` values. Date text given by the services (for example `2026-10-01` or `2026-10-01 09:00:00`) is stored as a UTC date.
- **Joins.** Repositories load related records in batches (`attach` / `mapBy` in `database.js`) and return the same row shape the SQL joins returned, such as `assignee_name` or `customer_name`.
- **Foreign key rules.** MongoDB does not enforce references. The services validate references before writing, as before, and the few hard deletes apply the former `ON DELETE` rules in code (deleting a team removes its memberships and clears it from tickets, tasks, assets and categories).

## Collections

| Area | Collections | Notes |
|---|---|---|
| Access control | `roles`, `permissions`, `role_permissions`, `users` | Granular permissions such as `ticket:create`; bcrypt password hashes; lockout and reset-token fields; `token_version` invalidates sessions. |
| Organisation | `teams`, `team_members`, `agents`, `customers`, `people` | An agent is a user with an `agents` profile and one or more team memberships (`is_on_call` per team). `people` are requesters of a customer, optionally linked to a portal login (`user_id`). |
| Configuration | `priorities`, `ticket_categories`, `lookup_values`, `automation_rules`, `canned_responses`, `settings`, `sequences`, `counters` | SLA targets per priority, routing per category (`default_team_id`), pick lists, rules r1-r5, key/value settings (JSON text), record-number sequences and id counters. |
| Tickets | `tickets`, `ticket_tags`, `ticket_comments`, `ticket_activities`, `ticket_history`, `major_incidents`, `major_incident_updates` | Incidents and request order items. Comments are replies (`comment`) or agent-only work notes (`note`); activities are system timeline lines; history is field-level old/new values. |
| Requests and catalog | `catalog_items`, `catalog_fields`, `catalog_tasks`, `requests`, `request_items`, `request_item_values` | A request (`REQ-...`) has one or more order items; each item is a `tickets` document of kind `request` linked through `request_items`, with the form answers in `request_item_values`. |
| Tasks | `tasks`, `task_comments`, `task_activities` | Parent is a ticket, problem or change (`ticket_id` / `problem_id` / `change_id`, at most one set). Sequential tasks open in order. |
| Problems | `problems`, `problem_activities` | Root cause, workaround, known error, resolution. |
| Changes | `changes`, `change_assets`, `change_activities` | Plans, risk answers and score, schedule, close code. |
| Approvals | `approvals` | `approval_type = 'request'` documents belong to a ticket (line manager); `'change'` documents are one per CAB approver. |
| Assets | `asset_types`, `assets`, `asset_dependencies` | Tag, serial number, owner / user / manager / support team, dates, dependencies (the "affected" list follows them up to 10 levels). |
| Knowledge | `knowledge_categories`, `knowledge_articles`, `knowledge_article_tags`, `knowledge_article_votes`, `knowledge_article_views` | Draft / Published / Archived; one vote per user; one counted view per user per day. |
| Files | `attachments` | Metadata only: original name, random stored name, MIME type, size, SHA-256, uploader, parent record. The bytes live in `UPLOAD_DIR`. |
| Notifications | `notifications` | Per user, with a `dedupe_key` (unique per user when set) so background jobs never notify twice. |
| Audit | `audit_logs` | User, action, entity, old/new values, IP address, user agent, request id, time. Append-only, see below. |
| Reports | `report_schedules` | Scheduled report definitions. |

## SLA figures

`sla_response_due_at` and `sla_resolution_due_at` are set at creation. Time spent On Hold with *Waiting for requester* accumulates in `paused_seconds`; `paused_at` is set while the clock is stopped. "Breached", "at risk", "time left" and "SLA met" are defined once in `backend/src/utils/sla.js` and used by the ticket lists, quick-view counts, dashboard, notifications and reports, so every screen counts the same way. Simple filters and sorts run in MongoDB with indexes; the SLA-based views are evaluated in code on the matching open tickets.

## Record numbers

`sequences (prefix, seq_year, last_value)` issues every business number (INC, REQ, TSK, PRB, CHG, KB restart each year; AST and MI use `seq_year = 0`). Each number is one atomic `findOneAndUpdate` with `$inc`, so concurrent requests each get a unique value. Unique indexes on every `*_number` field are a second safety net.

## Transactions

Multi-step operations run through `withTransaction` in `backend/src/config/database.js`:

- On a **replica set or MongoDB Atlas** they are real multi-document transactions: everything, including the audit entry and the record number, is committed together or rolled back on any error. Concurrent changes to the same record are detected by MongoDB and retried or rejected.
- On a **standalone server** (a default local install) MongoDB has no multi-document transactions; the steps run in order, each one atomic. Validation still happens before anything is written, but a failure in the middle of a multi-step operation is not rolled back. Use a replica set (Atlas, or `mongod --replSet`) for production.

The automated tests pass in both modes.

## Audit log

`audit_logs` is append-only in the application: its repository only inserts and reads. MySQL also rejected changes with triggers; MongoDB has no triggers, so in production give the API a database user whose role allows only `find` and `insert` on `audit_logs` (MongoDB Atlas: Database Access > Custom Roles).

## Moving the data from MySQL

`npm run db:import-mysql` copies every table of the former MySQL database into the collection of the same name, keeping the ids, and sets the id counters so new records continue after the imported ones. It reads `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` (or the old `DB_*` values in `backend/.env`) and writes to `MONGODB_URI` / `MONGODB_DB`. It stops if the MongoDB database already has data unless run with `--replace`. Run `npm run db:seed` afterwards to add any reference data the MySQL database lacked.

## Backups

See [DEPLOYMENT.md](DEPLOYMENT.md#database-backup). Back up the database and the upload directory together; attachment documents refer to files by their stored name.
