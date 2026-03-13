import json
import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_org_id, get_current_user_id, require_manager

router = APIRouter(prefix="/api/v1/custom-reports", tags=["Custom Reports"])


class ReportConfigIn(BaseModel):
    name: str
    description: Optional[str] = None
    config: dict


class RunReportIn(BaseModel):
    saved_report_id: Optional[uuid.UUID] = None
    config: Optional[dict] = None


def _run_config(db: Session, org_id: uuid.UUID, config: dict) -> dict:
    dataset = (config.get("dataset") or "").lower()
    start_date = config.get("start_date")
    end_date = config.get("end_date")
    group_by = (config.get("group_by") or "").lower()

    if dataset == "employees":
        rows = db.execute(
            text(
                """SELECT department, role, COUNT(*) AS count
                   FROM users_legacy
                   WHERE org_id=:org
                   GROUP BY department, role
                   ORDER BY count DESC"""
            ),
            {"org": str(org_id)},
        ).mappings().all()
        return {"dataset": dataset, "rows": [dict(r) for r in rows]}

    if dataset == "leave":
        if group_by not in ("status", "leave_type", "department"):
            group_by = "status"
        if group_by == "department":
            sql = """
                SELECT COALESCE(u.department, 'Unassigned') AS department, COUNT(*) AS count, SUM(la.working_days) AS total_days
                FROM leave_applications la
                LEFT JOIN users_legacy u ON u.user_id = la.user_id
                WHERE la.org_id=:org
            """
            params = {"org": str(org_id)}
            if start_date and end_date:
                sql += " AND la.start_date BETWEEN :start AND :end"
                params["start"] = start_date
                params["end"] = end_date
            sql += " GROUP BY COALESCE(u.department, 'Unassigned') ORDER BY count DESC"
            rows = db.execute(text(sql), params).mappings().all()
            return {"dataset": dataset, "group_by": "department", "rows": [dict(r) for r in rows]}
        else:
            sql = f"""
                SELECT {group_by}, COUNT(*) AS count, SUM(working_days) AS total_days
                FROM leave_applications
                WHERE org_id=:org
            """
            params = {"org": str(org_id)}
            if start_date and end_date:
                sql += " AND start_date BETWEEN :start AND :end"
                params["start"] = start_date
                params["end"] = end_date
            sql += f" GROUP BY {group_by} ORDER BY count DESC"
            rows = db.execute(text(sql), params).mappings().all()
            return {"dataset": dataset, "group_by": group_by, "rows": [dict(r) for r in rows]}

    if dataset == "timesheets":
        if group_by not in ("project", "category", "activity_type"):
            group_by = "project"
        sql = f"""
            SELECT COALESCE({group_by}, 'Unassigned') AS key, SUM(hours) AS total_hours, COUNT(*) AS entries
            FROM timesheet_entries
            WHERE org_id=:org
        """
        params = {"org": str(org_id)}
        if start_date and end_date:
            sql += " AND date BETWEEN :start AND :end"
            params["start"] = start_date
            params["end"] = end_date
        sql += f" GROUP BY COALESCE({group_by}, 'Unassigned') ORDER BY total_hours DESC"
        rows = db.execute(text(sql), params).mappings().all()
        return {"dataset": dataset, "group_by": group_by, "rows": [dict(r) for r in rows]}

    if dataset == "payroll":
        sql = """
            SELECT payroll_month, status, COUNT(*) AS payslip_count,
                   SUM(net_pay) AS total_net_pay, SUM(gross_pay) AS total_gross_pay
            FROM payslips
            WHERE org_id=:org
        """
        params = {"org": str(org_id)}
        if start_date and end_date:
            sql += " AND payroll_month BETWEEN :start AND :end"
            params["start"] = start_date
            params["end"] = end_date
        sql += " GROUP BY payroll_month, status ORDER BY payroll_month DESC, status"
        rows = db.execute(text(sql), params).mappings().all()
        return {"dataset": dataset, "rows": [dict(r) for r in rows]}

    raise HTTPException(status_code=400, detail="Unsupported dataset. Use: employees, leave, timesheets, payroll")


@router.post("/")
def save_custom_report(
    body: ReportConfigIn,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(require_manager),
):
    row = db.execute(
        text(
            """INSERT INTO custom_reports
               (id, org_id, name, description, config, created_by)
               VALUES (:id, :org, :name, :description, :config::jsonb, :created_by)
               RETURNING *"""
        ),
        {
            "id": str(uuid.uuid4()),
            "org": str(org_id),
            "name": body.name.strip(),
            "description": body.description,
            "config": json.dumps(body.config or {}),
            "created_by": str(user_id),
        },
    ).mappings().first()
    db.commit()
    return {"report": dict(row)}


@router.get("/")
def list_custom_reports(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    rows = db.execute(
        text("SELECT * FROM custom_reports WHERE org_id=:org ORDER BY created_at DESC"),
        {"org": str(org_id)},
    ).mappings().all()
    return {"reports": [dict(r) for r in rows]}


@router.post("/run")
def run_custom_report(
    body: RunReportIn,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    config = body.config
    if body.saved_report_id:
        saved = db.execute(
            text("SELECT * FROM custom_reports WHERE id=:id AND org_id=:org"),
            {"id": str(body.saved_report_id), "org": str(org_id)},
        ).mappings().first()
        if not saved:
            raise HTTPException(status_code=404, detail="Saved report not found")
        config = saved["config"] or {}

    if not config:
        raise HTTPException(status_code=400, detail="Provide either saved_report_id or config")

    result = _run_config(db, org_id, config)
    result["generated_at"] = date.today()
    return result
