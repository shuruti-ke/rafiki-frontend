import json
import os
import uuid
from datetime import date
from typing import Optional
import logging

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_org_id, get_current_user_id, require_manager

logger = logging.getLogger(__name__)
_openai_client = None

def _get_openai():
    global _openai_client
    if _openai_client is None:
        base_url = os.getenv("OPENAI_BASE_URL", "").strip().rstrip("/")
        kwargs = {"api_key": os.getenv("OPENAI_API_KEY")}
        # Only set base_url if it's a non-standard endpoint (not the default OpenAI API)
        if base_url and base_url not in ("https://api.openai.com", "https://api.openai.com/v1"):
            kwargs["base_url"] = base_url
        _openai_client = OpenAI(**kwargs
        )
    return _openai_client

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

    if dataset == "attendance":
        valid_groups = ("department", "work_date", "employee_name")
        if group_by not in valid_groups:
            group_by = "department"
        if group_by == "department":
            sql = """
                SELECT COALESCE(u.department,'Unassigned') AS department,
                       COUNT(DISTINCT al.user_id) AS employees_checked_in,
                       COUNT(*) AS total_days_logged,
                       ROUND(AVG(al.total_seconds)/3600.0,1) AS avg_hours_per_day
                FROM attendance_logs al
                JOIN users_legacy u ON u.user_id = al.user_id
                WHERE al.org_id = :org
            """
        elif group_by == "work_date":
            sql = """
                SELECT al.work_date::text AS work_date,
                       COUNT(DISTINCT al.user_id) AS employees_present,
                       ROUND(AVG(al.total_seconds)/3600.0,1) AS avg_hours
                FROM attendance_logs al
                WHERE al.org_id = :org
            """
        else:
            sql = """
                SELECT u.name AS employee_name,
                       COUNT(*) AS days_logged,
                       ROUND(SUM(al.total_seconds)/3600.0,1) AS total_hours
                FROM attendance_logs al
                JOIN users_legacy u ON u.user_id = al.user_id
                WHERE al.org_id = :org
            """
        params = {"org": str(org_id)}
        if start_date and end_date:
            sql += " AND al.work_date BETWEEN :start AND :end"
            params["start"] = start_date
            params["end"] = end_date
        sql += f" GROUP BY {group_by if group_by != 'employee_name' else 'u.name'} ORDER BY 1"
        rows = db.execute(text(sql), params).mappings().all()
        return {"dataset": dataset, "group_by": group_by, "rows": [dict(r) for r in rows]}

    raise HTTPException(status_code=400, detail="Unsupported dataset. Use: employees, leave, timesheets, payroll, attendance")


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


class AIQueryIn(BaseModel):
    question: str


class AIInsightsIn(BaseModel):
    dataset: str
    group_by: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    rows: list[dict]


_AI_QUERY_SYSTEM = """You are an HR analytics assistant. Convert the user's natural language request into a JSON report config for an HR platform.
Available datasets: employees, leave, timesheets, payroll, attendance.
Group options:
- employees: department, job_title, employment_type, work_location
- leave: status, leave_type, department, employment_type
- timesheets: department, job_title, project, activity_type
- payroll: department, job_title, employment_type, employee_name
- attendance: department, work_date, employee_name
Chart types: bar, pie, table

Return ONLY valid JSON with these fields (omit if not applicable):
{
  "dataset": "...",
  "group_by": "...",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "chart_type": "bar|pie|table",
  "name": "descriptive report name"
}"""

_AI_INSIGHTS_SYSTEM = """You are a senior HR analytics expert. Analyze the provided HR report data and give a concise, insightful narrative (3-5 sentences).
Focus on: key trends, anomalies, top/bottom performers, comparisons to expected norms, and 1-2 actionable recommendations.
Be direct and data-specific. Reference actual numbers from the data. No bullet points — flowing paragraphs."""


@router.post("/ai-query")
def ai_query_to_config(
    body: AIQueryIn,
    _role: str = Depends(require_manager),
):
    """Convert natural language into a report config object."""
    if not body.question.strip():
        raise HTTPException(400, "Question is required")
    try:
        client = _get_openai()
        resp = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _AI_QUERY_SYSTEM},
                {"role": "user", "content": body.question},
            ],
            temperature=0.2,
            max_tokens=300,
        )
        config = json.loads(resp.choices[0].message.content)
        return config
    except Exception as e:
        logger.warning("AI query failed: %s", e)
        raise HTTPException(500, "AI query failed. Check OpenAI API key configuration.")


@router.post("/ai-insights")
def ai_insights(
    body: AIInsightsIn,
    _role: str = Depends(require_manager),
):
    """Generate narrative AI insights for a given report result."""
    if not body.rows:
        raise HTTPException(400, "No rows to analyse")
    try:
        sample = body.rows[:60]  # cap to avoid token limits
        data_str = json.dumps(sample, default=str)
        date_range = f"{body.start_date or 'all time'} to {body.end_date or 'present'}"
        user_msg = (
            f"Dataset: {body.dataset} | Grouped by: {body.group_by or 'none'} | Period: {date_range}\n\n"
            f"Data ({len(body.rows)} rows, showing up to 60):\n{data_str}"
        )
        client = _get_openai()
        resp = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": _AI_INSIGHTS_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.4,
            max_tokens=400,
        )
        return {"insights": resp.choices[0].message.content}
    except Exception as e:
        logger.warning("AI insights failed: %s", e)
        raise HTTPException(500, "AI insights failed. Check OpenAI API key configuration.")
