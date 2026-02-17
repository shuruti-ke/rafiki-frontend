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

## Endpoints

| Method | Path      | Description                          |
| ------ | --------- | ------------------------------------ |
| GET    | `/health` | Returns `{"ok": true}`               |
| POST   | `/chat`   | Accepts `{message}`, returns `{reply}` |
