# Handover notes for a new agent

**Purpose:** Bring a new agent up to speed on the Rafiki project, recent payroll work, and where to look for things.

---

## Project overview

- **Rafiki** — HR/local-first app: FastAPI backend, React (Vite) frontend.
- **Repos:** This workspace is `rafiki-local`. Git has two remotes:
  - `origin` → https://github.com/shuruti-ke/rafiki-at-work.git
  - `vercel` → https://github.com/shuruti-ke/rafiki-frontend.git
- **Push:** Often “push to both” means `git push origin master && git push vercel master`.

---

## Tech stack

| Layer    | Stack |
|----------|--------|
| Backend  | Python 3, FastAPI, SQLAlchemy, Alembic, PostgreSQL (R2/S3 for files) |
| Frontend | React (Vite), React Router |
| Auth     | JWT; roles: `manager`, `hr_admin`, `super_admin`, employee |

---

## Key directories

| Path | Purpose |
|------|---------|
| `backend/app/routers/payroll.py` | Payroll API: batches, run-monthly, approve, reject, parse, distribute, parse-and-distribute, send-back, notifications |
| `backend/app/routers/payroll_statutory.py` | Kenya statutory: PAYE bands, NSSF/SHIF/AHL, config, validation, `_calculate_kenya()` |
| `backend/app/models/payroll.py` | PayrollTemplate, PayrollBatch, Payslip, **PayrollRunAdjustment** |
| `backend/alembic/versions/` | Migrations (e.g. `045_payroll_run_adjustments.py`) |
| `frontend/src/pages/AdminPayroll.jsx` | Payroll UI: tabs (Approve, Batches, Payroll Run, Compliance), 3-step flow, prepare pay, send back |
| `frontend/src/components/ManagerLayout.jsx` | Manager nav; payroll link + notification message |
| `frontend/src/components/AdminLayout.jsx` | HR portal nav; payroll link + notification message |
| `frontend/src/components/EmployeeLayout.jsx` | Employee nav; payroll link when they have payroll access |

---

## Payroll flow (3 steps, one per person)

1. **Thomas (creator)** — Step 1: Prepare pay (optional run adjustments), then **Run for Month** or upload file.  
   - Batch created in `uploaded_needs_approval`.  
   - Permission: `can_process_payroll`.

2. **Finance manager** — Step 2: **Approve** (or Reject).  
   - Batch moves to `uploaded`.  
   - Permission: `can_authorize_payroll` (or super_admin).  
   - Reject keeps status `uploaded_needs_approval`.

3. **HR admin** — Step 3: **Parse & distribute** (single action) or **Send back** if there’s an issue.  
   - Parse & distribute: parses file, issues payslips, batch → `distributed`.  
   - Send back: batch returns to `uploaded_needs_approval`; creator and finance get a DM with reason.  
   - Permission: `hr_admin` or super_admin (`require_can_distribute_payroll`).

**Relevant APIs:**

- `POST /api/v1/payroll/run-monthly?month=YYYY-MM` — create batch from profiles (+ run adjustments).
- `GET /api/v1/payroll/run-preview?month=YYYY-MM` — preview pay with adjustments and statutory (for Thomas).
- `PUT /api/v1/payroll/run-adjustments` — save per-employee adjustments (bonus, deductions, pension, loan, etc.).
- `POST /api/v1/payroll/batches/{id}/approve` — finance manager approves.
- `POST /api/v1/payroll/batches/{id}/reject` — reject when status is `uploaded_needs_approval`.
- `POST /api/v1/payroll/batches/{id}/parse-and-distribute` — HR admin: parse + distribute in one call.
- `POST /api/v1/payroll/batches/{id}/send-back?reason=...` — HR admin: send approved batch back for fixes.
- `GET /api/v1/payroll/notifications` — counts for nav (awaiting_approval, ready_to_parse, ready_to_distribute).

---

## Payroll run adjustments (Thomas)

- **Table:** `payroll_run_adjustments` (per org, period_year, period_month, user_id): base_salary_override, bonus, pension_optional, insurance_relief_basis, loan_repayment, other_deductions, notes.
- **Tax:** Same as main payroll: `_calculate_kenya(gross, pension, insurance_relief_basis, cfg)`. Gross = base + bonus; loan/other are post-tax.
- **UI:** Payroll Run tab → “Prepare pay for month” (when user has `can_process_payroll`): load preview, edit bonus/deductions/pension/loan/base override, save adjustments, then Run for Month uses them.

---

## Statutory (Kenya)

- **Config:** `payroll_statutory_configs`; default tax bands from KRA (Finance Act 2023, effective 1 July 2023): 10%, 25%, 30%, 32.5%, 35% bands. Personal relief 2,400/month; insurance relief 15% cap 5,000/month.
- **Source:** https://www.kra.go.ke/individual/filing-paying/types-of-taxes/paye
- **Calculation:** `payroll_statutory._calculate_kenya(gross_pay, pension_contribution, insurance_relief_basis, cfg)` → paye, nssf, shif, ahl, statutory_total, estimated_net_pay.

---

## Nav notifications (payroll icon)

- **Backend:** `GET /api/v1/payroll/notifications` returns `awaiting_approval`, `ready_to_parse`, `ready_to_distribute`.
- **Frontend:** ManagerLayout, AdminLayout, EmployeeLayout fetch this when user has payroll access and show a short message under/near “Payroll” (e.g. “2 awaiting your approval”, “1 to parse · 0 to distribute”) and optional badge for finance manager.

---

## Dependencies / permissions (backend)

- `require_payroll_access` — any payroll permission.
- `require_can_approve_payroll` — finance manager only (approve endpoint).
- `require_can_parse_payroll` — HR admin only (parse; in 3-step flow parse is part of parse-and-distribute).
- `require_can_distribute_payroll` — HR admin only (distribute, parse-and-distribute, send-back).
- `_require_payroll_processor(current_user)` — for run-monthly, run-preview, run-adjustments (Thomas).

---

## Running and testing

```powershell
# Backend
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
# → http://localhost:5173

# Migrations
cd backend && python -m alembic upgrade head

# Payroll statutory tests
cd backend && python -m pytest tests/test_payroll_statutory.py -v
```

---

## Recent commit (for context)

- **339a848** — Payroll: 3-step flow (Create/Approve/Parse&distribute), HR send-back, nav notifications, KRA tax bands.
- Includes: parse-and-distribute endpoint, send-back endpoint, AdminPayroll UI updates, payroll notifications in layouts, KRA tax band updates and test fix.

---

## Where to look next

- **Change approval flow:** `backend/app/routers/payroll.py` (approve/reject/send-back), `backend/app/dependencies.py` (require_can_*).
- **Change statutory logic:** `backend/app/routers/payroll_statutory.py` and `_calculate_kenya`.
- **Change payroll UI / steps:** `frontend/src/pages/AdminPayroll.jsx`.
- **Change who sees what in nav:** `ManagerLayout.jsx`, `AdminLayout.jsx`, `EmployeeLayout.jsx` and their payroll notification logic.
- **Add a new payroll action:** Add route in `payroll.py`, then button/handler in `AdminPayroll.jsx` (and BatchesTab if batch-detail action).
- **Employee profile sections (dependents, work experience, education, assets, documents):** Backend models in `backend/app/models/employee_extended.py` and `employee_profile.py` (marital_status, number_of_dependents); API in `backend/app/routers/employee_profile_sections.py` and `employee_docs.py`; UI in `frontend/src/pages/AdminEmployeeDetail.jsx`.

---

*Generated for agent handover. Update this file when making large workflow or structural changes.*
