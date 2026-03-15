# Production Readiness Runbook

This repo now supports a safer commercial deployment posture, but production readiness still depends on operational discipline around secrets, backups, monitoring, and release controls.

## 1. Required Environment Variables

Backend:
- `APP_ENV=production`
- `JWT_SECRET` or `SECRET_KEY`
- `DATABASE_URL`
- `CORS_ORIGINS`
- `OPENAI_API_KEY`
- `TAVILY_API_KEY`

Security rules:
- Never deploy production without `JWT_SECRET`.
- Rotate JWT secrets through your secrets manager, not in source control.
- Do not store bootstrap credentials in `render.yaml` or checked-in `.env` files.

## 2. Secure Bootstrap Flow

Normal deploys no longer create default admin credentials.

Create the first platform admin manually:

```powershell
cd backend
python -m app.bootstrap_admin --email owner@example.com --password "Use-A-Strong-Password" --name "Platform Owner" --org-name "Your Company" --org-code "your-company"
```

You can also use environment variables:

```powershell
$env:BOOTSTRAP_SUPER_ADMIN_EMAIL="owner@example.com"
$env:BOOTSTRAP_SUPER_ADMIN_PASSWORD="Use-A-Strong-Password"
$env:BOOTSTRAP_SUPER_ADMIN_NAME="Platform Owner"
$env:BOOTSTRAP_SUPER_ADMIN_ORG_NAME="Your Company"
$env:BOOTSTRAP_SUPER_ADMIN_ORG_CODE="your-company"
python -m app.bootstrap_admin
```

After first login:
- Rotate the bootstrap password immediately.
- Enroll the bootstrap admin in your internal admin access review process.
- Store the org code and admin email in your secure operations vault.

## 3. Monitoring and Alerting

### Sentry (optional)

Set `SENTRY_DSN` in Render environment to enable error monitoring and performance tracing. Create a project at [sentry.io](https://sentry.io) and add the DSN as a secret.

### Health endpoints

Use the following endpoints:
- `/health` for basic uptime probes
- `/health/ready` for readiness probes that confirm database connectivity

Recommended alerts:
- Backend `5xx` rate above baseline
- Readiness endpoint returning `503`
- Elevated login failures
- Payroll/billing job failures
- Abnormal latency on report, payroll, and file-processing endpoints

Recommended tooling:
- Error monitoring: Sentry (configure via `SENTRY_DSN`) or equivalent
- Uptime: Render health checks plus external uptime monitoring
- Log aggregation: Datadog, Grafana Cloud, Logtail, or equivalent

## 4. Backups and Disaster Recovery

See [BACKUP_RESTORE.md](BACKUP_RESTORE.md) for scripts and procedures.

Commercial production should not run on a free database tier. **Move the DB off free once clients start paying.**

Minimum expectations:
- Daily automated database backups
- Point-in-time recovery where supported
- Monthly restore test into a staging environment
- Written RPO/RTO targets

Suggested operational policy:
- Keep at least 7 daily backups
- Keep 4 weekly backups
- Document restore ownership and escalation path

## 5. Audit and Security Controls

Before commercial launch:
- Review all admin-only routes for role enforcement
- Verify org isolation across billing, payroll, employee, and reports endpoints
- Confirm secrets are only injected through platform secret storage
- Review seed/bootstrap scripts for any credential leakage
- Confirm dependency updates are reviewed regularly

Recommended follow-up work:
- Add structured audit logs for critical actions:
  - login success/failure
  - super-admin org changes
  - billing invoice/payment actions
  - payroll distribution actions
  - workflow completion/finalization actions
- Add rate limiting on auth endpoints
- Add request IDs / correlation IDs in API responses and logs

## 6. Performance Hardening

Known current improvement areas:
- Large frontend bundle should be split further with route-level code splitting
- Heavier reporting and payroll endpoints should be profiled with production-sized data
- Background processing should be considered for expensive file parsing/report generation

### Smoke test

After deploy, run:

```bash
python scripts/smoke_test.py https://rafiki-backend.onrender.com
```

Or against a custom URL: `python scripts/smoke_test.py <BASE_URL>`

Release gate before commercial launch:
- CI green
- Frontend build green
- Backend tests green
- Migrations tested in staging
- Readiness endpoint healthy after deploy
- Backup/restore verified
