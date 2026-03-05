"""
Wellbeing API: dashboard analytics, crisis alerts, stress tracking, config.
"""

import logging
from uuid import UUID
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_

from app.database import get_db
from app.dependencies import (
    get_current_user_id, get_current_org_id,
    get_current_user, require_admin, require_manager,
)
from app.models.wellbeing import CrisisAlert, ChatAnalytics, OrgCrisisConfig
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/wellbeing", tags=["Wellbeing"])


# ── Pydantic schemas ──

class AlertAcknowledge(BaseModel):
    pass

class AlertResolve(BaseModel):
    notes: Optional[str] = None

class CrisisConfigUpdate(BaseModel):
    crisis_contacts: Optional[list] = None
    custom_helplines: Optional[list] = None
    auto_alert_managers: Optional[bool] = None
    auto_alert_hr: Optional[bool] = None


# ── Dashboard ──

@router.get("/dashboard")
def get_dashboard(
    db: Session = Depends(get_db),
    org_id: UUID = Depends(get_current_org_id),
    role: str = Depends(require_admin),
):
    """Main dashboard: KPIs, alerts summary, sentiment breakdown, stress by dept."""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Active crisis alerts (open)
    open_alerts = db.query(func.count(CrisisAlert.id)).filter(
        CrisisAlert.org_id == org_id,
        CrisisAlert.status == "open",
    ).scalar() or 0

    # Avg stress this month
    avg_stress = db.query(func.avg(ChatAnalytics.stress_level)).filter(
        ChatAnalytics.org_id == org_id,
        ChatAnalytics.created_at >= month_start,
    ).scalar()

    # Sentiment breakdown this month
    sentiment_counts = db.query(
        ChatAnalytics.sentiment_label,
        func.count(ChatAnalytics.id),
    ).filter(
        ChatAnalytics.org_id == org_id,
        ChatAnalytics.created_at >= month_start,
    ).group_by(ChatAnalytics.sentiment_label).all()

    sentiment_map = {label: count for label, count in sentiment_counts if label}
    total_convos = sum(sentiment_map.values()) or 0
    positive_pct = round(sentiment_map.get("positive", 0) / total_convos * 100, 1) if total_convos else 0

    # Total conversations this month
    convo_count = db.query(func.count(ChatAnalytics.id)).filter(
        ChatAnalytics.org_id == org_id,
        ChatAnalytics.created_at >= month_start,
    ).scalar() or 0

    return {
        "open_alerts": open_alerts,
        "avg_stress": round(float(avg_stress), 2) if avg_stress else None,
        "positive_sentiment_pct": positive_pct,
        "conversations_this_month": convo_count,
        "sentiment_breakdown": sentiment_map,
    }


# ── Crisis Alerts ──

@router.get("/alerts")
def get_alerts(
    status: Optional[str] = Query(None),
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    org_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
    role: str = Depends(require_manager),
):
    """List crisis alerts. Managers see only their direct reports."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    q = db.query(CrisisAlert).filter(
        CrisisAlert.org_id == org_id,
        CrisisAlert.created_at >= since,
    )

    # Manager scope: only direct reports
    if role == "manager":
        direct_report_ids = db.query(User.user_id).filter(
            User.manager_id == user_id,
            User.org_id == org_id,
        ).all()
        report_ids = [r[0] for r in direct_report_ids]
        q = q.filter(CrisisAlert.user_id.in_(report_ids))

    if status:
        q = q.filter(CrisisAlert.status == status)

    alerts = q.order_by(CrisisAlert.created_at.desc()).limit(200).all()

    result = []
    # Batch-fetch user names
    alert_user_ids = list({a.user_id for a in alerts})
    user_map = {}
    if alert_user_ids:
        users = db.query(User.user_id, User.name, User.email, User.department).filter(
            User.user_id.in_(alert_user_ids)
        ).all()
        user_map = {u.user_id: u for u in users}

    for a in alerts:
        u = user_map.get(a.user_id)
        result.append({
            "id": str(a.id),
            "user_id": str(a.user_id),
            "employee_name": u.name if u else "Unknown",
            "employee_email": u.email if u else None,
            "department": u.department if u else None,
            "risk_level": a.risk_level,
            "trigger_text": a.trigger_text,
            "detected_patterns": a.detected_patterns,
            "status": a.status,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "resolution_notes": a.resolution_notes,
        })

    return result


@router.post("/alerts/{alert_id}/acknowledge")
def acknowledge_alert(
    alert_id: UUID,
    db: Session = Depends(get_db),
    org_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
    role: str = Depends(require_manager),
):
    alert = db.query(CrisisAlert).filter(
        CrisisAlert.id == alert_id,
        CrisisAlert.org_id == org_id,
    ).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.status = "acknowledged"
    alert.acknowledged_by = user_id
    db.commit()
    return {"ok": True, "status": "acknowledged"}


@router.post("/alerts/{alert_id}/resolve")
def resolve_alert(
    alert_id: UUID,
    body: AlertResolve,
    db: Session = Depends(get_db),
    org_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
    role: str = Depends(require_manager),
):
    alert = db.query(CrisisAlert).filter(
        CrisisAlert.id == alert_id,
        CrisisAlert.org_id == org_id,
    ).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.status = "resolved"
    alert.resolved_by = user_id
    alert.resolution_notes = body.notes
    db.commit()
    return {"ok": True, "status": "resolved"}


# ── Stress by Department ──

@router.get("/stress-by-department")
def stress_by_department(
    db: Session = Depends(get_db),
    org_id: UUID = Depends(get_current_org_id),
    role: str = Depends(require_admin),
):
    """Avg stress per department."""
    since = datetime.now(timezone.utc) - timedelta(days=30)

    rows = db.query(
        User.department,
        func.avg(ChatAnalytics.stress_level).label("avg_stress"),
        func.count(ChatAnalytics.id).label("count"),
    ).join(
        ChatAnalytics, ChatAnalytics.user_id == User.user_id,
    ).filter(
        User.org_id == org_id,
        ChatAnalytics.org_id == org_id,
        ChatAnalytics.created_at >= since,
        User.department.isnot(None),
    ).group_by(User.department).all()

    return [
        {"department": r.department or "Unassigned", "avg_stress": round(float(r.avg_stress), 2), "count": r.count}
        for r in rows
    ]


# ── Stress by Employee ──

@router.get("/stress-by-employee/{target_user_id}")
def stress_by_employee(
    target_user_id: UUID,
    db: Session = Depends(get_db),
    org_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
    role: str = Depends(require_manager),
):
    """Individual stress trend over time."""
    # Manager scope check
    if role == "manager":
        is_report = db.query(User).filter(
            User.user_id == target_user_id,
            User.manager_id == user_id,
            User.org_id == org_id,
        ).first()
        if not is_report:
            raise HTTPException(status_code=403, detail="Not your direct report")

    since = datetime.now(timezone.utc) - timedelta(days=30)
    records = db.query(
        ChatAnalytics.stress_level,
        ChatAnalytics.sentiment,
        ChatAnalytics.sentiment_label,
        ChatAnalytics.topics,
        ChatAnalytics.created_at,
    ).filter(
        ChatAnalytics.user_id == target_user_id,
        ChatAnalytics.org_id == org_id,
        ChatAnalytics.created_at >= since,
    ).order_by(ChatAnalytics.created_at).all()

    return [
        {
            "stress_level": r.stress_level,
            "sentiment": r.sentiment,
            "sentiment_label": r.sentiment_label,
            "topics": r.topics,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in records
    ]


# ── Topics ──

@router.get("/topics")
def get_topics(
    db: Session = Depends(get_db),
    org_id: UUID = Depends(get_current_org_id),
    role: str = Depends(require_admin),
):
    """Mental health topics frequency aggregation."""
    since = datetime.now(timezone.utc) - timedelta(days=30)

    rows = db.query(ChatAnalytics.topics).filter(
        ChatAnalytics.org_id == org_id,
        ChatAnalytics.created_at >= since,
        ChatAnalytics.topics.isnot(None),
    ).all()

    freq = {}
    for (topics,) in rows:
        if isinstance(topics, list):
            for t in topics:
                freq[t] = freq.get(t, 0) + 1

    # Sort by frequency descending
    return sorted(
        [{"topic": k, "count": v} for k, v in freq.items()],
        key=lambda x: x["count"],
        reverse=True,
    )


# ── Sentiment Trend ──

@router.get("/sentiment-trend")
def sentiment_trend(
    db: Session = Depends(get_db),
    org_id: UUID = Depends(get_current_org_id),
    role: str = Depends(require_admin),
):
    """Daily sentiment averages over past 30 days."""
    since = datetime.now(timezone.utc) - timedelta(days=30)

    rows = db.query(
        func.date_trunc("day", ChatAnalytics.created_at).label("day"),
        func.avg(ChatAnalytics.sentiment).label("avg_sentiment"),
        func.avg(ChatAnalytics.stress_level).label("avg_stress"),
        func.count(ChatAnalytics.id).label("count"),
    ).filter(
        ChatAnalytics.org_id == org_id,
        ChatAnalytics.created_at >= since,
    ).group_by(
        func.date_trunc("day", ChatAnalytics.created_at),
    ).order_by(
        func.date_trunc("day", ChatAnalytics.created_at),
    ).all()

    return [
        {
            "date": r.day.isoformat() if r.day else None,
            "avg_sentiment": round(float(r.avg_sentiment), 3) if r.avg_sentiment else 0,
            "avg_stress": round(float(r.avg_stress), 2) if r.avg_stress else 0,
            "count": r.count,
        }
        for r in rows
    ]


# ── Crisis Config ──

@router.get("/crisis-config")
def get_crisis_config(
    db: Session = Depends(get_db),
    org_id: UUID = Depends(get_current_org_id),
    role: str = Depends(require_admin),
):
    config = db.query(OrgCrisisConfig).filter(OrgCrisisConfig.org_id == org_id).first()
    if not config:
        return {
            "crisis_contacts": [],
            "custom_helplines": [],
            "auto_alert_managers": True,
            "auto_alert_hr": True,
        }
    return {
        "crisis_contacts": config.crisis_contacts or [],
        "custom_helplines": config.custom_helplines or [],
        "auto_alert_managers": config.auto_alert_managers,
        "auto_alert_hr": config.auto_alert_hr,
    }


@router.put("/crisis-config")
def update_crisis_config(
    body: CrisisConfigUpdate,
    db: Session = Depends(get_db),
    org_id: UUID = Depends(get_current_org_id),
    role: str = Depends(require_admin),
):
    config = db.query(OrgCrisisConfig).filter(OrgCrisisConfig.org_id == org_id).first()
    if not config:
        config = OrgCrisisConfig(org_id=org_id)
        db.add(config)

    if body.crisis_contacts is not None:
        config.crisis_contacts = body.crisis_contacts
    if body.custom_helplines is not None:
        config.custom_helplines = body.custom_helplines
    if body.auto_alert_managers is not None:
        config.auto_alert_managers = body.auto_alert_managers
    if body.auto_alert_hr is not None:
        config.auto_alert_hr = body.auto_alert_hr

    db.commit()
    return {"ok": True}
