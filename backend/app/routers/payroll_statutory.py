import json
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_org_id, get_current_user_id, require_can_change_statutory_config, require_payroll_access
from app.services.file_storage import R2_BUCKET, _get_s3
from app.services.payroll_parser import parse_payroll_file

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
    effective_from: date | None = None
    effective_to: date | None = None
    notes: str | None = None


class StatutoryCalcIn(BaseModel):
    gross_pay: float
    pension_contribution: float = 0.0
    insurance_relief_basis: float = 0.0


def _default_config() -> dict:
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
        "effective_from": None,
        "effective_to": None,
        "is_active": True,
        "notes": None,
    }


def _serialize_row(row) -> dict:
    data = dict(row)
    if isinstance(data.get("tax_bands"), str):
        data["tax_bands"] = json.loads(data["tax_bands"])
    return {**_default_config(), **data}


def _get_config(db: Session, org_id: uuid.UUID, effective_on: date | None = None) -> dict:
    effective_on = effective_on or date.today()
    row = db.execute(
        text(
            """SELECT * FROM payroll_statutory_configs
               WHERE org_id=:org
                 AND is_active=true
                 AND (effective_from IS NULL OR effective_from <= :effective_on)
                 AND (effective_to IS NULL OR effective_to >= :effective_on)
               ORDER BY effective_from DESC NULLS LAST, updated_at DESC
               LIMIT 1"""
        ),
        {"org": str(org_id), "effective_on": effective_on},
    ).mappings().first()
    if row:
        return _serialize_row(row)
    return _default_config()


def _extract_detail_amount(details: dict | None, *keys: str) -> float:
    if not details:
        return 0.0
    lowered = {str(k).lower(): v for k, v in details.items()}
    for key in keys:
        for detail_key, value in lowered.items():
            if key in detail_key:
                try:
                    cleaned = str(value).replace(",", "").replace(" ", "")
                    cleaned = "".join(ch for ch in cleaned if ch.isdigit() or ch in ".-")
                    return abs(float(cleaned)) if cleaned else 0.0
                except ValueError:
                    continue
    return 0.0


def _load_batch_parse_result(db: Session, org_id: uuid.UUID, batch_id: uuid.UUID) -> tuple[dict, dict]:
    batch = db.execute(
        text("SELECT * FROM payroll_batches WHERE batch_id=:batch_id AND org_id=:org"),
        {"batch_id": str(batch_id), "org": str(org_id)},
    ).mappings().first()
    if not batch:
        raise HTTPException(status_code=404, detail="Payroll batch not found")
    if not batch.get("upload_storage_key"):
        raise HTTPException(status_code=404, detail="Payroll file not found for this batch")
    try:
        obj = _get_s3().get_object(Bucket=R2_BUCKET, Key=batch["upload_storage_key"])
        content = obj["Body"].read()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read payroll batch: {exc}") from exc
    filename = batch.get("upload_original_filename") or batch["upload_storage_key"]
    result = parse_payroll_file(filename, content, db, org_id)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return dict(batch), result


def _build_batch_validation(result: dict, cfg: dict) -> dict:
    """
    Compare declared statutory amounts (from parsed file) to expected amounts.
    Expected uses the same formula as payslips and run_monthly:
    - NSSF, SHIF, AHL from gross (basic) first.
    - Taxable = gross - pension - nssf - shif - ahl.
    - PAYE = tax on taxable - personal relief - insurance relief.
    Optional: if the file has pension or insurance columns, use them for expected.
    """
    rows = []
    totals = {
        "gross_pay": 0.0,
        "declared_statutory": 0.0,
        "expected_statutory": 0.0,
        "declared_paye": 0.0,
        "expected_paye": 0.0,
        "declared_nssf": 0.0,
        "expected_nssf": 0.0,
        "declared_shif": 0.0,
        "expected_shif": 0.0,
        "declared_ahl": 0.0,
        "expected_ahl": 0.0,
    }
    within_tolerance = 0
    for entry in result.get("entries", []):
        details = entry.get("details") or {}
        declared_paye = _extract_detail_amount(details, "paye", "tax")
        declared_nssf = _extract_detail_amount(details, "nssf")
        declared_shif = _extract_detail_amount(details, "shif", "nhif")
        declared_ahl = _extract_detail_amount(details, "ahl", "housing")
        declared_total = round(declared_paye + declared_nssf + declared_shif + declared_ahl, 2)
        # Use same formula as payslips: NSSF/SHIF/AHL from gross, then taxable, then PAYE
        gross = float(entry.get("gross_salary") or 0)
        pension = _extract_detail_amount(details, "pension", "voluntary_pension")
        insurance_basis = _extract_detail_amount(details, "insurance", "relief_basis")
        expected = _calculate_kenya(
            gross_pay=gross,
            pension_contribution=pension,
            insurance_relief_basis=insurance_basis,
            cfg=cfg,
        )
        variance = round(declared_total - expected["statutory_total"], 2)
        if abs(variance) <= 5:
            within_tolerance += 1
        rows.append(
            {
                "employee_name": entry.get("employee_name"),
                "matched_user_id": entry.get("matched_user_id"),
                "gross_pay": round(float(entry.get("gross_salary") or 0), 2),
                "declared": {
                    "paye": round(declared_paye, 2),
                    "nssf": round(declared_nssf, 2),
                    "shif": round(declared_shif, 2),
                    "ahl": round(declared_ahl, 2),
                    "statutory_total": declared_total,
                },
                "expected": expected,
                "variance": variance,
                "status": "ok" if abs(variance) <= 5 else "review",
            }
        )
        totals["gross_pay"] += float(entry.get("gross_salary") or 0)
        totals["declared_statutory"] += declared_total
        totals["expected_statutory"] += expected["statutory_total"]
        totals["declared_paye"] += declared_paye
        totals["expected_paye"] += expected["paye"]
        totals["declared_nssf"] += declared_nssf
        totals["expected_nssf"] += expected["nssf"]
        totals["declared_shif"] += declared_shif
        totals["expected_shif"] += expected["shif"]
        totals["declared_ahl"] += declared_ahl
        totals["expected_ahl"] += expected["ahl"]

    # When the file has no statutory columns (declared all zero), use expected for filing summary
    # so the UI shows correct PAYE/NSSF/SHIF/AHL totals instead of 0.00
    summary = {
        "employee_count": len(rows),
        "within_tolerance_count": within_tolerance,
        "needs_review_count": len(rows) - within_tolerance,
        **{k: round(v, 2) for k, v in totals.items()},
    }
    rows_out = rows
    filing_from_calculated = False
    if totals["declared_statutory"] < 0.01 and totals["expected_statutory"] > 0:
        filing_from_calculated = True
        summary["declared_statutory"] = round(totals["expected_statutory"], 2)
        summary["declared_paye"] = round(totals["expected_paye"], 2)
        summary["declared_nssf"] = round(totals["expected_nssf"], 2)
        summary["declared_shif"] = round(totals["expected_shif"], 2)
        summary["declared_ahl"] = round(totals["expected_ahl"], 2)
        summary["within_tolerance_count"] = len(rows)
        summary["needs_review_count"] = 0
        rows_out = [
            {
                **r,
                "declared": {
                    "paye": round(r["expected"]["paye"], 2),
                    "nssf": round(r["expected"]["nssf"], 2),
                    "shif": round(r["expected"]["shif"], 2),
                    "ahl": round(r["expected"]["ahl"], 2),
                    "statutory_total": round(r["expected"]["statutory_total"], 2),
                },
                "variance": 0.0,
                "status": "ok",
            }
            for r in rows
        ]
    summary["filing_from_calculated"] = filing_from_calculated
    return {"summary": summary, "rows": rows_out}


def _calculate_kenya(gross_pay: float, pension_contribution: float, insurance_relief_basis: float, cfg: dict) -> dict:
    """
    Kenya statutory: NSSF, SHIF and housing levy (AHL) are deducted from basic salary
    before PAYE. Taxable income for PAYE = gross - pension - nssf - shif - ahl.
    """
    gross = max(0.0, gross_pay)
    pension = max(0.0, pension_contribution)

    # 1. NSSF (from gross / basic salary)
    lower = float(cfg["nssf_lower_limit"])
    upper = float(cfg["nssf_upper_limit"])
    tier1_base = min(gross, lower)
    tier2_base = max(0.0, min(gross, upper) - lower)
    nssf = round(tier1_base * float(cfg["nssf_rate_tier1"]) + tier2_base * float(cfg["nssf_rate_tier2"]), 2)

    # 2. SHIF (from gross)
    shif = round(gross * float(cfg["shif_rate"]), 2)

    # 3. Housing levy AHL (from gross)
    ahl = round(gross * float(cfg["ahl_rate"]), 2)

    # 4. Taxable income for PAYE = gross minus pension and these statutory deductions
    taxable = max(0.0, gross - pension - nssf - shif - ahl)

    # 5. Tax bands on taxable income
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

    personal_relief = float(cfg["personal_relief"])
    insurance_relief = min(
        float(cfg["insurance_relief_cap"]),
        max(0.0, insurance_relief_basis) * float(cfg["insurance_relief_rate"]),
    )
    paye = max(0.0, tax_due - personal_relief - insurance_relief)
    paye = round(paye, 2)
    income_tax_before_relief = round(tax_due, 2)

    statutory_total = round(paye + nssf + shif + ahl, 2)
    net_pay = round(gross_pay - statutory_total - pension_contribution, 2)

    return {
        "gross_pay": round(gross_pay, 2),
        "taxable_pay": round(taxable, 2),
        "income_tax_before_relief": income_tax_before_relief,
        "personal_relief": personal_relief,
        "paye": paye,
        "nssf": nssf,
        "shif": shif,
        "ahl": ahl,
        "statutory_total": statutory_total,
        "estimated_net_pay": net_pay,
    }


@router.get("/config")
def get_statutory_config(
    effective_on: date | None = Query(default=None),
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _user=Depends(require_payroll_access),
):
    return {"config": _get_config(db, org_id, effective_on=effective_on)}


@router.get("/config/versions")
def list_statutory_config_versions(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _user=Depends(require_payroll_access),
):
    rows = db.execute(
        text(
            """SELECT * FROM payroll_statutory_configs
               WHERE org_id=:org
               ORDER BY effective_from DESC NULLS LAST, created_at DESC"""
        ),
        {"org": str(org_id)},
    ).mappings().all()
    return {"versions": [_serialize_row(row) for row in rows]}


@router.put("/config")
def upsert_statutory_config(
    body: StatutoryConfigIn,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
    _user=Depends(require_can_change_statutory_config),
):
    payload = body.model_dump()
    effective_from = payload.pop("effective_from") or date.today()
    effective_to = payload.pop("effective_to", None)
    notes = payload.pop("notes", None)
    db.execute(
        text(
            """UPDATE payroll_statutory_configs
               SET is_active=false, effective_to=COALESCE(effective_to, :previous_end), updated_at=:updated_at
               WHERE org_id=:org AND is_active=true AND (effective_from IS NULL OR effective_from <= :effective_from)"""
        ),
        {
            "org": str(org_id),
            "effective_from": effective_from,
            "previous_end": effective_from,
            "updated_at": datetime.now(timezone.utc),
        },
    )
    insert_params = {
        "id": str(uuid.uuid4()),
        "org": str(org_id),
        "created_by": str(user_id),
        "effective_from": effective_from,
        "effective_to": effective_to,
        "notes": notes,
        "updated_at": datetime.now(timezone.utc),
        **payload,
    }
    insert_params["tax_bands"] = json.dumps(insert_params["tax_bands"])
    db.execute(
        text(
            """INSERT INTO payroll_statutory_configs
               (id, org_id, jurisdiction, tax_bands, personal_relief, insurance_relief_rate, insurance_relief_cap,
                nssf_lower_limit, nssf_upper_limit, nssf_rate_tier1, nssf_rate_tier2, shif_rate, ahl_rate,
                effective_from, effective_to, is_active, notes, created_by, updated_at)
               VALUES (:id, :org, 'KE', CAST(:tax_bands AS jsonb), :personal_relief, :insurance_relief_rate, :insurance_relief_cap,
                       :nssf_lower_limit, :nssf_upper_limit, :nssf_rate_tier1, :nssf_rate_tier2, :shif_rate, :ahl_rate,
                       :effective_from, :effective_to, true, :notes, :created_by, :updated_at)"""
        ),
        insert_params,
    )
    db.commit()
    return {"message": "Statutory config saved", "config": _get_config(db, org_id, effective_on=effective_from)}


@router.post("/calculate")
def calculate_statutory(
    body: StatutoryCalcIn,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _user=Depends(require_payroll_access),
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
    _user=Depends(require_payroll_access),
):
    cfg = _get_config(db, org_id)
    results = [
        _calculate_kenya(r.gross_pay, r.pension_contribution, r.insurance_relief_basis, cfg)
        for r in rows
    ]
    return {"jurisdiction": "KE", "results": results}


@router.post("/validate/batch/{batch_id}")
def validate_payroll_batch_statutory(
    batch_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _user=Depends(require_payroll_access),
):
    batch, result = _load_batch_parse_result(db, org_id, batch_id)
    effective_on = date(int(batch["period_year"]), int(batch["period_month"]), 1)
    cfg = _get_config(db, org_id, effective_on=effective_on)
    validation = _build_batch_validation(result, cfg)
    return {
        "batch_id": str(batch_id),
        "period": f'{batch["period_year"]}-{int(batch["period_month"]):02d}',
        "config_effective_from": cfg.get("effective_from"),
        "formula_note": (
            "Expected amounts use: Basic pay → NSSF, SHIF, Housing levy (from gross) → "
            "Taxable pay = Gross − NSSF − SHIF − AHL → PAYE = Tax on taxable − Personal relief."
        ),
        **validation,
    }


@router.get("/reports/batch/{batch_id}")
def statutory_batch_report(
    batch_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _user=Depends(require_payroll_access),
):
    batch, result = _load_batch_parse_result(db, org_id, batch_id)
    effective_on = date(int(batch["period_year"]), int(batch["period_month"]), 1)
    cfg = _get_config(db, org_id, effective_on=effective_on)
    validation = _build_batch_validation(result, cfg)
    summary = validation["summary"]
    # When file had no statutory columns, summary["declared_*"] were set to expected in _build_batch_validation
    filing_note = None
    if summary.get("filing_from_calculated"):
        filing_note = "Filing summary from calculated statutory (uploaded file had no PAYE/NSSF/SHIF/AHL columns)."
    return {
        "batch_id": str(batch_id),
        "period": f'{batch["period_year"]}-{int(batch["period_month"]):02d}',
        "formula_note": (
            "Expected amounts use: Basic pay → NSSF, SHIF, Housing levy (from gross) → "
            "Taxable pay = Gross − NSSF − SHIF − AHL → PAYE = Tax on taxable − Personal relief."
        ),
        "filing_note": filing_note,
        "filing_summary": {
            "paye": round(summary["declared_paye"], 2),
            "nssf": round(summary["declared_nssf"], 2),
            "shif": round(summary["declared_shif"], 2),
            "ahl": round(summary["declared_ahl"], 2),
            "total_statutory": round(summary["declared_statutory"], 2),
        },
        "expected_summary": {
            "paye": round(summary["expected_paye"], 2),
            "nssf": round(summary["expected_nssf"], 2),
            "shif": round(summary["expected_shif"], 2),
            "ahl": round(summary["expected_ahl"], 2),
            "total_statutory": round(summary["expected_statutory"], 2),
        },
        "review_status": "ready" if summary["needs_review_count"] == 0 else "review_required",
        "rows": validation["rows"],
    }
