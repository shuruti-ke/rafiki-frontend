import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_org_id, get_current_user_id, require_admin, require_manager

router = APIRouter(prefix="/api/v1/payroll/statutory", tags=["Payroll Statutory"])


DEFAULT_KE_BANDS = [
    {"limit": 24000, "rate": 0.10},
    {"limit": 8333, "rate": 0.25},
    {"limit": None, "rate": 0.30},
]


class StatutoryConfigIn(BaseModel):
    tax_bands: list[dict] = DEFAULT_KE_BANDS
    personal_relief: float = 2400.0
    insurance_relief_rate: float = 0.15
    insurance_relief_cap: float = 5000.0
    nssf_lower_limit: float = 9000.0
    nssf_upper_limit: float = 108000.0
    nssf_rate_tier1: float = 0.06
    nssf_rate_tier2: float = 0.06
    shif_rate: float = 0.0275
    ahl_rate: float = 0.015


class StatutoryCalcIn(BaseModel):
    gross_pay: float
    pension_contribution: float = 0.0
    insurance_relief_basis: float = 0.0


def _get_config(db: Session, org_id: uuid.UUID) -> dict:
    row = db.execute(
        text("SELECT * FROM payroll_statutory_configs WHERE org_id=:org"),
        {"org": str(org_id)},
    ).mappings().first()
    if row:
        return dict(row)
    return {
        "tax_bands": DEFAULT_KE_BANDS,
        "personal_relief": 2400.0,
        "insurance_relief_rate": 0.15,
        "insurance_relief_cap": 5000.0,
        "nssf_lower_limit": 9000.0,
        "nssf_upper_limit": 108000.0,
        "nssf_rate_tier1": 0.06,
        "nssf_rate_tier2": 0.06,
        "shif_rate": 0.0275,
        "ahl_rate": 0.015,
    }


def _calculate_kenya(gross_pay: float, pension_contribution: float, insurance_relief_basis: float, cfg: dict) -> dict:
    taxable = max(0.0, gross_pay - pension_contribution)

    # NSSF two-tier
    lower = float(cfg["nssf_lower_limit"])
    upper = float(cfg["nssf_upper_limit"])
    tier1_base = min(taxable, lower)
    tier2_base = max(0.0, min(taxable, upper) - lower)
    nssf = round(tier1_base * float(cfg["nssf_rate_tier1"]) + tier2_base * float(cfg["nssf_rate_tier2"]), 2)

    # Tax bands
    tax_due = 0.0
    remaining = taxable
    for band in cfg["tax_bands"]:
        limit = band.get("limit")
        rate = float(band.get("rate", 0))
        if limit is None:
            taxable_slice = max(0.0, remaining)
        else:
            taxable_slice = min(float(limit), max(0.0, remaining))
        tax_due += taxable_slice * rate
        remaining -= taxable_slice
        if remaining <= 0:
            break

    insurance_relief = min(
        float(cfg["insurance_relief_cap"]),
        max(0.0, insurance_relief_basis) * float(cfg["insurance_relief_rate"]),
    )
    paye = max(0.0, tax_due - float(cfg["personal_relief"]) - insurance_relief)
    paye = round(paye, 2)

    shif = round(max(0.0, gross_pay) * float(cfg["shif_rate"]), 2)
    ahl = round(max(0.0, gross_pay) * float(cfg["ahl_rate"]), 2)
    statutory_total = round(paye + nssf + shif + ahl, 2)
    net_pay = round(gross_pay - statutory_total - pension_contribution, 2)

    return {
        "gross_pay": round(gross_pay, 2),
        "taxable_pay": round(taxable, 2),
        "paye": paye,
        "nssf": nssf,
        "shif": shif,
        "ahl": ahl,
        "statutory_total": statutory_total,
        "estimated_net_pay": net_pay,
    }


@router.get("/config")
def get_statutory_config(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    return {"config": _get_config(db, org_id)}


@router.put("/config")
def upsert_statutory_config(
    body: StatutoryConfigIn,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(require_admin),
):
    exists = db.execute(
        text("SELECT id FROM payroll_statutory_configs WHERE org_id=:org"),
        {"org": str(org_id)},
    ).first()
    payload = body.model_dump()
    if exists:
        db.execute(
            text(
                """UPDATE payroll_statutory_configs SET
                   tax_bands=:tax_bands::jsonb, personal_relief=:personal_relief,
                   insurance_relief_rate=:insurance_relief_rate, insurance_relief_cap=:insurance_relief_cap,
                   nssf_lower_limit=:nssf_lower_limit, nssf_upper_limit=:nssf_upper_limit,
                   nssf_rate_tier1=:nssf_rate_tier1, nssf_rate_tier2=:nssf_rate_tier2,
                   shif_rate=:shif_rate, ahl_rate=:ahl_rate, updated_at=:updated_at
                   WHERE org_id=:org"""
            ),
            {**payload, "tax_bands": json.dumps(payload["tax_bands"]), "updated_at": datetime.utcnow(), "org": str(org_id)},
        )
    else:
        db.execute(
            text(
                """INSERT INTO payroll_statutory_configs
                   (id, org_id, jurisdiction, tax_bands, personal_relief, insurance_relief_rate, insurance_relief_cap,
                    nssf_lower_limit, nssf_upper_limit, nssf_rate_tier1, nssf_rate_tier2, shif_rate, ahl_rate, created_by)
                   VALUES (:id, :org, 'KE', :tax_bands::jsonb, :personal_relief, :insurance_relief_rate, :insurance_relief_cap,
                           :nssf_lower_limit, :nssf_upper_limit, :nssf_rate_tier1, :nssf_rate_tier2, :shif_rate, :ahl_rate, :created_by)"""
            ),
            {
                "id": str(uuid.uuid4()),
                "org": str(org_id),
                "created_by": str(user_id),
                "tax_bands": json.dumps(payload["tax_bands"]),
                **payload,
            },
        )
    db.commit()
    return {"message": "Statutory config saved", "config": _get_config(db, org_id)}


@router.post("/calculate")
def calculate_statutory(
    body: StatutoryCalcIn,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    cfg = _get_config(db, org_id)
    result = _calculate_kenya(
        gross_pay=body.gross_pay,
        pension_contribution=body.pension_contribution,
        insurance_relief_basis=body.insurance_relief_basis,
        cfg=cfg,
    )
    return {"jurisdiction": "KE", "result": result}


@router.post("/calculate/batch")
def calculate_statutory_batch(
    rows: list[StatutoryCalcIn],
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    cfg = _get_config(db, org_id)
    results = [
        _calculate_kenya(r.gross_pay, r.pension_contribution, r.insurance_relief_basis, cfg)
        for r in rows
    ]
    return {"jurisdiction": "KE", "results": results}
