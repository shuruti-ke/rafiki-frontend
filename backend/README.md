# Rafiki Backend

FastAPI server with a `/health` and `/chat` endpoint.

## Setup (Windows PowerShell)

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run

```powershell
uvicorn main:app --reload --port 8000
```

Server runs at **http://localhost:8000**. API docs at **http://localhost:8000/docs**.

## Tests

```powershell
pip install -r requirements-dev.txt
$env:PYTHONPATH="."
$env:APP_ENV="test"
$env:AUTH_MODE="jwt"
$env:JWT_SECRET="test-jwt-secret"
pytest tests -q
```

## Secure Bootstrap Admin

Create the first super admin manually instead of relying on seeded credentials:

```powershell
python -m app.bootstrap_admin --email owner@example.com --password "Use-A-Strong-Password" --name "Platform Owner" --org-name "Your Company" --org-code "your-company"
```

## Health Checks

- `/health` for simple uptime probes
- `/health/ready` for readiness checks including database connectivity
