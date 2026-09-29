# Development, testing and deployment

Commands run from the repository root unless noted. The project is an npm workspace with two packages: `backend` (Express API) and `frontend` (React + Vite).

## Requirements

- Node.js 20 or newer (tested with Node 24)
- MySQL 8 or MariaDB 10.4+ (tested with MariaDB 10.4.32 from XAMPP)
- For production: a Linux server with Nginx (or another reverse proxy) and a TLS certificate

## Environment variables

| File | Used for |
|---|---|
| `backend/.env` | local development (copy from `backend/.env.example`) |
| `backend/.env.<NODE_ENV>` | loaded first when present, e.g. `.env.production` (template: `backend/.env.production.example`) |
| `frontend/.env` | local development (copy from `frontend/.env.example`) |
| `frontend/.env.production` | used by `npm run build`; contains only `VITE_API_URL=/api/v1` |

Real environment variables override both files. `.env` files are ignored by git; only the templates are committed.

Backend variables (all documented in `backend/.env.example`):

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development`, `test` or `production` |
| `PORT` | API port (default 5000) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | database connection (`DB_NAME=tickenting_tools`) |
| `DB_CONNECTION_LIMIT` | connection pool size |
| `JWT_SECRET` | at least 32 random characters; the API refuses to start without it |
| `JWT_EXPIRES_IN` | session length, e.g. `1d`, `8h` |
| `COOKIE_SECURE` | `true` behind HTTPS (required in production) |
| `FRONTEND_URL` | allowed browser origin(s) for CORS, comma separated |
| `BCRYPT_ROUNDS`, `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCK_MINUTES`, `PASSWORD_RESET_TTL_MINUTES` | authentication policy |
| `RATE_LIMIT_WINDOW_MINUTES`, `RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_MAX` | rate limits |
| `UPLOAD_DIR`, `MAX_FILE_SIZE_MB`, `MAX_FILES_PER_UPLOAD` | attachments |
| `LOG_LEVEL`, `LOG_DIR` | logging |
| `JOBS_ENABLED` | auto-close and SLA notification jobs (run them on one instance only) |
| `SERVE_FRONTEND` | `true` to serve `frontend/dist` from the API process |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_DEMO_PASSWORD` | first administrator and demo accounts; a random password is generated and printed once when empty |

Frontend: `VITE_API_URL`, the API base URL (`http://localhost:5000/api/v1` in development, `/api/v1` when served behind the same domain).

## Development

```bash
npm install                                   # installs backend and frontend
cp backend/.env.example backend/.env          # then set JWT_SECRET and DB_* values
cp frontend/.env.example frontend/.env
npm run db:migrate                            # create / update the schema in tickenting_tools
npm run db:seed                               # reference data + first admin
npm run db:seed:demo                          # optional: sample workspace for evaluation
npm run dev                                   # API on :5000 and web app on :5173
```

Open http://localhost:5173 and sign in with `SEED_ADMIN_EMAIL` and the seeded password. With the demo data, the agents (`aarav@...`, `priya@...`, `sofia@...` manager, `kenji@...`, `amira@...`, `daniel@...`, `isha@...`, `lucas@...`, all `@veltrixsecure.example`) and the customer portal user `ava.shah@kestrelbank.example` use `SEED_DEMO_PASSWORD`.

Run one side only with `npm run dev -w backend` or `npm run dev -w frontend`.

Password reset: no mail transport is configured. In development the reset link is printed to the API console. For production, connect an email service in `requestPasswordReset` (`backend/src/services/auth.service.js`); never log the token.

## Testing

```bash
npm test                      # backend and frontend
npm run test -w backend       # API integration tests
npm run test -w frontend      # React component tests
```

Backend tests are integration tests: they create `DB_NAME_TEST` (default `tickenting_tools_test`), apply every migration, load the seeds, run against the real database and drop it afterwards. The runner refuses to drop any database whose name does not end in `_test`. They cover sign-in, lockout, CSRF, role checks, customer isolation, ticket creation and numbering under concurrency, routing rules, the state machine and SLA pause, comments, attachments (blocked and spoofed files), request approvals and sequential tasks, problems, changes and CAB decisions, knowledge base votes, asset import, the dashboard and the append-only audit log.

Frontend tests (Vitest + Testing Library, services mocked) cover sign-in, protected routes, the ticket list (server-side search and quick views), ticket details, ticket creation, the markdown sanitiser, SLA labels and client validators.

## Production build

```bash
npm ci
npm run build                 # frontend/dist (code-split, minified)
npm run test                  # optional, needs a database
```

## Database migration in production

Use an administrative account for migrations and a restricted account for the running API.

```sql
CREATE DATABASE IF NOT EXISTS tickenting_tools CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'servicedesk_app'@'127.0.0.1' IDENTIFIED BY '<strong password>';
GRANT SELECT, INSERT, UPDATE, DELETE ON tickenting_tools.* TO 'servicedesk_app'@'127.0.0.1';
```

```bash
cd backend
NODE_ENV=production DB_USER=<admin user> DB_PASSWORD=<admin password> npm run db:migrate
NODE_ENV=production DB_USER=<admin user> DB_PASSWORD=<admin password> SEED_ADMIN_PASSWORD='<initial admin password>' npm run db:seed
```

Do not run `db:seed:demo` in production (it refuses when `NODE_ENV=production`). Take a backup before every migration.

## Backend deployment

1. Copy the repository to the server (for example `/opt/servicedesk`), run `npm ci --omit=dev -w backend`.
2. Create `backend/.env.production` from `backend/.env.production.example`: set `NODE_ENV=production`, the app database user, a new `JWT_SECRET`, `COOKIE_SECURE=true`, `FRONTEND_URL=https://your-host`, and absolute `UPLOAD_DIR` and `LOG_DIR` owned by the service user (the upload directory must not be inside any web root).
3. Run the API under a process manager. systemd example (`/etc/systemd/system/servicedesk-api.service`):

```ini
[Unit]
Description=Veltrixsecure Service Desk API
After=network.target mariadb.service

[Service]
WorkingDirectory=/opt/servicedesk/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/server.js
Restart=always
User=servicedesk
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now servicedesk-api
curl -s http://127.0.0.1:5000/api/v1/health     # {"success":true,...,"database":"up"}
```

With PM2 instead: `NODE_ENV=production pm2 start src/server.js --name servicedesk-api && pm2 save`. When running several API instances, set `JOBS_ENABLED=false` on all but one.

The API shuts down gracefully on `SIGTERM` (stops jobs, finishes open requests, closes the pool).

## Frontend deployment

`npm run build` produces static files in `frontend/dist`. Serve them from Nginx (below) with a fallback to `index.html` for client-side routes. Alternatively set `SERVE_FRONTEND=true` and the API serves `frontend/dist` itself on the same port.

### Frontend on Vercel

Set the Vercel project's Root Directory to the repository root (leave it empty) and leave the Build, Install and Output settings on their defaults: `vercel.json` runs `vercel-build.mjs`, which builds `frontend` into `dist` and adds a fallback to `index.html` for client-side routes. The script also works when the Root Directory is `backend` or `frontend`. In that case Vercel's `npm install` covers only that workspace, so the script first installs all workspaces from the repository root, as pinned by `package-lock.json`. The first rewrite in `vercel.json` forwards `/api/*` to the backend project (`https://ticketing-tool-backend-taupe.vercel.app`). The browser therefore talks to one origin, the session cookie stays first-party (`SameSite=Lax`) and no CORS is involved. If the backend URL changes, update that rewrite in both `vercel.json` and `frontend/vercel.json`.

To call the backend directly instead, set `VITE_API_BASE_URL` to the backend origin in the frontend project. The backend then needs `COOKIE_SAME_SITE=none`, which relies on third-party cookies: Safari and browsers that block them will not keep the session.

### Backend on Vercel

Create a second Vercel project from the same repository with Root Directory `backend`. `backend/vercel.json` routes every request to `backend/api/index.js`, which exports the Express app as a serverless function. The MySQL database must be reachable from the internet (a hosted MySQL such as Aiven, TiDB Cloud, Railway or PlanetScale). XAMPP on your own PC is not reachable from Vercel. Create the schema once from your machine against that database:

```bash
cd backend
DB_HOST=<host> DB_PORT=<port> DB_USER=<user> DB_PASSWORD=<password> DB_NAME=<name> DB_SSL=true npm run db:migrate
DB_HOST=... SEED_ADMIN_PASSWORD='<admin password>' npm run db:seed
```

To move existing local data instead, export it with `mysqldump` (see Database backup) and import it into the hosted database.

Environment variables (Settings > Environment Variables, Production):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | hosted MySQL connection (`MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` are accepted too) |
| `DB_SSL` | `true` when the provider requires TLS |
| `JWT_SECRET` | 48+ random bytes |
| `COOKIE_SECURE` | `true` |
| `FRONTEND_URL` | `https://ticketing-tool-frontend-nine.vercel.app` |
| `CRON_SECRET` | random string; Vercel Cron sends it to `/api/v1/internal/jobs` |

Do not set `UPLOAD_DIR`, `LOG_DIR` or `PORT` there. Limits of serverless hosting:

- Attachments are written to the function's temporary directory and are **not kept**. They disappear when the instance is recycled. For lasting attachments use object storage (Vercel Blob, S3) or host the API on a server.
- Vercel limits a request body to 4.5 MB, so larger uploads fail.
- Background jobs (auto-close, SLA notifications) run from `crons` in `backend/vercel.json`, once a day on the Hobby plan.
- Logs are in the Vercel dashboard (Deployments > Logs); no log files are written.
- Rate limits are counted per function instance.

## Reverse proxy and HTTPS

The browser app and the API should share one origin, so the session cookie stays first-party and CORS is not needed in production. Nginx example:

```nginx
server {
    listen 80;
    server_name servicedesk.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name servicedesk.example.com;

    ssl_certificate     /etc/letsencrypt/live/servicedesk.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/servicedesk.example.com/privkey.pem;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    client_max_body_size 60m;          # MAX_FILES_PER_UPLOAD x MAX_FILE_SIZE_MB plus overhead

    root /opt/servicedesk/frontend/dist;

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri /index.html;
        add_header Cache-Control "no-cache";
    }
}
```

Get a certificate with Let's Encrypt: `sudo certbot --nginx -d servicedesk.example.com`. In production the API trusts one proxy hop (`trust proxy = 1`) so client IP addresses in the audit log and rate limits are correct; keep exactly one proxy in front of it or adjust `backend/src/app.js`.

## Database backup

Back up the database and the upload directory together.

```bash
# nightly, keeps 14 days
mysqldump --single-transaction --routines --triggers --hex-blob \
  -u backup_user -p"$BACKUP_PASSWORD" tickenting_tools | gzip > /backups/servicedesk-$(date +%F).sql.gz
tar -czf /backups/servicedesk-uploads-$(date +%F).tar.gz -C /var/lib/servicedesk uploads
find /backups -name 'servicedesk-*' -mtime +14 -delete
```

Restore into an empty database:

```bash
gunzip -c servicedesk-2026-09-27.sql.gz | mysql -u root -p tickenting_tools
tar -xzf servicedesk-uploads-2026-09-27.tar.gz -C /var/lib/servicedesk
```

`--triggers` keeps the append-only protection on `audit_logs`. Test restores regularly.

## Logging

The API writes structured JSON logs (winston): to the console (JSON in production, readable in development), `LOG_DIR/app.log` and `LOG_DIR/error.log` (10-20 MB files, 5 kept). Logged: server start and stop, database connection, every API request with status, duration and request id, sign-ins, failed sign-ins and lockouts, business errors (warn), unexpected and database errors with stack (error), and background job results. Values of keys such as `password`, `token`, `secret`, `cookie` and `authorization` are replaced with `[redacted]`. Every error response carries the same `requestId` as the log line, so a user-reported error can be traced.

Under systemd, console output also goes to the journal (`journalctl -u servicedesk-api`). Ship the JSON log files to your log platform if you have one.

## Background jobs

When `JOBS_ENABLED=true` the API runs:

- every 10 minutes: close tickets that have been Resolved longer than the auto-close setting (rule r3);
- every 5 minutes: notify assignees about breached and at-risk tickets and overdue tasks (deduplicated).

## Security checklist

- [ ] `JWT_SECRET` is long, random and different per environment
- [ ] `COOKIE_SECURE=true`, site served only over HTTPS with HSTS
- [ ] `FRONTEND_URL` lists only your real origin(s)
- [ ] API runs as an unprivileged user with the least-privilege database account
- [ ] `UPLOAD_DIR` is outside the web root and backed up
- [ ] The seeded admin password was changed after the first sign-in
- [ ] Demo data was not loaded
- [ ] Backups run and a restore has been tested
