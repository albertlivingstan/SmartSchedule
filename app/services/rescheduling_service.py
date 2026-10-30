"""Rescheduling & Approval Service for SmartSchedule AI 3.0.
Handles Customer Approval (Mode A), Administrator Sign-Off (Mode B),
atomic slot revalidation, temporary holds, and state transitions.
"""
from __future__ import annotations
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models import (
    BookingConflict, ReschedulingRequest, BookingHold, BookingAuditLog,
    Appointment, Service, Staff, NotificationOutbox, AutomationExecution,
    utcnow_str
)
from app.services.scheduler import parse_iso_utc
from app.services.concurrency_booking import (
    acquire_concurrency_lock, check_slot_conflicts, generate_booking_reference,
    generate_smart_alternatives, _get_staff_lock
)
from app.services.ai_prediction import prediction_engine


class ReschedulingService:
    def __init__(self, db: Session):
        self.db = db

    def submit_rescheduling_request(
        self,
        conflict_id: Optional[str],
        client_name: str,
        client_email: str,
        service_name: str,
        staff: str,
        requested_starts_at: str,
        original_starts_at: Optional[str] = None,
        duration_minutes: int = 30,
        user_consent: bool = False,
        approver_notes: str = "",
        force_admin_approval: bool = False,
        original_appointment_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Submits a rescheduling request.
        If service requires administrator sign-off or force_admin_approval is True:
            Mode B -> Status: AWAITING_ADMIN_APPROVAL (creates 30-min hold)
        If standard customer approval:
            Mode A -> Revalidates slot and confirms immediately if user_consent is True.
        """
        start_dt = parse_iso_utc(requested_starts_at)
        end_dt = start_dt + timedelta(minutes=duration_minutes)
        now_utc = datetime.now(timezone.utc)

        if start_dt <= now_utc:
            raise HTTPException(status_code=422, detail="Rescheduled appointment must be in the future")

        service_obj = self.db.query(Service).filter_by(name=service_name).first()
        requires_admin = force_admin_approval or (service_obj.requires_admin_approval if service_obj else False)

        request_id = f"resched-{uuid.uuid4().hex[:10]}"
        booking_ref = generate_booking_reference()

        # Check existing conflict record
        conflict_rec = None
        if conflict_id:
            conflict_rec = self.db.query(BookingConflict).filter_by(conflict_id=conflict_id).first()

        # MODE B — Staff / Admin Approval Mode
        if requires_admin:
            # Place temporary 30-minute hold for admin review
            hold_token = f"hold-{uuid.uuid4().hex[:10]}"
            hold_expires = (now_utc + timedelta(minutes=30)).isoformat(timespec='seconds')

            hold = BookingHold(
                hold_token=hold_token,
                staff=staff,
                service=service_name,
                starts_at=start_dt.isoformat(timespec='seconds'),
                ends_at=end_dt.isoformat(timespec='seconds'),
                client_email=client_email,
                expires_at=hold_expires,
                status="active"
            )
            self.db.add(hold)

            req = ReschedulingRequest(
                request_id=request_id,
                conflict_id=conflict_id,
                booking_reference=booking_ref,
                original_appointment_id=original_appointment_id,
                client_name=client_name,
                client_email=client_email,
                service=service_name,
                staff=staff,
                original_starts_at=original_starts_at or start_dt.isoformat(timespec='seconds'),
                requested_starts_at=start_dt.isoformat(timespec='seconds'),
                requested_ends_at=end_dt.isoformat(timespec='seconds'),
                duration_minutes=duration_minutes,
                approval_type="admin_approval",
                status="AWAITING_ADMIN_APPROVAL",
                user_consent=user_consent,
                consent_timestamp=utcnow_str() if user_consent else None,
                approver_notes=approver_notes,
                hold_token=hold_token,
                expires_at=hold_expires
            )
            self.db.add(req)

            if conflict_rec:
                conflict_rec.status = "AWAITING_ADMIN_APPROVAL"

            # Audit log
            self.db.add(BookingAuditLog(
                conflict_id=conflict_id,
                rescheduling_id=request_id,
                event_type="approval_requested",
                actor=client_email,
                details_json=json.dumps({
                    "mode": "admin_approval",
                    "service": service_name,
                    "staff": staff,
                    "hold_token": hold_token
                })
            ))

            # Enqueue UiPath notification
            self.db.add(NotificationOutbox(
                recipient_email=client_email,
                recipient_name=client_name,
                notification_type="admin_approval_required",
                subject=f"Rescheduling Request Received — Awaiting Staff Approval ({booking_ref})",
                payload_json=json.dumps({
                    "request_id": request_id,
                    "booking_reference": booking_ref,
                    "service": service_name,
                    "staff": staff,
                    "requested_starts_at": start_dt.isoformat(timespec='seconds'),
                    "status": "AWAITING_ADMIN_APPROVAL"
                }),
                status="pending",
                idempotency_key=f"outbox-admin-req-{request_id}"
            ))

            self.db.commit()
            return {
                "request": req.to_dict(),
                "approval_type": "admin_approval",
                "status": "AWAITING_ADMIN_APPROVAL",
                "message": "Rescheduling request submitted for administrative review. A 30-minute hold has been placed."
            }

        # MODE A — Customer Approval Mode
        if user_consent:
            # User explicitly approved alternative. Atomically reserve slot.
            staff_lock = _get_staff_lock(staff)
            with staff_lock:
                acquire_concurrency_lock(self.db, staff, start_dt.strftime("%Y-%m-%d"))

                # Re-validate slot is still free
                is_conflict, conflict_reason, _ = check_slot_conflicts(
                    self.db, staff, start_dt, end_dt, client_email=client_email
                )

                if is_conflict:
                    # Slot was taken in the interim! Generate fresh alternatives
                    fresh_alts = generate_smart_alternatives(
                        self.db, staff, service_name, start_dt, duration_minutes, limit=3
                    )
                    if conflict_rec:
                        conflict_rec.status = "ALTERNATIVES_OFFERED"
                        conflict_rec.alternatives_json = json.dumps(fresh_alts)
                        self.db.commit()

                    raise HTTPException(
                        status_code=409,
                        detail={
                            "detail": "The selected alternative slot was just booked by another user. Please choose another opening.",
                            "conflict_id": conflict_id,
                            "alternatives": fresh_alts
                        }
                    )

                # Confirm appointment
                lead_time_days = max(1.0, (start_dt - now_utc).total_seconds() / 86400.0)
                ai_risk = prediction_engine.predict(
                    lead_time_days=lead_time_days,
                    starts_at_str=start_dt.isoformat(),
                    duration_minutes=duration_minutes
                )

                # Cancel previous appointment if this is a reschedule of an existing booking
                if original_appointment_id:
                    orig_appt = self.db.query(Appointment).filter_by(id=original_appointment_id).first()
                    if orig_appt:
                        orig_appt.status = 'cancelled'
                        orig_appt.updated_at = utcnow_str()

                new_appt = Appointment(
                    client=client_name,
                    email=client_email,
                    service=service_name,
                    staff=staff,
                    starts_at=start_dt.isoformat(timespec='seconds'),
                    ends_at=end_dt.isoformat(timespec='seconds'),
                    status='scheduled',
                    notes=approver_notes or "Rescheduled appointment confirmed via customer consent",
                    source='customer_rescheduling',
                    booking_reference=booking_ref,
                    risk_score=ai_risk.get("risk_score", 0.0),
                    risk_tier=ai_risk.get("risk_tier", "Low"),
                    risk_factors_json=json.dumps(ai_risk.get("explainable_factors", [])),
                    slot_score=90.0
                )
                self.db.add(new_appt)
                self.db.flush()

                # Schedule reminders
                for kind, offset in [('24h', timedelta(hours=24)), ('1h', timedelta(hours=1))]:
                    due = start_dt - offset
                    if due > now_utc:
                        from app.models import Reminder
                        self.db.add(Reminder(
                            appointment_id=new_appt.id,
                            kind=kind,
                            due_at=due.isoformat(timespec='seconds'),
                            status='pending'
                        ))

                req = ReschedulingRequest(
                    request_id=request_id,
                    conflict_id=conflict_id,
                    booking_reference=booking_ref,
                    original_appointment_id=original_appointment_id,
                    new_appointment_id=new_appt.id,
                    client_name=client_name,
                    client_email=client_email,
                    service=service_name,
                    staff=staff,
                    original_starts_at=original_starts_at or start_dt.isoformat(timespec='seconds'),
                    requested_starts_at=start_dt.isoformat(timespec='seconds'),
                    requested_ends_at=end_dt.isoformat(timespec='seconds'),
                    duration_minutes=duration_minutes,
                    approval_type="customer_approval",
                    status="RESOLVED",
                    user_consent=True,
                    consent_timestamp=utcnow_str()
                )
                self.db.add(req)

                if conflict_rec:
                    conflict_rec.status = "RESOLVED"
                    conflict_rec.resolved_at = utcnow_str()

                # Audit log
                self.db.add(BookingAuditLog(
                    conflict_id=conflict_id,
                    rescheduling_id=request_id,
                    appointment_id=new_appt.id,
                    event_type="rescheduling_approved",
                    actor=client_email,
                    details_json=json.dumps({
                        "mode": "customer_approval",
                        "booking_reference": booking_ref,
                        "new_appointment_id": new_appt.id
                    })
                ))

                # Confirmation outbox
                self.db.add(NotificationOutbox(
                    recipient_email=client_email,
                    recipient_name=client_name,
                    notification_type="confirmation",
                    subject=f"Rescheduled & Confirmed: {service_name} with {staff} ({booking_ref})",
                    payload_json=json.dumps({
                        "appointment_id": new_appt.id,
                        "booking_reference": booking_ref,
                        "service": service_name,
                        "staff": staff,
                        "starts_at": new_appt.starts_at,
                        "status": "Confirmed"
                    }),
                    status="pending",
                    idempotency_key=f"outbox-resched-conf-{new_appt.id}"
                ))

                self.db.commit()
                self.db.refresh(new_appt)

                return {
                    "request": req.to_dict(),
                    "appointment": new_appt.to_dict(),
                    "approval_type": "customer_approval",
                    "status": "RESOLVED",
                    "message": "Appointment successfully rescheduled and confirmed!"
                }

        # Otherwise, save as pending customer consent
        req = ReschedulingRequest(
            request_id=request_id,
            conflict_id=conflict_id,
            booking_reference=booking_ref,
            client_name=client_name,
            client_email=client_email,
            service=service_name,
            staff=staff,
            original_starts_at=original_starts_at or start_dt.isoformat(timespec='seconds'),
            requested_starts_at=start_dt.isoformat(timespec='seconds'),
            requested_ends_at=end_dt.isoformat(timespec='seconds'),
            duration_minutes=duration_minutes,
            approval_type="customer_approval",
            status="AWAITING_USER_APPROVAL",
            user_consent=False
        )
        self.db.add(req)
        self.db.commit()
        return {
            "request": req.to_dict(),
            "approval_type": "customer_approval",
            "status": "AWAITING_USER_APPROVAL",
            "message": "Awaiting customer consent confirmation."
        }

    def approve_admin_request(
        self,
        request_id: str,
        approver_id: str = "admin",
        approver_notes: str = ""
    ) -> Dict[str, Any]:
        """
        Administrator approves a pending rescheduling request.
        Atomically checks slot availability, releases hold, and creates confirmed appointment.
        """
        req = self.db.query(ReschedulingRequest).filter_by(request_id=request_id).first()
        if not req:
            raise HTTPException(status_code=404, detail=f"Rescheduling request '{request_id}' not found")

        if req.status in ["APPROVED", "RESOLVED"]:
            return {
                "request": req.to_dict(),
                "status": req.status,
                "message": "Request already approved and resolved."
            }

        start_dt = parse_iso_utc(req.requested_starts_at)
        end_dt = parse_iso_utc(req.requested_ends_at)
        now_utc = datetime.now(timezone.utc)

        # Concurrency lock
        staff_lock = _get_staff_lock(req.staff)
        with staff_lock:
            acquire_concurrency_lock(self.db, req.staff, start_dt.strftime("%Y-%m-%d"))

            # Release hold temporarily to validate
            if req.hold_token:
                hold = self.db.query(BookingHold).filter_by(hold_token=req.hold_token).first()
                if hold:
                    hold.status = "converted"

            # Check for conflict
            is_conflict, conflict_reason, _ = check_slot_conflicts(
                self.db, req.staff, start_dt, end_dt, client_email=req.client_email
            )

            if is_conflict:
                req.status = "ALTERNATIVES_OFFERED"
                fresh_alts = generate_smart_alternatives(
                    self.db, req.staff, req.service, start_dt, req.duration_minutes, limit=3
                )
                self.db.commit()
                raise HTTPException(
                    status_code=409,
                    detail={
                        "detail": "Slot was booked by another user before administrator sign-off. Please review fresh alternatives.",
                        "alternatives": fresh_alts
                    }
                )

            # Create confirmed appointment
            lead_time_days = max(1.0, (start_dt - now_utc).total_seconds() / 86400.0)
            ai_risk = prediction_engine.predict(
                lead_time_days=lead_time_days,
                starts_at_str=start_dt.isoformat(),
                duration_minutes=req.duration_minutes
            )

            if req.original_appointment_id:
                orig_appt = self.db.query(Appointment).filter_by(id=req.original_appointment_id).first()
                if orig_appt:
                    orig_appt.status = 'cancelled'

            new_appt = Appointment(
                client=req.client_name,
                email=req.client_email,
                service=req.service,
                staff=req.staff,
                starts_at=start_dt.isoformat(timespec='seconds'),
                ends_at=end_dt.isoformat(timespec='seconds'),
                status='scheduled',
                notes=f"Approved by {approver_id}. {approver_notes}".strip(),
                source='admin_approval',
                booking_reference=req.booking_reference,
                risk_score=ai_risk.get("risk_score", 0.0),
                risk_tier=ai_risk.get("risk_tier", "Low"),
                risk_factors_json=json.dumps(ai_risk.get("explainable_factors", [])),
                slot_score=95.0
            )
            self.db.add(new_appt)
            self.db.flush()

            # Reminders
            for kind, offset in [('24h', timedelta(hours=24)), ('1h', timedelta(hours=1))]:
                due = start_dt - offset
                if due > now_utc:
                    from app.models import Reminder
                    self.db.add(Reminder(
                        appointment_id=new_appt.id,
                        kind=kind,
                        due_at=due.isoformat(timespec='seconds'),
                        status='pending'
                    ))

            req.status = "APPROVED"
            req.new_appointment_id = new_appt.id
            req.approver_id = approver_id
            req.approver_notes = approver_notes
            req.updated_at = utcnow_str()

            if req.conflict_id:
                conflict_rec = self.db.query(BookingConflict).filter_by(conflict_id=req.conflict_id).first()
                if conflict_rec:
                    conflict_rec.status = "RESOLVED"
                    conflict_rec.resolved_at = utcnow_str()

            # Audit log
            self.db.add(BookingAuditLog(
                conflict_id=req.conflict_id,
                rescheduling_id=request_id,
                appointment_id=new_appt.id,
                event_type="rescheduling_approved",
                actor=approver_id,
                details_json=json.dumps({
                    "action": "admin_approved",
                    "approver": approver_id,
                    "new_appointment_id": new_appt.id
                })
            ))

            # Outbox Notification (Client confirmation)
            self.db.add(NotificationOutbox(
                recipient_email=req.client_email,
                recipient_name=req.client_name,
                notification_type="rescheduling_approved",
                subject=f"Approved: Your rescheduled appointment for {req.service} is confirmed!",
                payload_json=json.dumps({
                    "appointment_id": new_appt.id,
                    "booking_reference": req.booking_reference,
                    "service": req.service,
                    "staff": req.staff,
                    "starts_at": new_appt.starts_at,
                    "approver": approver_id
                }),
                status="pending",
                idempotency_key=f"outbox-approved-{new_appt.id}"
            ))

            self.db.commit()
            self.db.refresh(new_appt)

            return {
                "request": req.to_dict(),
                "appointment": new_appt.to_dict(),
                "status": "APPROVED",
                "message": "Rescheduling request successfully approved and slot confirmed."
            }

    def reject_admin_request(
        self,
        request_id: str,
        approver_id: str = "admin",
        rejection_reason: str = "Requested time slot could not be accommodated by administration."
    ) -> Dict[str, Any]:
        """
        Administrator rejects a pending rescheduling request.
        Releases holds and notifies client.
        """
        req = self.db.query(ReschedulingRequest).filter_by(request_id=request_id).first()
        if not req:
            raise HTTPException(status_code=404, detail=f"Rescheduling request '{request_id}' not found")

        # Release hold
        if req.hold_token:
            hold = self.db.query(BookingHold).filter_by(hold_token=req.hold_token).first()
            if hold:
                hold.status = "released"

        req.status = "REJECTED"
        req.approver_id = approver_id
        req.approver_notes = rejection_reason
        req.updated_at = utcnow_str()

        if req.conflict_id:
            conflict_rec = self.db.query(BookingConflict).filter_by(conflict_id=req.conflict_id).first()
            if conflict_rec:
                conflict_rec.status = "REJECTED"

        # Audit log
        self.db.add(BookingAuditLog(
            conflict_id=req.conflict_id,
            rescheduling_id=request_id,
            event_type="rescheduling_rejected",
            actor=approver_id,
            details_json=json.dumps({
                "action": "admin_rejected",
                "reason": rejection_reason
            })
        ))

        # Notification outbox
        self.db.add(NotificationOutbox(
            recipient_email=req.client_email,
            recipient_name=req.client_name,
            notification_type="rescheduling_rejected",
            subject=f"Update regarding your rescheduling request for {req.service}",
            payload_json=json.dumps({
                "request_id": request_id,
                "reason": rejection_reason,
                "status": "REJECTED"
            }),
            status="pending",
            idempotency_key=f"outbox-reject-{request_id}"
        ))

        self.db.commit()

        return {
            "request": req.to_dict(),
            "status": "REJECTED",
            "message": "Rescheduling request was rejected. Client has been notified."
        }
