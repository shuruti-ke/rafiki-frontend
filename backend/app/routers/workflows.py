import uuid
from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_org_id, get_current_user_id, require_admin, require_manager

router = APIRouter(prefix="/api/v1/workflows", tags=["Onboarding Offboarding"])


class WorkflowStartIn(BaseModel):
    title: Optional[str] = None
    tasks: Optional[list[dict | str]] = None


DEFAULT_ONBOARDING_TASKS = [
    "Submit required personal documents",
    "Sign contract and policy acknowledgements",
    "Complete IT account setup",
    "Manager introduction and role briefing",
]

DEFAULT_OFFBOARDING_TASKS = [
    "Schedule exit interview",
    "Return all company assets",
    "Complete handover and knowledge transfer",
    "Revoke system access and finalize settlement",
]


def _normalize_tasks(raw_tasks: list[dict | str] | None, workflow_type: str) -> list[dict]:
    default_owner = "employee" if workflow_type == "onboarding" else "admin"
    defaults = DEFAULT_ONBOARDING_TASKS if workflow_type == "onboarding" else DEFAULT_OFFBOARDING_TASKS
    source = raw_tasks or defaults
    normalized = []
    for item in source:
        if isinstance(item, str):
            title = item.strip()
            if title:
                normalized.append({"title": title, "owner_type": default_owner, "due_date": date.today()})
            continue
        if isinstance(item, dict):
            title = str(item.get("title") or "").strip()
            if not title:
                continue
            owner_type = str(item.get("owner_type") or default_owner)
            due_value = item.get("due_date")
            if isinstance(due_value, str) and due_value:
                try:
                    due_value = date.fromisoformat(due_value)
                except ValueError:
                    due_value = date.today()
            normalized.append({
                "title": title,
                "owner_type": owner_type,
                "due_date": due_value or date.today(),
            })
    return normalized


@router.post("/onboarding/{user_id}")
def start_onboarding(
    user_id: uuid.UUID,
    body: WorkflowStartIn,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    actor_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(require_admin),
):
    title = body.title or "Employee Onboarding"
    tasks = _normalize_tasks(body.tasks, "onboarding")
    workflow_id = str(uuid.uuid4())
    db.execute(
        text(
            """INSERT INTO employee_workflows
               (id, org_id, user_id, workflow_type, title, status, created_by)
               VALUES (:id, :org, :uid, 'onboarding', :title, 'active', :created_by)"""
        ),
        {"id": workflow_id, "org": str(org_id), "uid": str(user_id), "title": title, "created_by": str(actor_id)},
    )
    for t in tasks:
        db.execute(
            text(
                """INSERT INTO employee_workflow_tasks
                   (id, workflow_id, title, owner_type, due_date, is_completed)
                   VALUES (:id, :workflow_id, :title, :owner_type, :due, false)"""
            ),
            {
                "id": str(uuid.uuid4()),
                "workflow_id": workflow_id,
                "title": t["title"],
                "owner_type": t["owner_type"],
                "due": t["due_date"],
            },
        )
    db.commit()
    return {"workflow_id": workflow_id, "workflow_type": "onboarding", "task_count": len(tasks)}


@router.post("/offboarding/{user_id}")
def start_offboarding(
    user_id: uuid.UUID,
    body: WorkflowStartIn,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    actor_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(require_admin),
):
    title = body.title or "Employee Offboarding"
    tasks = _normalize_tasks(body.tasks, "offboarding")
    workflow_id = str(uuid.uuid4())
    db.execute(
        text(
            """INSERT INTO employee_workflows
               (id, org_id, user_id, workflow_type, title, status, created_by)
               VALUES (:id, :org, :uid, 'offboarding', :title, 'active', :created_by)"""
        ),
        {"id": workflow_id, "org": str(org_id), "uid": str(user_id), "title": title, "created_by": str(actor_id)},
    )
    for t in tasks:
        db.execute(
            text(
                """INSERT INTO employee_workflow_tasks
                   (id, workflow_id, title, owner_type, due_date, is_completed)
                   VALUES (:id, :workflow_id, :title, :owner_type, :due, false)"""
            ),
            {
                "id": str(uuid.uuid4()),
                "workflow_id": workflow_id,
                "title": t["title"],
                "owner_type": t["owner_type"],
                "due": t["due_date"],
            },
        )
    db.commit()
    return {"workflow_id": workflow_id, "workflow_type": "offboarding", "task_count": len(tasks)}


@router.get("/my")
def my_workflows(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    workflows = db.execute(
        text(
            """SELECT * FROM employee_workflows
               WHERE org_id=:org AND user_id=:uid
               ORDER BY created_at DESC"""
        ),
        {"org": str(org_id), "uid": str(user_id)},
    ).mappings().all()
    result = []
    for wf in workflows:
        tasks = db.execute(
            text("SELECT * FROM employee_workflow_tasks WHERE workflow_id=:wid ORDER BY created_at ASC"),
            {"wid": str(wf["id"])},
        ).mappings().all()
        result.append({**dict(wf), "tasks": [dict(t) for t in tasks]})
    return {"workflows": result}


@router.get("/employee/{user_id}")
def employee_workflows(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    workflows = db.execute(
        text(
            """SELECT * FROM employee_workflows
               WHERE org_id=:org AND user_id=:uid
               ORDER BY created_at DESC"""
        ),
        {"org": str(org_id), "uid": str(user_id)},
    ).mappings().all()
    result = []
    for wf in workflows:
        tasks = db.execute(
            text("SELECT * FROM employee_workflow_tasks WHERE workflow_id=:wid ORDER BY created_at ASC"),
            {"wid": str(wf["id"])},
        ).mappings().all()
        result.append({**dict(wf), "tasks": [dict(t) for t in tasks]})
    return {"workflows": result}


@router.post("/tasks/{task_id}/complete")
def complete_workflow_task(
    task_id: uuid.UUID,
    notes: Optional[str] = None,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    task = db.execute(
        text(
            """SELECT t.*, w.user_id AS workflow_user_id
               FROM employee_workflow_tasks t
               JOIN employee_workflows w ON w.id=t.workflow_id
               WHERE t.id=:id"""
        ),
        {"id": str(task_id)},
    ).mappings().first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task["owner_type"] == "employee" and str(task["workflow_user_id"]) != str(user_id):
        raise HTTPException(status_code=403, detail="Not allowed to complete this employee-owned task")

    db.execute(
        text(
            """UPDATE employee_workflow_tasks
               SET is_completed=true, completed_by=:uid, completed_at=:completed_at, notes=:notes, updated_at=:updated_at
               WHERE id=:id"""
        ),
        {
            "uid": str(user_id),
            "completed_at": datetime.utcnow(),
            "notes": notes,
            "updated_at": datetime.utcnow(),
            "id": str(task_id),
        },
    )

    pending = db.execute(
        text("SELECT COUNT(*) FROM employee_workflow_tasks WHERE workflow_id=:wid AND is_completed=false"),
        {"wid": str(task["workflow_id"])},
    ).scalar() or 0
    if pending == 0:
        db.execute(
            text(
                """UPDATE employee_workflows
                   SET status='completed', completed_at=:completed_at, updated_at=:updated_at
                   WHERE id=:wid"""
            ),
            {"completed_at": datetime.utcnow(), "updated_at": datetime.utcnow(), "wid": str(task["workflow_id"])},
        )
    db.commit()
    return {"ok": True}


@router.post("/offboarding/{workflow_id}/finalize")
def finalize_offboarding(
    workflow_id: uuid.UUID,
    effective_end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    wf = db.execute(
        text("SELECT * FROM employee_workflows WHERE id=:wid AND org_id=:org AND workflow_type='offboarding'"),
        {"wid": str(workflow_id), "org": str(org_id)},
    ).mappings().first()
    if not wf:
        raise HTTPException(status_code=404, detail="Offboarding workflow not found")

    db.execute(
        text("UPDATE users_legacy SET is_active=false WHERE user_id=:uid AND org_id=:org"),
        {"uid": str(wf["user_id"]), "org": str(org_id)},
    )
    db.execute(
        text("UPDATE employee_profiles SET end_date=:end_date WHERE user_id=:uid AND org_id=:org"),
        {"end_date": effective_end_date or date.today(), "uid": str(wf["user_id"]), "org": str(org_id)},
    )
    db.execute(
        text("UPDATE employee_workflows SET status='completed', completed_at=:ts, updated_at=:ts WHERE id=:wid"),
        {"ts": datetime.utcnow(), "wid": str(workflow_id)},
    )
    db.commit()
    return {"ok": True, "user_id": str(wf["user_id"]), "is_active": False}
