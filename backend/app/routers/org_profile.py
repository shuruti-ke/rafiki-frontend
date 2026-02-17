from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.org_profile import OrgProfile, RoleProfile
from app.schemas.org_profile import (
    OrgProfileCreate, OrgProfileUpdate, OrgProfileResponse,
    RoleProfileCreate, RoleProfileUpdate, RoleProfileResponse,
)

router = APIRouter(prefix="/api/v1/org-config", tags=["Org Config"])

DEMO_ORG_ID = 1


# ─── Org Profile (single per org) ────────────────────────────────────

@router.get("/profile", response_model=OrgProfileResponse)
def get_org_profile(db: Session = Depends(get_db)):
    profile = db.query(OrgProfile).filter(OrgProfile.org_id == DEMO_ORG_ID).first()
    if not profile:
        # Auto-create empty profile
        profile = OrgProfile(org_id=DEMO_ORG_ID)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@router.put("/profile", response_model=OrgProfileResponse)
def update_org_profile(payload: OrgProfileUpdate, db: Session = Depends(get_db)):
    profile = db.query(OrgProfile).filter(OrgProfile.org_id == DEMO_ORG_ID).first()
    if not profile:
        profile = OrgProfile(org_id=DEMO_ORG_ID)
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

@router.get("/roles", response_model=list[RoleProfileResponse])
def list_roles(db: Session = Depends(get_db)):
    return db.query(RoleProfile).filter(
        RoleProfile.org_id == DEMO_ORG_ID
    ).order_by(RoleProfile.role_key).all()


@router.post("/roles", response_model=RoleProfileResponse)
def create_role(payload: RoleProfileCreate, db: Session = Depends(get_db)):
    existing = db.query(RoleProfile).filter(
        RoleProfile.org_id == DEMO_ORG_ID,
        RoleProfile.role_key == payload.role_key,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Role '{payload.role_key}' already exists")

    role = RoleProfile(
        org_id=DEMO_ORG_ID,
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
def get_role(role_key: str, db: Session = Depends(get_db)):
    role = db.query(RoleProfile).filter(
        RoleProfile.org_id == DEMO_ORG_ID,
        RoleProfile.role_key == role_key,
    ).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.put("/roles/{role_key}", response_model=RoleProfileResponse)
def update_role(role_key: str, payload: RoleProfileUpdate, db: Session = Depends(get_db)):
    role = db.query(RoleProfile).filter(
        RoleProfile.org_id == DEMO_ORG_ID,
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


@router.delete("/roles/{role_key}")
def delete_role(role_key: str, db: Session = Depends(get_db)):
    role = db.query(RoleProfile).filter(
        RoleProfile.org_id == DEMO_ORG_ID,
        RoleProfile.role_key == role_key,
    ).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    db.delete(role)
    db.commit()
    return {"ok": True, "message": f"Role '{role_key}' deleted"}
