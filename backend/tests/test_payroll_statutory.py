from app.routers.payroll_statutory import _build_batch_validation, _calculate_kenya, _default_config


def test_calculate_kenya_returns_expected_totals():
    cfg = _default_config()

    result = _calculate_kenya(
        gross_pay=100000,
        pension_contribution=0,
        insurance_relief_basis=0,
        cfg=cfg,
    )

    assert result["gross_pay"] == 100000
    # Taxable for PAYE = gross - nssf - shif - ahl (deducted before PAYE)
    assert result["taxable_pay"] < 100000
    assert result["taxable_pay"] == round(100000 - result["nssf"] - result["shif"] - result["ahl"], 2)
    assert result["statutory_total"] == round(result["paye"] + result["nssf"] + result["shif"] + result["ahl"], 2)
    assert result["estimated_net_pay"] == round(100000 - result["statutory_total"], 2)


def test_build_batch_validation_flags_variance_outside_tolerance():
    cfg = _default_config()
    # When declared statutory is all zero, we use expected for filing and do not flag review
    parsed_zero = {
        "entries": [
            {
                "employee_name": "Amina",
                "matched_user_id": "user-1",
                "gross_salary": 100000,
                "details": {"PAYE": "0", "NSSF": "0", "SHIF": "0", "AHL": "0"},
            }
        ]
    }
    validation_zero = _build_batch_validation(parsed_zero, cfg)
    assert validation_zero["summary"]["employee_count"] == 1
    assert validation_zero["summary"]["filing_from_calculated"] is True
    assert validation_zero["summary"]["needs_review_count"] == 0
    assert validation_zero["rows"][0]["status"] == "ok"

    # When declared is non-zero but far from expected, we flag for review
    parsed_mismatch = {
        "entries": [
            {
                "employee_name": "Bob",
                "matched_user_id": "user-2",
                "gross_salary": 100000,
                "details": {"PAYE": "100", "NSSF": "0", "SHIF": "0", "AHL": "0"},
            }
        ]
    }
    validation_mismatch = _build_batch_validation(parsed_mismatch, cfg)
    assert validation_mismatch["summary"]["employee_count"] == 1
    assert validation_mismatch["summary"]["needs_review_count"] == 1
    assert validation_mismatch["rows"][0]["status"] == "review"
    assert validation_mismatch["rows"][0]["variance"] != 0
