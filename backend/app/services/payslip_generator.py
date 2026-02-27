"""
Generate individual payslip PDFs using reportlab.

Layout matches the existing Payslip.pdf template:
  - Org name + logo at top
  - Employee Details section (Name, Employee No, Month)
  - Earnings/deductions table
  - Net Monthly Salary highlighted at bottom
"""
import io
import logging
from typing import Optional

logger = logging.getLogger(__name__)

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
    REPORTLAB_OK = True
except Exception as _rl_err:
    REPORTLAB_OK = False
    logger.warning("reportlab unavailable — payslip PDF generation disabled. Reason: %s", _rl_err)


def _fmt(n) -> str:
    """Format a number as currency string."""
    if n is None:
        return "-"
    try:
        v = float(n)
        return f"{v:,.2f}"
    except (TypeError, ValueError):
        return str(n)


def generate_payslip_pdf(
    *,
    org_name: str,
    employee_name: str,
    employment_number: Optional[str],
    month: str,                  # e.g. "2026-02"
    gross_salary: float,
    housing: float = 0,
    transport: float = 0,
    nssf: float = 0,
    paye: float = 0,
    shif: float = 0,
    nhdf: float = 0,
    other_deductions: float = 0,
    other_additions: float = 0,
    total_deductions: float = 0,
    net_salary: float = 0,
    logo_bytes: Optional[bytes] = None,
    details: Optional[dict] = None,
) -> bytes:
    """
    Generate a payslip PDF and return the raw bytes.
    Falls back to a simple text layout if reportlab is unavailable.
    """
    if not REPORTLAB_OK:
        return _fallback_text_pdf(
            org_name=org_name, employee_name=employee_name,
            month=month, gross_salary=gross_salary,
            total_deductions=total_deductions, net_salary=net_salary,
        )

    # Parse month display string
    try:
        from datetime import datetime
        month_display = datetime.strptime(month, "%Y-%m").strftime("%B %Y")
    except Exception:
        month_display = month

    # Pull individual breakdown from details dict if available
    if details:
        housing = abs(float(details.get("housing", housing) or 0))
        transport = abs(float(details.get("transport", transport) or 0))
        nssf = abs(float(details.get("nssf", nssf) or 0))
        paye = abs(float(details.get("paye", paye) or 0))
        shif = abs(float(details.get("shif", shif) or 0))
        nhdf = abs(float(details.get("nhdf", nhdf) or 0))
        other_deductions = abs(float(details.get("other_deductions", other_deductions) or 0))
        other_additions = float(details.get("other_additions", other_additions) or 0)

    taxable_salary = gross_salary + housing + transport
    total_deductions_calc = nssf + paye + shif + nhdf + other_deductions

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=20*mm,
        rightMargin=20*mm,
        topMargin=15*mm,
        bottomMargin=15*mm,
    )

    styles = getSampleStyleSheet()
    bold = ParagraphStyle("bold", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=11)
    normal = ParagraphStyle("normal", parent=styles["Normal"], fontName="Helvetica", fontSize=10)
    small = ParagraphStyle("small", parent=styles["Normal"], fontName="Helvetica", fontSize=9, textColor=colors.grey)
    title_style = ParagraphStyle("title", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=16, alignment=TA_CENTER)
    org_style = ParagraphStyle("org", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=13, alignment=TA_CENTER)
    right = ParagraphStyle("right", parent=styles["Normal"], fontName="Helvetica", fontSize=10, alignment=TA_RIGHT)
    right_bold = ParagraphStyle("right_bold", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10, alignment=TA_RIGHT)

    page_w = A4[0] - 40*mm  # usable width
    col1 = page_w * 0.62
    col2 = page_w * 0.38

    story = []

    # ── Header: logo + org name ──────────────────────────────────────────
    if logo_bytes:
        try:
            logo_buf = io.BytesIO(logo_bytes)
            logo_img = Image(logo_buf, width=40*mm, height=15*mm, kind="proportional")
            logo_img.hAlign = "CENTER"
            story.append(logo_img)
            story.append(Spacer(1, 3*mm))
        except Exception:
            pass

    story.append(Paragraph(org_name, org_style))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph("PAYSLIP", title_style))
    story.append(Spacer(1, 5*mm))

    # ── Employee details box ─────────────────────────────────────────────
    emp_data = [
        [Paragraph("<b>Employee Details</b>", bold), ""],
        [Paragraph("Name:", normal), Paragraph(employee_name, bold)],
        [Paragraph("Employee No:", normal), Paragraph(employment_number or "—", normal)],
        [Paragraph("Month:", normal), Paragraph(month_display, bold)],
    ]
    emp_table = Table(emp_data, colWidths=[col1 * 0.4, col1 * 0.6])
    emp_table.setStyle(TableStyle([
        ("SPAN", (0, 0), (1, 0)),
        ("BACKGROUND", (0, 0), (1, 0), colors.HexColor("#1a1a2e")),
        ("TEXTCOLOR", (0, 0), (1, 0), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5f5")]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(emp_table)
    story.append(Spacer(1, 5*mm))

    # ── Earnings & Deductions table ───────────────────────────────────────
    header_bg = colors.HexColor("#2c3e50")
    section_bg = colors.HexColor("#ecf0f1")
    total_bg = colors.HexColor("#d5e8d4")
    net_bg = colors.HexColor("#1a3d28")

    rows = [
        # Header
        [Paragraph("<font color='white'><b>Description</b></font>", bold),
         Paragraph("<font color='white'><b>Amount (KES)</b></font>", right_bold)],
        # Earnings section
        [Paragraph("<b>EARNINGS</b>", bold), ""],
        [Paragraph("Gross Salary", normal), Paragraph(_fmt(gross_salary), right)],
    ]

    if housing:
        rows.append([Paragraph("Housing Allowance", normal), Paragraph(_fmt(housing), right)])
    if transport:
        rows.append([Paragraph("Transport Allowance", normal), Paragraph(_fmt(transport), right)])
    if other_additions:
        rows.append([Paragraph("Other Additions", normal), Paragraph(_fmt(other_additions), right)])

    rows.append([Paragraph("<b>Taxable Salary</b>", bold), Paragraph(f"<b>{_fmt(taxable_salary)}</b>", right_bold)])

    # Deductions section
    rows.append([Paragraph("<b>DEDUCTIONS</b>", bold), ""])
    if nssf:
        rows.append([Paragraph("NSSF Deduction", normal), Paragraph(_fmt(nssf), right)])
    if paye:
        rows.append([Paragraph("PAYE", normal), Paragraph(_fmt(paye), right)])
    if shif:
        rows.append([Paragraph("SHIF", normal), Paragraph(_fmt(shif), right)])
    if nhdf:
        rows.append([Paragraph("NHDF", normal), Paragraph(_fmt(nhdf), right)])
    if other_deductions:
        rows.append([Paragraph("Other Deductions", normal), Paragraph(_fmt(other_deductions), right)])

    rows.append([Paragraph("<b>Total Deductions</b>", bold),
                 Paragraph(f"<b>{_fmt(total_deductions_calc or total_deductions)}</b>", right_bold)])

    # Net salary row
    rows.append([
        Paragraph("<font color='white'><b>NET MONTHLY SALARY</b></font>", bold),
        Paragraph(f"<font color='white'><b>{_fmt(net_salary)}</b></font>", right_bold),
    ])

    tbl = Table(rows, colWidths=[col1, col2])

    # Build style commands
    n = len(rows)
    earnings_header_idx = 1
    def _find_row_idx(rows, keyword):
        for i, r in enumerate(rows):
            if hasattr(r[0], 'text') and keyword in r[0].text:
                return i
        return None

    taxable_idx = _find_row_idx(rows, "Taxable")
    deductions_header_idx = _find_row_idx(rows, "DEDUCTIONS")
    total_idx = _find_row_idx(rows, "Total Deductions")
    net_idx = n - 1

    style_cmds = [
        ("BACKGROUND", (0, 0), (1, 0), header_bg),
        ("BACKGROUND", (0, earnings_header_idx), (1, earnings_header_idx), section_bg),
        ("BACKGROUND", (0, net_idx), (1, net_idx), net_bg),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#dddddd")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("SPAN", (0, earnings_header_idx), (1, earnings_header_idx)),
    ]
    if deductions_header_idx is not None:
        style_cmds += [
            ("BACKGROUND", (0, deductions_header_idx), (1, deductions_header_idx), section_bg),
            ("SPAN", (0, deductions_header_idx), (1, deductions_header_idx)),
        ]
    if total_idx is not None:
        style_cmds.append(("BACKGROUND", (0, total_idx), (1, total_idx), colors.HexColor("#fce8b2")))

    tbl.setStyle(TableStyle(style_cmds))
    story.append(tbl)
    story.append(Spacer(1, 8*mm))

    # ── Footer ────────────────────────────────────────────────────────────
    story.append(Paragraph(
        "This is a computer-generated payslip and does not require a signature.",
        small,
    ))

    doc.build(story)
    return buf.getvalue()


def _fallback_text_pdf(*, org_name, employee_name, month, gross_salary, total_deductions, net_salary) -> bytes:
    """Minimal plain-text PDF if reportlab is not installed."""
    lines = [
        f"%PDF-1.4",
        "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
        "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
        "3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
    ]
    text = (
        f"BT /F1 14 Tf 50 800 Td ({org_name}) Tj\n"
        f"0 -25 Td (PAYSLIP - {month}) Tj\n"
        f"0 -30 Td (Employee: {employee_name}) Tj\n"
        f"0 -20 Td (Gross Salary: {gross_salary:,.2f}) Tj\n"
        f"0 -20 Td (Total Deductions: {total_deductions:,.2f}) Tj\n"
        f"0 -20 Td (Net Salary: {net_salary:,.2f}) Tj ET"
    )
    lines += [
        f"4 0 obj<</Length {len(text)}>>\nstream\n{text}\nendstream\nendobj",
        "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
        "xref\n0 6",
        "trailer<</Size 6/Root 1 0 R>>",
        "%%EOF",
    ]
    return "\n".join(lines).encode()
