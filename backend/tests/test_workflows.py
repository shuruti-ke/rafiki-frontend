from datetime import date

from app.routers.workflows import _normalize_tasks


def test_normalize_tasks_accepts_strings_and_dicts():
    tasks = _normalize_tasks(
        [
            "Collect laptop",
            {"title": "Disable access", "owner_type": "it", "due_date": "2026-03-20"},
            {"title": " "},
        ],
        "offboarding",
    )

    assert len(tasks) == 2
    assert tasks[0]["title"] == "Collect laptop"
    assert tasks[0]["owner_type"] == "admin"
    assert tasks[1]["owner_type"] == "it"
    assert tasks[1]["due_date"] == date(2026, 3, 20)


def test_normalize_tasks_uses_default_templates():
    tasks = _normalize_tasks(None, "onboarding")

    assert len(tasks) == 4
    assert all(task["owner_type"] == "employee" for task in tasks)
    assert all(isinstance(task["due_date"], date) for task in tasks)
