from datetime import datetime
from types import SimpleNamespace

from app.routers.super_admin import _receipt_number, _serialize_payment


def test_receipt_number_uses_year_and_payment_prefix():
    payment = SimpleNamespace(
        id="abcde123-1234-5678-9999-000000000000",
        received_at=datetime(2026, 5, 1, 10, 30),
        method="bank_transfer",
        amount_minor=150000,
        currency="KES",
        reference="INV-001",
        attachment_storage_key="receipt.png",
    )

    assert _receipt_number(payment) == "RCT-2026-ABCDE123"


def test_serialize_payment_exposes_receipt_metadata():
    payment = SimpleNamespace(
        id="abcde123-1234-5678-9999-000000000000",
        received_at=datetime(2026, 5, 1, 10, 30),
        method="bank_transfer",
        amount_minor=150000,
        currency="KES",
        reference="INV-001",
        attachment_storage_key="receipt.png",
    )

    data = _serialize_payment(payment)

    assert data["amount"] == 1500
    assert data["method"] == "bank_transfer"
    assert data["has_attachment"] is True
    assert data["receipt_number"] == "RCT-2026-ABCDE123"
