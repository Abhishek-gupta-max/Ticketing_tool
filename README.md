# Veltrixsecure Service Desk

A full-stack IT service desk: incidents, service requests with a catalog and approvals, tasks, problems, changes with a CAB, assets, a knowledge base, reports and an audit trail. It is the production version of the original single-file application (kept for reference in `legacy/veltrixsecure-servicedesk.html`), rebuilt as a React frontend on a Node.js / Express API backed by MySQL. The user interface, wording and workflows are preserved; all data now lives in the database instead of the browser.

```
React (Vite)  ->  REST API /api/v1  ->  Express routes  ->  controllers  ->  services  ->  repositories  ->  MySQL
```

## Quick start

Requirements: Node.js 20+, MySQL 8 or MariaDB 10.4+ with a database named `tickenting_tools` (created automatically if the user may create databases).

```bash
npm install
cp backend/.env.example backend/.env        # set JWT_SECRET (32+ chars) and DB_* values
cp frontend/.env.example frontend/.env
npm run db:migrate                          # create the schema
npm run db:seed                             # reference data and the first admin account
npm run db:seed:demo                        # optional sample data (never in production)
npm run dev                                 # API http://localhost:5000, app http://localhost:5173
```

Sign in with `SEED_ADMIN_EMAIL` (default `admin@veltrixsecure.example`) and `SEED_ADMIN_PASSWORD`. If that variable is empty, the seed generates a password and prints it once.

Generate a JWT secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (auto-restart) and Vite dev server together |
| `npm run build` | production build of the frontend into `frontend/dist` |
| `npm run start` | start the API (use `NODE_ENV=production` in production) |
| `npm test` | backend integration tests (real test database) and frontend tests |
| `npm run db:migrate` / `db:status` | apply / list migrations |
| `npm run db:seed` / `db:seed:demo` | reference data / sample workspace |
| `npm run db:schema` | regenerate `database/schema.sql` from the migrations |

## Project structure

```
ticketing-tools/
├── backend/                 Express API (ES modules)
│   ├── src/
│   │   ├── config/          env validation, MySQL pool and transactions, logger
│   │   ├── routes/          one file per module (ticket.routes.js, change.routes.js, ...)
│   │   ├── controllers/     thin HTTP handlers
│   │   ├── services/        business rules and workflows
│   │   ├── repositories/    SQL, parameterised queries only
│   │   ├── models/          row -> API shape mappers
│   │   ├── validators/      zod request schemas
│   │   ├── middleware/      auth, permissions, CSRF, validation, uploads, rate limits, errors
│   │   ├── constants/       permissions, roles, workflow states
│   │   ├── jobs/            auto-close and SLA notifications
│   │   ├── utils/           SLA engine, CSV, file storage, migrator, seeder
│   │   └── uploads/         attachment storage (not publicly served)
│   ├── scripts/             migrate, seed, build-schema
│   └── tests/               API integration tests
├── frontend/                React 19 + Vite
│   └── src/
│       ├── components/      common, layout, forms, tables, modals, charts, tickets
│       ├── pages/           Auth, Dashboard, Tickets, Incidents, Requests, Catalog, Tasks,
│       │                    Problems, Changes, Approvals, Assets, KnowledgeBase, Reports, Settings
│       ├── services/        API client and one service per module
│       ├── context/         auth, theme, toasts, dialogs
│       ├── hooks/ store/ routes/ utils/ constants/ validators/ test/
│       └── assets/styles/   legacy.css (the original stylesheet, unchanged) + app.css
├── database/
│   ├── migrations/          001 ... 019 numbered SQL migrations
│   ├── seeds/               reference data (+ demo/ sample workspace)
│   └── schema.sql           generated full schema
├── docs/                    API.md, DATABASE.md, DEPLOYMENT.md
└── legacy/                  the original HTML application
```

## Features

Everything in the original application is available, backed by the database:

| Area | Highlights |
|---|---|
| Overview | greeting, major incident banner, KPIs, my queue, team queue with Take, my tasks, approvals waiting, 30-day SLA strip, upcoming changes, recent activity; plus desk totals, open tickets by priority and category, agent workload |
| Tickets | list and board (drag to change state), quick views with counts, server-side search, filters (type, priority, team, assignee, customer, category, dates), sorting, pagination, bulk assign / state, CSV export |
| Ticket detail | stage tracker, replies and internal notes with attachments (drag, drop, paste), canned responses, activity filter, state machine with hold reasons and SLA pause, resolve with code and optional KB draft, reopen, close, CSAT, impact x urgency priority, team and assignee rules, tasks, related asset / problem / change / parent / linked tickets, tags, suggested articles, declare major incident, create problem or change |
| Incidents | KPIs, incident room with update timeline, priority matrix, on-call list, past major incidents |
| Service requests | catalog with search, categories and cart; checkout with dynamic forms; requests and order items; line manager approval; sequential fulfilment tasks |
| Tasks | all task types, quick views, filters, sequential steps, close notes, work notes, attachments |
| Problems | workflow Logged -> Closed with rules, root cause, workaround, known errors, suggested problems from repeat incidents, linked incidents (resolve them all when fixed), tasks, notes |
| Changes | list and calendar, risk assessment, standard / normal / emergency flows, CAB approvals (one rejection returns to risk review), schedule conflicts, implementation tasks, close codes |
| Approvals | my queue (with admin override), everyone's pending, 30-day history |
| Assets | inventory with owners, support groups, warranty, dependencies and impact analysis, CSV import / export |
| Knowledge base | draft / published / archived, audience, tags, search, votes, views, related articles |
| Reports | 7/30/90 days, KPIs with deltas, SLA strip, volume, backlog age, categories, agents, customers, process reports, CSV / JSON export, scheduled reports |
| Settings | organisation and hours, SLA targets, agents and roles, teams and on-call, customers and requesters, automation rules and routing, canned responses, CAB approvers, service catalog editor, notifications, integrations (with simulated email / SIEM tickets), audit log, data export |

Changes compared with the original, by design:

- Real sign-in replaces the "Act as" demo switcher; the account menu offers change password and sign out.
- A customer portal role: customers see only their own tickets and requests, public articles and the catalog, and never internal notes.
- "Reset demo data" and "Import JSON" were removed from Settings > Data; sample data is loaded with `npm run db:seed:demo` on non-production databases, and full exports remain available.
- The webhook API key is stored as a hash and shown once when generated.

## Security

- bcrypt password hashes, account lockout, rate-limited sign-in and password reset, reset tokens stored hashed with expiry
- JWT in an HTTP-only, SameSite cookie; sessions are revalidated against the database on every request
- Role-based access control with 50+ granular permissions, enforced on the server for every endpoint; data scoping for customers
- CSRF protection (custom header + strict CORS), Helmet security headers and CSP, body size limits
- zod validation of every request; parameterised SQL only; whitelisted sort columns
- File uploads: extension allow and block lists, magic-byte content checks, size limits, random file names outside the web root, authorised downloads, `nosniff` and sandboxed previews
- Errors never expose SQL, stack traces or configuration; logs redact secrets
- Append-only audit log (enforced by database triggers) with user, IP address and user agent

## Documentation

- [docs/API.md](docs/API.md): conventions and every endpoint with its permission
- [docs/DATABASE.md](docs/DATABASE.md): schema, design decisions, transactions, numbering, mapping from the original data model
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): development, testing, production build, migrations, environment variables, backend and frontend deployment, Nginx and HTTPS, backups, logging
