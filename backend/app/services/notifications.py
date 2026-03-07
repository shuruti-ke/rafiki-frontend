# app/services/notifications.py
"""
Rafiki notification service.

Currently supports in-app notifications (stored in DB) and optional email
via SendGrid if SENDGRID_API_KEY is set.

send_reminder_notification() is the main entry point called from the
announcements router when an admin sends a read reminder.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from uuid import UUID

logger = logging.getLogger(__name__)

# ── Optional SendGrid ──────────────────────────────────────────────────────────
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "").strip()
SENDGRID_FROM    = os.getenv("SENDGRID_FROM_EMAIL", "noreply@rafikihr.com").strip()
FRONTEND_URL     = os.getenv("FRONTEND_URL", "https://rafikihr.com").strip().rstrip("/")


# ── Public entry point ─────────────────────────────────────────────────────────

def send_reminder_notification(
    *,
    user,                       # app.models.user.User ORM instance
    announcement_id: UUID,
    announcement_title: str,
) -> None:
    """
    Dispatch a reminder to a single employee who hasn't read the announcement.
    Always stores an in-app notification row; also sends email if configured.
    Failures are logged but never raised — callers should not crash on this.
    """
    try:
        _store_in_app(user=user, announcement_id=announcement_id, title=announcement_title)
    except Exception:
        logger.exception("Failed to store in-app notification for user %s", getattr(user, "user_id", "?"))

    if SENDGRID_API_KEY:
        try:
            _send_email_sendgrid(user=user, announcement_id=announcement_id, title=announcement_title)
        except Exception:
            logger.exception("Failed to send reminder email to user %s", getattr(user, "user_id", "?"))
    else:
        logger.info(
            "Reminder email skipped (no SENDGRID_API_KEY) — user=%s announcement=%s",
            getattr(user, "user_id", "?"),
            announcement_id,
        )


# ── In-app notification ────────────────────────────────────────────────────────

def _store_in_app(*, user, announcement_id: UUID, title: str) -> None:
    """
    Persist a notification row so the employee sees a badge in the portal.
    Imports DB lazily to avoid circular imports at module load time.
    """
    from app.database import SessionLocal
    from app.models.notification import Notification  # see model stub below

    db = SessionLocal()
    try:
        notif = Notification(
            user_id=user.user_id,
            org_id=user.org_id,
            kind="announcement_reminder",
            title="Reminder: Please read an announcement",
            body=f'You have not yet read "{title}". Tap to view it.',
            link=f"{FRONTEND_URL}/announcements/{announcement_id}",
            created_at=datetime.now(timezone.utc),
        )
        db.add(notif)
        db.commit()
        logger.info("In-app notification created for user %s", user.user_id)
    finally:
        db.close()


# ── SendGrid email ─────────────────────────────────────────────────────────────

def _send_email_sendgrid(*, user, announcement_id: UUID, title: str) -> None:
    """
    Send a reminder email via SendGrid.
    Requires: pip install sendgrid
    Env vars:  SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, FRONTEND_URL
    """
    try:
        import sendgrid                              # type: ignore
        from sendgrid.helpers.mail import Mail      # type: ignore
    except ImportError:
        logger.warning("sendgrid package not installed — skipping email reminder")
        return

    recipient_email = getattr(user, "email", None)
    if not recipient_email:
        logger.warning("User %s has no email — skipping reminder email", user.user_id)
        return

    # User model has `name` (full name) — use first word as greeting
    full_name  = getattr(user, "name", None) or ""
    first_name = full_name.split()[0] if full_name.strip() else "there"
    ann_url    = f"{FRONTEND_URL}/announcements/{announcement_id}"

    html_body = f"""
    <div style="font-family: 'Source Sans 3', Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">
      <div style="background: #8b5cf6; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <span style="color: #fff; font-size: 20px; font-weight: 700; letter-spacing: -0.3px;">Rafiki HR</span>
      </div>
      <div style="background: #fff; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
        <p style="margin: 0 0 16px; font-size: 16px;">Hi {first_name},</p>
        <p style="margin: 0 0 16px; font-size: 15px; color: #374151;">
          Your HR team sent a reminder that you haven't yet read the following announcement:
        </p>
        <div style="background: #f5f3ff; border-left: 4px solid #8b5cf6; padding: 14px 18px; border-radius: 4px; margin: 0 0 24px;">
          <strong style="font-size: 15px; color: #1f2937;">{title}</strong>
        </div>
        <a href="{ann_url}"
           style="display: inline-block; background: #8b5cf6; color: #fff; text-decoration: none;
                  padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 15px;">
          Read Now →
        </a>
        <p style="margin: 28px 0 0; font-size: 13px; color: #9ca3af;">
          You're receiving this because your organisation uses Rafiki HR.
        </p>
      </div>
    </div>
    """

    message = Mail(
        from_email=SENDGRID_FROM,
        to_emails=recipient_email,
        subject=f"Reminder: Please read \"{title}\"",
        html_content=html_body,
    )

    sg = sendgrid.SendGridAPIClient(api_key=SENDGRID_API_KEY)
    response = sg.send(message)
    logger.info(
        "Reminder email sent to %s — status %s", recipient_email, response.status_code
    )
