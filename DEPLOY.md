# Deploy — Rafiki

## Repository mapping

| Deployment | Repository | Remote name |
|------------|------------|-------------|
| **Vercel** (frontend) | https://github.com/shuruti-ke/rafiki-frontend | `vercel` |
| **Render** (backend)  | https://github.com/shuruti-ke/rafiki-at-work  | `origin` |

This workspace (`rafiki-local`) is a monorepo. The same repo is pushed to two GitHub repos; each triggers its own deployment.

- **Vercel** deploys from `rafiki-frontend` (frontend only — ensure Vercel is set to build from `frontend` or root with build command for frontend).
- **Render** deploys from `rafiki-at-work` (backend; ensure Render service uses `backend` as root or runs from repo root with correct start command).

## Push and deploy

From repo root:

```powershell
# Push to both remotes (triggers Vercel + Render)
.\scripts\push-deploy.ps1
```

Or manually:

```powershell
git push origin master
git push vercel master
```

- Pushing to **origin** → Render picks up changes from `rafiki-at-work` and redeploys the backend.
- Pushing to **vercel** → Vercel picks up changes from `rafiki-frontend` and redeploys the frontend.

Use the same branch name on both remotes (e.g. `master` or `main`) so both deployments stay in sync.
