import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from typing import Optional


logger = logging.getLogger(__name__)


def _get_smtp_config() -> Optional[dict]:
    host = os.getenv("SMTP_HOST", "").strip()
    user = os.getenv("SMTP_USER", "").strip()
    password = os.getenv("SMTP_PASSWORD", "").strip() or os.getenv("SMTP_PASS", "").strip()
    from_email = os.getenv("SMTP_FROM_EMAIL", "").strip() or os.getenv("SMTP_FROM", "").strip()
    port_raw = os.getenv("SMTP_PORT", "").strip()

    if not host or not user or not password or not from_email:
        logger.warning("SMTP configuration incomplete; skipping email send.")
        return None

    try:
        port = int(port_raw) if port_raw else 465
    except ValueError:
        logger.warning("Invalid SMTP_PORT value %r; defaulting to 465.", port_raw)
        port = 465

    return {
        "host": host,
        "user": user,
        "password": password,
        "from_email": from_email,
        "port": port,
    }


def send_email(
    to_email: str,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
) -> None:
    """
    Basic SMTP email sender.

    - Uses environment variables for configuration:
      - SMTP_HOST
      - SMTP_PORT (optional, defaults to 465)
      - SMTP_USER
      - SMTP_PASSWORD or SMTP_PASS
      - SMTP_FROM_EMAIL or SMTP_FROM
    - Logs and no-ops if configuration is missing.
    """
    cfg = _get_smtp_config()
    if not cfg:
        return

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = cfg["from_email"]
    msg["To"] = to_email
    msg.set_content(text_body)
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    context = ssl.create_default_context()
    try:
        with smtplib.SMTP_SSL(cfg["host"], cfg["port"], context=context) as server:
            server.login(cfg["user"], cfg["password"])
            server.send_message(msg)
    except Exception:
        logger.exception("Failed to send email to %s", to_email)


def send_hr_admin_welcome_email(
    to_email: str,
    full_name: str,
    org_name: str,
    temporary_password: str,
    login_url: Optional[str] = None,
) -> None:
    """
    Convenience wrapper for sending the HR admin welcome email when a new
    HR admin account is created for a client organization.
    """
    login_url = (login_url or os.getenv("HRADMIN_LOGIN_URL", "")).strip() or "https://app.rafiki.local/hradmin/login"

    display_name = full_name or to_email
    org_label = org_name or "your organization"

    subject = f"Your Rafiki HR admin account for {org_label}"

    text_body = (
        f"Hi {display_name},\n\n"
        f"A Rafiki HR admin account has been created for {org_label}.\n\n"
        f"Login URL: {login_url}\n"
        f"Email: {to_email}\n"
        f"Temporary password: {temporary_password}\n\n"
        "For security, please log in as soon as possible and change your password.\n\n"
        "If you were not expecting this email, please contact your Rafiki representative.\n\n"
        "Best regards,\n"
        "The Rafiki Team\n"
    )

    html_body = (
        f"<p>Hi {display_name},</p>"
        f"<p>A <strong>Rafiki HR admin</strong> account has been created for <strong>{org_label}</strong>.</p>"
        f"<p>"
        f"<strong>Login URL:</strong> <a href=\"{login_url}\">{login_url}</a><br>"
        f"<strong>Email:</strong> {to_email}<br>"
        f"<strong>Temporary password:</strong> {temporary_password}"
        f"</p>"
        "<p>For security, please log in as soon as possible and change your password.</p>"
        "<p>If you were not expecting this email, please contact your Rafiki representative.</p>"
        "<p>Best regards,<br>The Rafiki Team</p>"
    )

    send_email(to_email=to_email, subject=subject, text_body=text_body, html_body=html_body)

