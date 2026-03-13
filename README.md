# Rafiki

Local-first chat app with a FastAPI backend and React frontend.

## Quick Start (Windows PowerShell)

### 1. Backend (Terminal 1)

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Frontend (Terminal 2)

```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** and start chatting.

## Backend Tests

```powershell
cd backend
pip install -r requirements.txt
pip install -r requirements-dev.txt
$env:PYTHONPATH="."
$env:APP_ENV="test"
$env:AUTH_MODE="jwt"
$env:JWT_SECRET="test-jwt-secret"
pytest tests -q
```

## Production Bootstrap

Production deploys no longer create a default super admin automatically.

Create the first platform admin manually:

```powershell
cd backend
python -m app.bootstrap_admin --email owner@example.com --password "Use-A-Strong-Password" --name "Platform Owner" --org-name "Your Company" --org-code "your-company"
```

See `docs/PRODUCTION_READINESS.md` for monitoring, backups, audit controls, and launch checklists.

## Endpoints

| Method | Path      | Description                          |
| ------ | --------- | ------------------------------------ |
| GET    | `/health` | Returns `{"ok": true}`               |
| POST   | `/chat`   | Accepts `{message}`, returns `{reply}` |
