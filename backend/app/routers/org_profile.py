import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_org_id, get_current_user_id, require_admin
from app.models.org_profile import OrgProfile, RoleProfile
from app.models.user import Organization
from app.schemas.org_profile import (
    OrgProfileCreate, OrgProfileUpdate, OrgProfileResponse,
    RoleProfileCreate, RoleProfileUpdate, RoleProfileResponse,
)
from app.services.file_storage import save_upload, get_download_url

router = APIRouter(prefix="/api/v1/org-config", tags=["Org Config"])


# ─── Org Profile (single per org) ────────────────────────────────────

@router.get("/profile", response_model=OrgProfileResponse)
def get_org_profile(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    profile = db.query(OrgProfile).filter(OrgProfile.org_id == org_id).first()
    if not profile:
        profile = OrgProfile(org_id=org_id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@router.put("/profile", response_model=OrgProfileResponse)
def update_org_profile(
    payload: OrgProfileUpdate,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    profile = db.query(OrgProfile).filter(OrgProfile.org_id == org_id).first()
    if not profile:
        profile = OrgProfile(org_id=org_id)
        db.add(profile)
        db.commit()
        db.refresh(profile)

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(profile, key, value)
    db.commit()
    db.refresh(profile)
    return profile


# ─── Role Profiles (multiple per org) ────────────────────────────────

@router.get("/roles/debug")
def debug_roles(db: Session = Depends(get_db)):
    """Temporary debug endpoint — returns raw DB state."""
    from sqlalchemy import text
    try:
        cols = db.execute(text(
            "SELECT column_name, data_type FROM information_schema.columns "
            "WHERE table_name = 'role_profiles' ORDER BY ordinal_position"
        )).fetchall()
        constraints = db.execute(text(
            "SELECT conname, contype::text FROM pg_constraint "
            "WHERE conrelid = 'role_profiles'::regclass"
        )).fetchall()
        # Try raw select
        rows = db.execute(text("SELECT * FROM role_profiles LIMIT 3")).fetchall()
        return {
            "columns": [{"col": r[0], "type": r[1]} for r in cols],
            "constraints": [{"name": r[0], "type": r[1]} for r in constraints],
            "sample_rows": [list(r) for r in rows],
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/roles")
def list_roles(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    try:
        roles = db.query(RoleProfile).filter(
            RoleProfile.org_id == org_id
        ).order_by(RoleProfile.role_key).all()
        return [
            {
                "org_id": str(r.org_id),
                "role_key": r.role_key,
                "role_family": r.role_family,
                "seniority_band": r.seniority_band,
                "work_pattern": r.work_pattern,
                "stressor_profile": r.stressor_profile or [],
                "created_at": r.created_at,
                "updated_at": r.updated_at,
            }
            for r in roles
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/roles", response_model=RoleProfileResponse)
def create_role(
    payload: RoleProfileCreate,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    existing = db.query(RoleProfile).filter(
        RoleProfile.org_id == org_id,
        RoleProfile.role_key == payload.role_key,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Role '{payload.role_key}' already exists")

    role = RoleProfile(
        org_id=org_id,
        role_key=payload.role_key,
        role_family=payload.role_family,
        seniority_band=payload.seniority_band,
        work_pattern=payload.work_pattern,
        stressor_profile=payload.stressor_profile,
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


@router.get("/roles/{role_key}", response_model=RoleProfileResponse)
def get_role(
    role_key: str,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    role = db.query(RoleProfile).filter(
        RoleProfile.org_id == org_id,
        RoleProfile.role_key == role_key,
    ).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.put("/roles/{role_key}", response_model=RoleProfileResponse)
def update_role(
    role_key: str,
    payload: RoleProfileUpdate,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    role = db.query(RoleProfile).filter(
        RoleProfile.org_id == org_id,
        RoleProfile.role_key == role_key,
    ).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(role, key, value)
    db.commit()
    db.refresh(role)
    return role


@router.post("/logo")
def upload_org_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    """Upload or replace the organisation logo. Stored in R2, key saved on orgs table."""
    storage_key, _, _ = save_upload(file, subfolder="org_logos")
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")
    org.logo_storage_key = storage_key
    db.commit()
    url = get_download_url(storage_key)
    return {"ok": True, "logo_url": url, "storage_key": storage_key}


@router.get("/logo")
def get_org_logo(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    """Return a presigned URL for the org logo, or null if none uploaded."""
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org or not getattr(org, "logo_storage_key", None):
        return {"logo_url": None}
    url = get_download_url(org.logo_storage_key)
    return {"logo_url": url}


@router.delete("/roles/{role_key}")
def delete_role(
    role_key: str,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    role = db.query(RoleProfile).filter(
        RoleProfile.org_id == org_id,
        RoleProfile.role_key == role_key,
    ).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    db.delete(role)
    db.commit()
    return {"ok": True, "message": f"Role '{role_key}' deleted"}
