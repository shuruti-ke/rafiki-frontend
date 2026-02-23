"""
Parse payroll files (Excel / CSV) and match employees to users_legacy.
"""
import csv
import io
import logging
from typing import Optional

from sqlalchemy.orm import Session
from app.models.user import User

logger = logging.getLogger(__name__)


def _normalize_name(name: str) -> str:
    return " ".join(name.strip().lower().split())


def _match_employees(entries: list[dict], db: Session, org_id) -> list[dict]:
    """
    For each parsed entry, try to match employee_name to users_legacy.name
    within the same org. Adds matched_user_id (str | None) to each entry.
    """
    users = db.query(User).filter(User.org_id == org_id, User.is_active == True).all()
    name_map = {}
    for u in users:
        if u.name:
            name_map[_normalize_name(u.name)] = str(u.user_id)

    for entry in entries:
        norm = _normalize_name(entry["employee_name"])
        entry["matched_user_id"] = name_map.get(norm)

    return entries


def parse_csv_payroll(content: bytes, db: Session, org_id) -> dict:
    """
    Parse CSV payroll file. Expected columns (case-insensitive):
    employee_name (or name), gross_salary (or gross), deductions, net_salary (or net)
    Extra columns are stored in details.
    """
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    # Normalize header names
    if not reader.fieldnames:
        return {"entries": [], "total_gross": 0, "total_deductions": 0, "total_net": 0, "unmatched_names": []}

    col_map = {}
    for col in reader.fieldnames:
        lower = col.strip().lower().replace(" ", "_")
        col_map[col] = lower

    entries = []
    for row in reader:
        normed = {col_map.get(k, k): v.strip() if isinstance(v, str) else v for k, v in row.items()}

        name = normed.get("employee_name") or normed.get("name") or ""
        if not name:
            continue

        gross = _parse_number(normed.get("gross_salary") or normed.get("gross") or "0")
        deductions = _parse_number(normed.get("deductions") or "0")
        net = _parse_number(normed.get("net_salary") or normed.get("net") or "0")

        # Collect extra columns as details
        known_keys = {"employee_name", "name", "gross_salary", "gross", "deductions", "net_salary", "net"}
        details = {k: v for k, v in normed.items() if k not in known_keys and v}

        entries.append({
            "employee_name": name,
            "gross_salary": gross,
            "deductions": deductions,
            "net_salary": net,
            "details": details if details else None,
        })

    entries = _match_employees(entries, db, org_id)
    return _build_summary(entries)


def parse_excel_payroll(content: bytes, db: Session, org_id) -> dict:
    """
    Parse Excel (.xlsx) payroll file using openpyxl.
    Same expected columns as CSV.
    """
    try:
        import openpyxl
    except ImportError:
        logger.error("openpyxl not installed — cannot parse Excel files")
        return {"entries": [], "total_gross": 0, "total_deductions": 0, "total_net": 0, "unmatched_names": [], "error": "openpyxl not installed"}

    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return {"entries": [], "total_gross": 0, "total_deductions": 0, "total_net": 0, "unmatched_names": []}

    # First row is header
    headers = [str(h).strip().lower().replace(" ", "_") if h else "" for h in rows[0]]

    entries = []
    for row in rows[1:]:
        normed = {headers[i]: row[i] for i in range(len(headers)) if i < len(row)}

        name = normed.get("employee_name") or normed.get("name") or ""
        if isinstance(name, (int, float)):
            name = str(name)
        name = str(name).strip()
        if not name:
            continue

        gross = _parse_number(normed.get("gross_salary") or normed.get("gross") or 0)
        deductions = _parse_number(normed.get("deductions") or 0)
        net = _parse_number(normed.get("net_salary") or normed.get("net") or 0)

        known_keys = {"employee_name", "name", "gross_salary", "gross", "deductions", "net_salary", "net"}
        details = {k: str(v) for k, v in normed.items() if k not in known_keys and v}

        entries.append({
            "employee_name": name,
            "gross_salary": gross,
            "deductions": deductions,
            "net_salary": net,
            "details": details if details else None,
        })

    wb.close()
    entries = _match_employees(entries, db, org_id)
    return _build_summary(entries)


def _parse_number(val) -> float:
    if isinstance(val, (int, float)):
        return float(val)
    try:
        cleaned = str(val).replace(",", "").replace(" ", "").strip()
        return float(cleaned) if cleaned else 0.0
    except (ValueError, TypeError):
        return 0.0


def _build_summary(entries: list[dict]) -> dict:
    total_gross = sum(e["gross_salary"] for e in entries)
    total_deductions = sum(e["deductions"] for e in entries)
    total_net = sum(e["net_salary"] for e in entries)
    unmatched = [e["employee_name"] for e in entries if not e.get("matched_user_id")]

    # Check reconciliation: sum of nets should roughly equal total_gross - total_deductions
    expected_net = total_gross - total_deductions
    reconciled = abs(expected_net - total_net) < 0.01

    return {
        "entries": entries,
        "total_gross": round(total_gross, 2),
        "total_deductions": round(total_deductions, 2),
        "total_net": round(total_net, 2),
        "employee_count": len(entries),
        "matched_count": sum(1 for e in entries if e.get("matched_user_id")),
        "unmatched_names": unmatched,
        "reconciled": reconciled,
    }
