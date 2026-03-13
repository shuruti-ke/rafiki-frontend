import pytest
from fastapi import HTTPException

import app.dependencies as dependencies


def test_require_admin_allows_hr_admin(monkeypatch):
    monkeypatch.setattr(dependencies, "get_current_role", lambda authorization=None, x_user_role=None, db=None: "hr_admin")

    assert dependencies.require_admin() == "hr_admin"


def test_require_super_admin_rejects_non_super_admin(monkeypatch):
    monkeypatch.setattr(dependencies, "get_current_role", lambda authorization=None, x_user_role=None, db=None: "manager")

    with pytest.raises(HTTPException) as exc:
        dependencies.require_super_admin()

    assert exc.value.status_code == 403
