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
