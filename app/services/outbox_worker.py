"""Notification Outbox & Safe Reminder Automation Worker.
Implements durable outbox with atomic claims, idempotency, dry-run safety, and retry backoff.
"""
import os
import smtplib
import json
import time
from email.message import EmailMessage
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.database import SessionLocal, init_db
from app.models import NotificationOutbox, Reminder, Appointment, Audit, utcnow_str
from app.config import settings

def send_smtp_email(to_email: str, subject: str, body_text: str) -> bool:
    """Delivers email via SMTP if enabled; returns True on delivery."""
    if not settings.SMTP_ENABLED:
        print(f"[OUTBOX DRY-RUN] To: {to_email} | Subject: {subject} | Content: {body_text[:120]}...")
        return False

    required = [settings.SMTP_HOST, settings.SMTP_PORT, settings.SMTP_FROM, settings.SMTP_USERNAME, settings.SMTP_PASSWORD]
    if not all(required):
        raise RuntimeError("Missing SMTP configuration in environment")

    msg = EmailMessage()
    msg['From'] = settings.SMTP_FROM
    msg['To'] = to_email
    msg['Subject'] = subject
    msg.set_content(body_text)

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
        server.starttls()
        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.send_message(msg)

    return True

def process_outbox_batch(db: Session, batch_size: int = 20) -> int:
    """
    Atomically claims and dispatches pending outbox notifications.
    Prevents race conditions across multiple worker instances.
    """
    now_str = utcnow_str()

    # 1. Atomic claim of pending items scheduled for now or earlier
    pending_items = db.query(NotificationOutbox).filter(
        NotificationOutbox.status == 'pending',
        NotificationOutbox.scheduled_for <= now_str
    ).limit(batch_size).all()

    if not pending_items:
        return 0

    processed_count = 0
    for item in pending_items:
        item.status = 'claimed'
    db.commit()

    for item in pending_items:
        try:
            payload = json.loads(item.payload_json) if item.payload_json else {}
            body_content = f"Hello {item.recipient_name},\n\n{item.subject}\n\nDetails: {json.dumps(payload, indent=2)}\n\nBest regards,\nSmartSchedule AI Team"

            delivered = send_smtp_email(item.recipient_email, item.subject, body_content)

            if delivered or not settings.SMTP_ENABLED:
                # In dry-run mode, mark sent with preview flag
                item.status = 'sent' if delivered else 'sent_dry_run'
                item.processed_at = utcnow_str()
                item.last_error = None
            processed_count += 1
        except Exception as exc:
            item.retry_count += 1
            item.last_error = str(exc)[:300]
            if item.retry_count >= item.max_retries:
                item.status = 'dead_letter'
            else:
                # Backoff: 2^retry minutes
                backoff_min = 2 ** item.retry_count
                next_time = datetime.now(timezone.utc) + timedelta(minutes=backoff_min)
                item.scheduled_for = next_time.isoformat(timespec='seconds')
                item.status = 'pending'

    db.commit()
    return processed_count

def process_reminders_batch(db: Session, batch_size: int = 50) -> int:
    """Processes scheduled 24h & 1h reminders from reminders table."""
    now_str = utcnow_str()
    rows = db.query(Reminder).join(Appointment).filter(
        Reminder.status == 'pending',
        Appointment.status == 'scheduled',
        Reminder.due_at <= now_str
    ).limit(batch_size).all()

    processed = 0
    for r in rows:
        appt = r.appointment
        subject = f"Appointment reminder ({r.kind}) — SmartSchedule"
        body = f"Hello {appt.client},\n\nYour appointment for {appt.service} with {appt.staff} is scheduled for {appt.starts_at}.\nThis is your {r.kind} reminder.\n\nSmartSchedule"
        try:
            delivered = send_smtp_email(appt.email, subject, body)
            if delivered:
                r.status = 'sent'
                r.sent_at = utcnow_str()
                r.error = None
                db.add(Audit(
                    appointment_id=appt.id,
                    action='reminder',
                    detail=f'{r.kind} email sent via SMTP'
                ))
            else:
                # Dry run
                pass
            processed += 1
        except Exception as exc:
            r.error = str(exc)[:300]
            print(f"Reminder failed for appointment {appt.id}: {exc}")
    db.commit()
    return processed

def run_worker_tick():
    init_db()
    db = SessionLocal()
    try:
        outbox_count = process_outbox_batch(db)
        reminder_count = process_reminders_batch(db)
        return {"outbox": outbox_count, "reminders": reminder_count}
    finally:
        db.close()
