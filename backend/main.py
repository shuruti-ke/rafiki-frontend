from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from PIL import Image
from openai import OpenAI
import httpx
import json
import traceback
import os, base64
import logging
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

load_dotenv(dotenv_path=Path(__file__).parent / ".env", override=True)

app = FastAPI(title="Rafiki API")

# --- Register HR Portal routers ---
from app.routers.knowledge_base import router as kb_router
from app.routers.announcements import router as ann_router
from app.routers.employee_docs import router as emp_router
from app.routers.chat import router as chat_router
from app.routers.guided_paths import router as gp_router
from app.routers.org_profile import router as org_router
from app.routers.manager import router as mgr_router
from app.routers.auth import router as auth_router

from app.routers.auth import (
    router as auth_router,
    v1_router as auth_v1_router,
    super_admin_router,
    super_admin_v1_router,
)

app.include_router(auth_router)
app.include_router(auth_v1_router)
app.include_router(super_admin_router)
app.include_router(super_admin_v1_router)

app.include_router(kb_router)
app.include_router(ann_router)
app.include_router(emp_router)
app.include_router(chat_router)
app.include_router(gp_router)
app.include_router(org_router)
app.include_router(mgr_router)
app.include_router(auth_router)

# --- Create uploads directory & mount static files ---
STATIC_UPLOADS = Path(__file__).parent / "static" / "uploads"
STATIC_UPLOADS.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=Path(__file__).parent / "static"), name="static")

BASE_UPLOAD_DIR = Path(__file__).parent / "uploads"
TEXT_DIR = BASE_UPLOAD_DIR / "text"
IMG_DIR = BASE_UPLOAD_DIR / "images"
PROJECT_MANIFEST = BASE_UPLOAD_DIR / "project_files.json"
MAX_PROJECT_FILES = 25

def _read_project_manifest():
    if not PROJECT_MANIFEST.exists():
        return []
    try:
        data = json.loads(PROJECT_MANIFEST.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return [Path(x).name for x in data]
    except Exception:
        pass
    return []

def _write_project_manifest(files):
    files = [Path(x).name for x in files]
    PROJECT_MANIFEST.write_text(json.dumps(files, indent=2), encoding="utf-8")

TEXT_DIR.mkdir(parents=True, exist_ok=True)
IMG_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_TEXT_EXTS = {".txt", ".md", ".py", ".js", ".ts", ".json", ".csv", ".html", ".css", ".yml", ".yaml"}
ALLOWED_IMG_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
MAX_TEXT_BYTES = 500_000
MAX_IMG_BYTES = 8_000_000

BONSAI_API_KEY = os.getenv("BONSAI_API_KEY", "").strip()
BONSAI_BASE_URL = os.getenv("BONSAI_BASE_URL", "https://go.trybons.ai").strip().rstrip("/")
BONSAI_DEFAULT_MODEL = os.getenv("BONSAI_DEFAULT_MODEL", "anthropic/claude-sonnet-4.5").strip()


OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
OPENAI_MODEL_VISION = os.getenv("OPENAI_MODEL_VISION", "gpt-4o-mini")

vision_client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)


CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS_ORIGINS],
    allow_methods=["*"],
    allow_headers=["*"],
)
SUPPORTED_MODELS = [
    "claude-sonnet-4-5-20250929",
    "claude-opus-4-20250514",
    "anthropic/claude-sonnet-4.5",
    "anthropic/claude-opus-4",
]

@app.get("/models")
def models():
    return {"models": ["stealth", *SUPPORTED_MODELS], "default": "stealth"}

@app.get("/files")
def list_files():
    def info(p: Path):
        return {"name": p.name, "size": p.stat().st_size}

    text_files = [info(p) for p in TEXT_DIR.glob("*") if p.is_file()]
    img_files = [info(p) for p in IMG_DIR.glob("*") if p.is_file()]

    return {
        "text": sorted(text_files, key=lambda x: x["name"].lower()),
        "images": sorted(img_files, key=lambda x: x["name"].lower()),
    }


@app.post("/upload_text")
async def upload_text(file: UploadFile = File(...)):
    safe_name = Path(file.filename).name
    ext = Path(safe_name).suffix.lower()
    if ext not in ALLOWED_TEXT_EXTS:
        raise HTTPException(status_code=400, detail="Text/code file type not allowed")

    content = await file.read()
    if len(content) > MAX_TEXT_BYTES:
        raise HTTPException(status_code=413, detail="Text file too large")

    (TEXT_DIR / safe_name).write_bytes(content)
    return {"ok": True, "filename": safe_name, "bytes": len(content)}


@app.get("/file")
def get_text_file(name: str):
    safe_name = Path(name).name
    path = TEXT_DIR / safe_name

    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    if path.suffix.lower() not in ALLOWED_TEXT_EXTS:
        raise HTTPException(status_code=400, detail="File type not allowed")

    text = path.read_text(encoding="utf-8", errors="replace")
    return {"ok": True, "name": safe_name, "content": text[:200000]}


@app.post("/upload_image")
async def upload_image(file: UploadFile = File(...)):
    safe_name = Path(file.filename).name
    ext = Path(safe_name).suffix.lower()
    if ext not in ALLOWED_IMG_EXTS:
        raise HTTPException(status_code=400, detail="Image type not allowed")

    content = await file.read()
    if len(content) > MAX_IMG_BYTES:
        raise HTTPException(status_code=413, detail="Image too large")

    dest = IMG_DIR / safe_name
    dest.write_bytes(content)

    try:
        Image.open(dest).verify()
    except Exception:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Invalid image")

    return {"ok": True, "filename": safe_name, "bytes": len(content)}


MAX_DESCRIBE_PROMPT_LEN = 2000

@app.post("/image/describe")
def describe_image(name: str, prompt: str = "Describe this image briefly and extract any visible text."):
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="Vision not configured. Set OPENAI_API_KEY.")

    if len(prompt) > MAX_DESCRIBE_PROMPT_LEN:
        raise HTTPException(status_code=400, detail=f"Prompt too long (max {MAX_DESCRIBE_PROMPT_LEN} chars)")

    safe_name = Path(name).name
    path = IMG_DIR / safe_name
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Image not found")

    ext = path.suffix.lower()
    mime = "image/png" if ext == ".png" else "image/jpeg" if ext in [".jpg", ".jpeg"] else "image/webp"
    b64 = base64.b64encode(path.read_bytes()).decode("utf-8")

    resp = vision_client.responses.create(
        model=OPENAI_MODEL_VISION,
        input=[{
            "role": "user",
            "content": [
                {"type": "input_text", "text": prompt},
                {"type": "input_image", "image_url": f"data:{mime};base64,{b64}"},
            ],
        }],
    )
    return {"ok": True, "name": safe_name, "description": resp.output_text}

@app.get("/project_files")
def get_project_files():
    files = _read_project_manifest()
    # keep only files that still exist
    files = [f for f in files if (TEXT_DIR / f).exists()]
    _write_project_manifest(files)
    return {"files": files}

@app.post("/project_files")
def set_project_files(payload: dict):
    files = payload.get("files", [])
    if not isinstance(files, list):
        raise HTTPException(status_code=400, detail="files must be a list")

    clean = []
    for f in files:
        name = Path(str(f)).name
        p = TEXT_DIR / name
        if p.exists() and p.is_file() and p.suffix.lower() in ALLOWED_TEXT_EXTS:
            clean.append(name)

    clean = list(dict.fromkeys(clean))[:MAX_PROJECT_FILES]  # unique + cap
    _write_project_manifest(clean)
    return {"ok": True, "files": clean}

@app.delete("/delete")
def delete_file(kind: str, name: str):
    safe = Path(name).name

    if kind == "text":
        path = TEXT_DIR / safe
    elif kind == "image":
        path = IMG_DIR / safe
    else:
        raise HTTPException(status_code=400, detail="kind must be 'text' or 'image'")

    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    path.unlink(missing_ok=True)

    # also remove from project files if needed
    pf = _read_project_manifest()
    if safe in pf:
        pf = [x for x in pf if x != safe]
        _write_project_manifest(pf)

    return {"ok": True, "deleted": safe, "kind": kind}







@app.get("/debug_bonsai")
def debug_bonsai():
    base = BONSAI_BASE_URL.rstrip("/")
    results = []

    attempts = [
        {
            "label": "1: no model field at all",
            "url": base + "/v1/messages",
            "headers": {"Content-Type": "application/json", "Authorization": f"Bearer {BONSAI_API_KEY}", "anthropic-version": "2023-06-01"},
            "payload": {"max_tokens": 64, "messages": [{"role": "user", "content": "Say hi"}]},
        },
        {
            "label": "2: model=claude-3-5-sonnet-20241022",
            "url": base + "/v1/messages",
            "headers": {"Content-Type": "application/json", "Authorization": f"Bearer {BONSAI_API_KEY}", "anthropic-version": "2023-06-01"},
            "payload": {"model": "claude-3-5-sonnet-20241022", "max_tokens": 64, "messages": [{"role": "user", "content": "Say hi"}]},
        },
        {
            "label": "3: model=claude-3-5-sonnet-latest",
            "url": base + "/v1/messages",
            "headers": {"Content-Type": "application/json", "Authorization": f"Bearer {BONSAI_API_KEY}", "anthropic-version": "2023-06-01"},
            "payload": {"model": "claude-3-5-sonnet-latest", "max_tokens": 64, "messages": [{"role": "user", "content": "Say hi"}]},
        },
        {
            "label": "4: model=claude-sonnet-4-5-20250929",
            "url": base + "/v1/messages",
            "headers": {"Content-Type": "application/json", "Authorization": f"Bearer {BONSAI_API_KEY}", "anthropic-version": "2023-06-01"},
            "payload": {"model": "claude-sonnet-4-5-20250929", "max_tokens": 64, "messages": [{"role": "user", "content": "Say hi"}]},
        },
        {
            "label": "5: model=anthropic/claude-sonnet-4.5",
            "url": base + "/v1/messages",
            "headers": {"Content-Type": "application/json", "Authorization": f"Bearer {BONSAI_API_KEY}", "anthropic-version": "2023-06-01"},
            "payload": {"model": "anthropic/claude-sonnet-4.5", "max_tokens": 64, "messages": [{"role": "user", "content": "Say hi"}]},
        },
        {
            "label": "6: with system field",
            "url": base + "/v1/messages",
            "headers": {"Content-Type": "application/json", "Authorization": f"Bearer {BONSAI_API_KEY}", "anthropic-version": "2023-06-01"},
            "payload": {"model": "anthropic/claude-sonnet-4.5", "max_tokens": 64, "system": "You are helpful.", "messages": [{"role": "user", "content": "Say hi"}]},
        },
        {
            "label": "7: with stream=false",
            "url": base + "/v1/messages",
            "headers": {"Content-Type": "application/json", "Authorization": f"Bearer {BONSAI_API_KEY}", "anthropic-version": "2023-06-01"},
            "payload": {"model": "anthropic/claude-sonnet-4.5", "max_tokens": 64, "stream": False, "messages": [{"role": "user", "content": "Say hi"}]},
        },
        {
            "label": "8: with stream=true",
            "url": base + "/v1/messages",
            "headers": {"Content-Type": "application/json", "Authorization": f"Bearer {BONSAI_API_KEY}", "anthropic-version": "2023-06-01"},
            "payload": {"model": "anthropic/claude-sonnet-4.5", "max_tokens": 64, "stream": True, "messages": [{"role": "user", "content": "Say hi"}]},
        },
    ]

    for att in attempts:
        try:
            print(f"\nTrying: {att['label']}")
            r = httpx.post(att["url"], headers=att["headers"], json=att["payload"], timeout=30)
            print(f"  Status: {r.status_code}")
            print(f"  Response headers: {dict(r.headers)}")
            print(f"  Body: {r.text[:500]}")
            entry = {"label": att["label"], "status": r.status_code, "body": r.text[:300], "resp_headers": dict(r.headers)}
            if r.status_code < 400:
                entry["WORKING"] = True
            results.append(entry)
        except Exception as e:
            print(f"  Error: {e}")
            results.append({"label": att["label"], "error": str(e)})

    # Also test with a dummy key to compare
    try:
        r_bad = httpx.post(
            base + "/v1/messages",
            headers={"Content-Type": "application/json", "Authorization": "Bearer fake_key_12345", "anthropic-version": "2023-06-01"},
            json={"model": "anthropic/claude-sonnet-4.5", "max_tokens": 64, "messages": [{"role": "user", "content": "hi"}]},
            timeout=30,
        )
        results.append({"label": "FAKE KEY TEST", "status": r_bad.status_code, "body": r_bad.text[:300]})
    except Exception as e:
        results.append({"label": "FAKE KEY TEST", "error": str(e)})

    return {"key_len": len(BONSAI_API_KEY), "key_prefix": BONSAI_API_KEY[:8] + "...", "results": results}

@app.get("/health")
def health():
    return {"ok": True}


