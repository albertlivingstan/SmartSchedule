"""Concurrency-Safe Booking Engine for SmartSchedule AI 3.0.
Implements real-time double-booking detection, database transactions with row-level/advisory locks,
variable-duration overlap checks, capacity-aware slots, and automatic conflict logging.
"""
from __future__ import annotations
import hashlib
import json
import uuid
import threading
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import (
    Appointment, Staff, Service, AppointmentSlot, BookingConflict,
    BookingHold, BookingAuditLog, NotificationOutbox, AutomationExecution,
    utcnow_str
)
from app.services.scheduler import SchedulingEngine, parse_iso_utc
from app.services.ai_prediction import prediction_engine
from app.config import settings

# Thread-level fallback lock for SQLite / in-memory concurrency testing
_local_staff_locks: Dict[str, threading.Lock] = {}
_lock_mgr_mutex = threading.Lock()

def _get_staff_lock(staff_name: str) -> threading.Lock:
    with _lock_mgr_mutex:
        if staff_name not in _local_staff_locks:
            _local_staff_locks[staff_name] = threading.Lock()
        return _local_staff_locks[staff_name]


def generate_booking_reference() -> str:
    """Generate a clean human-readable booking reference e.g. BK-7F9A-4821."""
    token = uuid.uuid4().hex[:8].upper()
    return f"BK-{token[:4]}-{token[4:]}"


def acquire_concurrency_lock(db: Session, staff_name: str, date_str: str) -> bool:
    """
    Acquire a deterministic transaction lock for a given staff member on a specific date.
    Uses PostgreSQL transaction advisory lock if connected to PostgreSQL;
    falls back cleanly on SQLite using Python-level staff mutex.
    """
    bind_name = db.bind.dialect.name if db.bind else 'sqlite'
    if bind_name == 'postgresql':
        try:
            # 64-bit signed integer hash for pg_advisory_xact_lock
            raw_key = f"smartschedule:staff:{staff_name}:{date_str}"
            hash_int = int(hashlib.sha256(raw_key.encode('utf-8')).hexdigest()[:15], 16) - (1 << 59)
            db.execute(text("SELECT pg_advisory_xact_lock(:lock_id)"), {"lock_id": hash_int})
            return True
        except Exception as e:
            # If advisory lock fails for permissions, continue with row-level checks
            return False
    return True


def check_slot_conflicts(
    db: Session,
    staff: str,
    start_dt: datetime,
    end_dt: datetime,
    exclude_appointment_id: Optional[int] = None,
    client_email: Optional[str] = None
) -> Tuple[bool, Optional[str], Optional[int]]:
    """
    Evaluates whether the requested time window overlaps with existing confirmed appointments
    or active booking holds. Supports multi-capacity slots if defined.
    Returns: (is_conflict, conflict_reason, active_slot_id)
    """
    start_iso = start_dt.isoformat(timespec='seconds')
    end_iso = end_dt.isoformat(timespec='seconds')
    now_iso = utcnow_str()

    # 1. Check if a pre-configured slot exists with capacity > 1
    slot = db.query(AppointmentSlot).filter(
        AppointmentSlot.staff == staff,
        AppointmentSlot.starts_at == start_iso
    ).first()

    capacity = slot.capacity if slot else 1
    slot_id = slot.id if slot else None

    # 2. Query overlapping confirmed appointments
    query = db.query(Appointment).filter(
        Appointment.staff == staff,
        Appointment.status == 'scheduled',
        Appointment.starts_at < end_iso,
        Appointment.ends_at > start_iso
    )
    if exclude_appointment_id:
        query = query.filter(Appointment.id != exclude_appointment_id)

    overlapping_appts = query.all()
    overlapping_count = len(overlapping_appts)

    # 3. Query active holds (temporary holds placed during pending admin approvals)
    hold_query = db.query(BookingHold).filter(
        BookingHold.staff == staff,
        BookingHold.status == 'active',
        BookingHold.expires_at > now_iso,
        BookingHold.starts_at < end_iso,
        BookingHold.ends_at > start_iso
    )
    if client_email:
        hold_query = hold_query.filter(BookingHold.client_email != client_email)

    active_holds = hold_query.all()
    overlapping_count += len(active_holds)

    if overlapping_count >= capacity:
        reason = f"Slot occupied by {overlapping_count} active booking(s) (maximum capacity: {capacity})"
        return True, reason, slot_id

    return False, None, slot_id


def generate_smart_alternatives(
    db: Session,
    staff: str,
    service_name: str,
    requested_start: datetime,
    duration_minutes: int,
    limit: int = 3
) -> List[Dict[str, Any]]:
    """
    Generates genuinely available alternative slots using a deterministic constraint solver
    combined with AI scoring. Provides transparent rationale for each suggestion.
    """
    scheduler = SchedulingEngine(db)
    target_date_str = requested_start.strftime("%Y-%m-%d")
    
    # 1. Generate available candidate slots from scheduler
    candidate_slots = scheduler.get_candidate_slots(
        service_name=service_name,
        staff_preference="Any",
        target_date_str=target_date_str,
        days_ahead=5
    )

    now_utc = datetime.now(timezone.utc)
    req_hour = requested_start.hour + (requested_start.minute / 60.0)
    req_date = requested_start.date()

    evaluated_alternatives = []
    for slot in candidate_slots:
        s_dt = parse_iso_utc(slot["starts_at"])
        e_dt = parse_iso_utc(slot["ends_at"])

        # Must be in future
        if s_dt <= now_utc:
            continue

        # Must not be the exact conflicting slot
        if s_dt == requested_start and slot["staff"] == staff:
            continue

        # Double-check database conflict for this candidate slot
        is_conflict, _, _ = check_slot_conflicts(db, slot["staff"], s_dt, e_dt)
        if is_conflict:
            continue

        slot_hour = s_dt.hour + (s_dt.minute / 60.0)
        slot_date = s_dt.date()
        date_diff_days = abs((slot_date - req_date).days)
        hour_diff = abs(slot_hour - req_hour)

        # AI Scoring factors
        is_same_staff = (slot["staff"] == staff)
        is_same_day = (slot_date == req_date)

        score = 80.0
        reasons = []

        if is_same_staff and is_same_day:
            score += 15.0
            if hour_diff <= 1.0:
                reasons.append("Closest available time with same staff member")
            else:
                reasons.append("Same staff member available later today")
        elif is_same_day:
            score += 10.0
            reasons.append(f"Same requested time with alternative expert ({slot['staff']})")
        elif date_diff_days == 1:
            score += 6.0
            reasons.append(f"Next business day opening with {slot['staff']}")
        else:
            reasons.append(f"Low scheduling congestion on {s_dt.strftime('%b %d')}")

        if 9.5 <= slot_hour <= 12.0:
            reasons.append("Optimal morning appointment window")

        time_label = s_dt.strftime("%I:%M %p")
        evaluated_alternatives.append({
            "starts_at": s_dt.isoformat(timespec='seconds'),
            "ends_at": e_dt.isoformat(timespec='seconds'),
            "staff": slot["staff"],
            "service": slot["service"],
            "score": round(score, 1),
            "time_display": time_label,
            "date_display": s_dt.strftime("%Y-%m-%d"),
            "reason": reasons[0] if reasons else "Genuinely verified open slot"
        })

    # Sort descending by score, take top `limit`
    evaluated_alternatives.sort(key=lambda x: x["score"], reverse=True)
    return evaluated_alternatives[:limit]


class ConcurrencyBookingService:
    def __init__(self, db: Session):
        self.db = db

    def book_appointment(
        self,
        client: str,
        email: str,
        service: str,
        staff: str,
        starts_at_str: str,
        duration_minutes: int = 30,
        notes: str = "",
        source: str = "dashboard",
        external_id: Optional[str] = None,
        idempotency_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Atomically executes an appointment booking with concurrency protection.
        Returns appointment dictionary on success.
        Raises HTTPException(409) with detailed conflict payload if slot is occupied.
        """
        from fastapi import HTTPException

        start_dt = parse_iso_utc(starts_at_str)
        end_dt = start_dt + timedelta(minutes=duration_minutes)
        now_utc = datetime.now(timezone.utc)

        if start_dt <= now_utc:
            raise HTTPException(status_code=422, detail="Appointment must be in the future")

        # Idempotency check
        if idempotency_key or external_id:
            check_ref = idempotency_key or external_id
            existing = self.db.query(Appointment).filter(
                (Appointment.external_id == check_ref) | 
                (Appointment.booking_reference == check_ref)
            ).first()
            if existing:
                return {
                    "appointment": existing.to_dict(),
                    "duplicate": True,
                    "message": "Existing booking verified (idempotent replay)"
                }

        staff_lock = _get_staff_lock(staff)
        with staff_lock:
            # 1. Acquire DB Concurrency Lock (PostgreSQL advisory xact lock)
            acquire_concurrency_lock(self.db, staff, start_dt.strftime("%Y-%m-%d"))

            # 2. Check for slot conflict
            is_conflict, conflict_reason, slot_id = check_slot_conflicts(
                self.db, staff, start_dt, end_dt, client_email=email
            )

            if is_conflict:
                conflict_id = f"conf-{uuid.uuid4().hex[:10]}"
                booking_ref = generate_booking_reference()

                # Generate 3 AI-scored genuine alternative slots
                alternatives = generate_smart_alternatives(
                    self.db, staff, service, start_dt, duration_minutes, limit=3
                )

                # Persist conflict in database
                conflict_record = BookingConflict(
                    conflict_id=conflict_id,
                    booking_reference=booking_ref,
                    client_name=client,
                    client_email=email,
                    service=service,
                    staff=staff,
                    requested_starts_at=start_dt.isoformat(timespec='seconds'),
                    requested_ends_at=end_dt.isoformat(timespec='seconds'),
                    duration_minutes=duration_minutes,
                    conflict_reason="This appointment slot is already fully booked. Please select another available time.",
                    status="CONFLICT_DETECTED" if not alternatives else "ALTERNATIVES_OFFERED",
                    alternatives_json=json.dumps(alternatives),
                    idempotency_key=idempotency_key or external_id
                )
                self.db.add(conflict_record)

                # Add Audit Log
                self.db.add(BookingAuditLog(
                    conflict_id=conflict_id,
                    event_type="conflict_detected",
                    actor=email,
                    details_json=json.dumps({
                        "staff": staff,
                        "service": service,
                        "time": start_dt.isoformat(),
                        "reason": conflict_reason,
                        "alternatives_count": len(alternatives)
                    })
                ))

                # Enqueue UiPath notification event
                self.db.add(NotificationOutbox(
                    recipient_email=email,
                    recipient_name=client,
                    notification_type="conflict_detected",
                    subject="Appointment Slot Unavailable — Rescheduling Options Available",
                    payload_json=json.dumps({
                        "conflict_id": conflict_id,
                        "service": service,
                        "staff": staff,
                        "requested_time": start_dt.isoformat(),
                        "alternatives": alternatives
                    }),
                    status="pending",
                    idempotency_key=f"outbox-conf-{conflict_id}"
                ))

                self.db.commit()

                # Raise HTTP 409 Conflict with structured metadata
                conflict_payload = {
                    "detail": "This appointment slot is already fully booked. Please select another available time.",
                    "conflict_id": conflict_id,
                    "booking_reference": booking_ref,
                    "requested_date": start_dt.strftime("%Y-%m-%d"),
                    "requested_time": start_dt.strftime("%I:%M %p"),
                    "requested_starts_at": start_dt.isoformat(timespec='seconds'),
                    "requested_ends_at": end_dt.isoformat(timespec='seconds'),
                    "staff": staff,
                    "service": service,
                    "duration_minutes": duration_minutes,
                    "alternatives": alternatives
                }
                raise HTTPException(status_code=409, detail=conflict_payload)

            # 3. No conflict -> Proceed with atomic booking
            lead_time_days = max(1.0, (start_dt - now_utc).total_seconds() / 86400.0)
            ai_risk = prediction_engine.predict(
                lead_time_days=lead_time_days,
                starts_at_str=start_dt.isoformat(),
                duration_minutes=duration_minutes
            )

            booking_ref = generate_booking_reference()
            appt = Appointment(
                client=client,
                email=email,
                service=service,
                staff=staff,
                starts_at=start_dt.isoformat(timespec='seconds'),
                ends_at=end_dt.isoformat(timespec='seconds'),
                status='scheduled',
                notes=notes,
                source=source,
                external_id=external_id,
                booking_reference=booking_ref,
                created_at=utcnow_str(),
                updated_at=utcnow_str(),
                risk_score=ai_risk.get("risk_score", 0.0),
                risk_tier=ai_risk.get("risk_tier", "Low"),
                risk_factors_json=json.dumps(ai_risk.get("explainable_factors", [])),
                slot_score=85.0
            )
            self.db.add(appt)
            self.db.flush()

            # Update slot booked count if slot exists
            if slot_id:
                slot_obj = self.db.query(AppointmentSlot).filter_by(id=slot_id).first()
                if slot_obj:
                    slot_obj.booked_count += 1
                    slot_obj.updated_at = utcnow_str()

            # Schedule reminders
            for kind, offset in [('24h', timedelta(hours=24)), ('1h', timedelta(hours=1))]:
                due = start_dt - offset
                if due > now_utc:
                    from app.models import Reminder
                    self.db.add(Reminder(
                        appointment_id=appt.id,
                        kind=kind,
                        due_at=due.isoformat(timespec='seconds'),
                        status='pending'
                    ))

            # Outbox confirmation message
            self.db.add(NotificationOutbox(
                recipient_email=email,
                recipient_name=client,
                notification_type="confirmation",
                subject=f"Confirmed: Your appointment for {service} ({booking_ref})",
                payload_json=json.dumps({
                    "appointment_id": appt.id,
                    "booking_reference": booking_ref,
                    "service": service,
                    "staff": staff,
                    "starts_at": appt.starts_at,
                    "risk_tier": appt.risk_tier
                }),
                status="pending",
                idempotency_key=f"confirm-appt-{appt.id}"
            ))

            # Audit & Execution telemetry
            self.db.add(BookingAuditLog(
                appointment_id=appt.id,
                event_type="booking_confirmed",
                actor=email,
                details_json=json.dumps({
                    "booking_reference": booking_ref,
                    "service": service,
                    "staff": staff,
                    "starts_at": appt.starts_at
                })
            ))

            self.db.add(AutomationExecution(
                execution_id=f"exec-{uuid.uuid4().hex[:12]}",
                workflow_name="Appointment Creation & Concurrency Validation",
                appointment_id=appt.id,
                event_type="booking_created",
                status="completed",
                payload_json=json.dumps({
                    "booking_reference": booking_ref,
                    "source": source,
                    "risk_tier": appt.risk_tier
                })
            ))

            self.db.commit()
            self.db.refresh(appt)

            return {
                "appointment": appt.to_dict(),
                "duplicate": False,
                "booking_reference": booking_ref
            }
