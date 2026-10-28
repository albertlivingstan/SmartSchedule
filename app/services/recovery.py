"""Autonomous Cancellation Recovery and Smart Waiting List Matching Engine."""
from datetime import datetime, timedelta, timezone
import json
import uuid
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from app.models import (
    Appointment, WaitingListEntry, SlotOffer, NotificationOutbox,
    AutomationExecution, Audit, utcnow_str
)
from app.config import settings

def parse_iso(dt_str: str) -> datetime:
    dt = datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

class RecoveryEngine:
    def __init__(self, db: Session):
        self.db = db

    def handle_cancellation(self, appointment_id: int) -> Dict[str, Any]:
        """
        Main Autonomous Cancellation Recovery Pipeline:
        1. Identifies cancelled appointment
        2. Releases occupied slot
        3. Identifies eligible waiting list candidates
        4. Ranks candidates by urgency, wait time, and compatibility
        5. Issues slot offer with deadline to highest ranked candidate
        6. Enqueues notification outbox message and RPA execution log
        """
        appt = self.db.query(Appointment).filter_by(id=appointment_id).first()
        if not appt:
            return {"success": False, "detail": "Appointment not found"}

        # Check if already has an active pending offer
        existing_offer = self.db.query(SlotOffer).filter_by(
            cancelled_appointment_id=appointment_id,
            status='pending'
        ).first()
        if existing_offer:
            return {
                "success": True,
                "detail": "Slot offer already active for this cancellation",
                "offer": existing_offer.to_dict()
            }

        # Find eligible waiting list entries
        candidates = self.db.query(WaitingListEntry).filter(
            WaitingListEntry.status == 'waiting',
            WaitingListEntry.service == appt.service
        ).all()

        eligible = []
        appt_start = parse_iso(appt.starts_at)
        appt_end = parse_iso(appt.ends_at)

        for c in candidates:
            # Check staff preference: either 'Any' or exact match
            if c.staff_preference and c.staff_preference != 'Any' and c.staff_preference != appt.staff:
                continue

            # Check preferred date/time compatibility
            try:
                pref_start = parse_iso(c.preferred_start)
                pref_end = parse_iso(c.preferred_end)
                if not (pref_start <= appt_start and appt_end <= pref_end):
                    # If outside window, check if within 3 days tolerance
                    if abs((appt_start.date() - pref_start.date()).days) > 3:
                        continue
            except Exception:
                pass

            # Calculate match score
            created_dt = parse_iso(c.created_at) if c.created_at else appt_start
            wait_days = max(0, (datetime.now(timezone.utc) - created_dt).days)
            urgency = c.urgency_score or 1.0
            pref_bonus = 20.0 if (c.staff_preference == appt.staff) else 5.0

            rank_score = (urgency * 25.0) + (wait_days * 5.0) + pref_bonus
            eligible.append((c, rank_score))

        if not eligible:
            # Record audit and return
            audit_entry = Audit(
                appointment_id=appt.id,
                action='recovery_no_candidate',
                detail=f'Slot {appt.starts_at} released. No matching waiting-list candidates found.'
            )
            self.db.add(audit_entry)
            self.db.commit()
            return {
                "success": True,
                "detail": "No eligible waiting list candidates found",
                "candidates_considered": 0
            }

        # Sort eligible candidates descending by rank score
        eligible.sort(key=lambda x: x[1], reverse=True)
        top_candidate, top_score = eligible[0]

        # Generate expiration timestamp
        expiry_minutes = settings.SLOT_OFFER_EXPIRY_MINUTES
        expires_at = (datetime.now(timezone.utc) + timedelta(minutes=expiry_minutes)).isoformat(timespec='seconds')
        idempotency_key = f"offer-{appt.id}-{top_candidate.id}-{uuid.uuid4().hex[:8]}"

        # Create slot offer
        slot_offer = SlotOffer(
            waiting_list_id=top_candidate.id,
            cancelled_appointment_id=appt.id,
            offered_start=appt.starts_at,
            offered_end=appt.ends_at,
            staff=appt.staff,
            service=appt.service,
            expires_at=expires_at,
            status='pending',
            idempotency_key=idempotency_key
        )
        self.db.add(slot_offer)

        # Update candidate status
        top_candidate.status = 'offered'

        # Enqueue Outbox Notification
        notif_payload = {
            "offer_id": slot_offer.id,
            "candidate_name": top_candidate.client,
            "service": appt.service,
            "staff": appt.staff,
            "starts_at": appt.starts_at,
            "expires_at": expires_at,
            "action_url": f"/api/recovery/offers/{idempotency_key}/accept"
        }
        notif = NotificationOutbox(
            recipient_email=top_candidate.email,
            recipient_name=top_candidate.client,
            notification_type="slot_offer",
            subject=f"Urgent: Earlier appointment slot available for {appt.service}",
            payload_json=json.dumps(notif_payload),
            status="pending",
            idempotency_key=f"notif-{idempotency_key}"
        )
        self.db.add(notif)

        # Record Automation Execution
        exec_record = AutomationExecution(
            execution_id=f"rec-exec-{uuid.uuid4().hex[:12]}",
            workflow_name="Autonomous Slot Recovery",
            appointment_id=appt.id,
            event_type="slot_recovered",
            status="running",
            payload_json=json.dumps({
                "cancelled_appointment_id": appt.id,
                "offered_to_candidate_id": top_candidate.id,
                "candidate_name": top_candidate.client,
                "match_score": round(top_score, 1),
                "expires_at": expires_at
            })
        )
        self.db.add(exec_record)

        # Audit
        self.db.add(Audit(
            appointment_id=appt.id,
            action='recovery_offer_sent',
            detail=f'Offered slot {appt.starts_at} to {top_candidate.client} (score {round(top_score, 1)}). Expires {expires_at}'
        ))

        self.db.commit()

        return {
            "success": True,
            "detail": f"Offer dispatched to {top_candidate.client}",
            "offer": slot_offer.to_dict(),
            "candidate": top_candidate.to_dict(),
            "match_score": round(top_score, 1)
        }

    def accept_offer(self, offer_id: int) -> Dict[str, Any]:
        """
        Accepts a slot offer transactionally:
        1. Confirms offer is still 'pending' and not expired
        2. Books replacement appointment
        3. Updates waiting list status to 'matched'
        4. Updates offer status to 'accepted'
        5. Enqueues confirmation outbox notification
        """
        now_dt = datetime.now(timezone.utc)
        offer = self.db.query(SlotOffer).filter_by(id=offer_id).with_for_update(nowait=False).first()
        if not offer:
            return {"success": False, "status_code": 404, "detail": "Offer not found"}

        if offer.status != 'pending':
            return {"success": False, "status_code": 409, "detail": f"Offer already {offer.status}"}

        exp_dt = parse_iso(offer.expires_at)
        if now_dt > exp_dt:
            offer.status = 'expired'
            self.db.commit()
            # Cascade to next candidate
            self.handle_cancellation(offer.cancelled_appointment_id)
            return {"success": False, "status_code": 410, "detail": "Offer has expired"}

        wait_entry = self.db.query(WaitingListEntry).filter_by(id=offer.waiting_list_id).first()
        if not wait_entry:
            return {"success": False, "status_code": 404, "detail": "Waiting list entry missing"}

        # Create recovered appointment
        new_appt = Appointment(
            client=wait_entry.client,
            email=wait_entry.email,
            service=offer.service,
            staff=offer.staff,
            starts_at=offer.offered_start,
            ends_at=offer.offered_end,
            status='scheduled',
            notes=f"Recovered slot from cancellation. Original waitlist ID: {wait_entry.id}",
            source="autonomous_recovery",
            external_id=f"recovered-{offer.id}-{uuid.uuid4().hex[:6]}"
        )
        self.db.add(new_appt)
        self.db.flush()

        offer.status = 'accepted'
        offer.responded_at = utcnow_str()
        wait_entry.status = 'matched'

        # Schedule standard 24h & 1h reminders for newly booked appointment
        start_dt = parse_iso(offer.offered_start)
        for kind, offset in [('24h', timedelta(hours=24)), ('1h', timedelta(hours=1))]:
            due = start_dt - offset
            if due > now_dt:
                from app.models import Reminder
                self.db.add(Reminder(
                    appointment_id=new_appt.id,
                    kind=kind,
                    due_at=due.isoformat(timespec='seconds'),
                    status='pending'
                ))

        # Enqueue confirmation notification
        self.db.add(NotificationOutbox(
            recipient_email=new_appt.email,
            recipient_name=new_appt.client,
            notification_type="confirmation",
            subject=f"Confirmed: Your recovered appointment for {new_appt.service}",
            payload_json=json.dumps({
                "appointment_id": new_appt.id,
                "client": new_appt.client,
                "starts_at": new_appt.starts_at,
                "service": new_appt.service,
                "staff": new_appt.staff
            }),
            status="pending",
            idempotency_key=f"confirm-recovered-{new_appt.id}"
        ))

        # Record automation execution completed
        self.db.add(AutomationExecution(
            execution_id=f"rec-comp-{uuid.uuid4().hex[:12]}",
            workflow_name="Autonomous Slot Recovery",
            appointment_id=new_appt.id,
            event_type="slot_recovered",
            status="completed",
            payload_json=json.dumps({
                "offer_id": offer.id,
                "recovered_appointment_id": new_appt.id,
                "client": new_appt.client
            })
        ))

        self.db.add(Audit(
            appointment_id=new_appt.id,
            action='recovery_confirmed',
            detail=f'Slot successfully recovered and assigned to {new_appt.client}'
        ))

        self.db.commit()
        return {
            "success": True,
            "status_code": 200,
            "detail": "Slot successfully accepted and confirmed",
            "appointment": new_appt.to_dict()
        }

    def decline_offer(self, offer_id: int) -> Dict[str, Any]:
        """Candidate declines offer; cascade to next waiting list candidate."""
        offer = self.db.query(SlotOffer).filter_by(id=offer_id).first()
        if not offer or offer.status != 'pending':
            return {"success": False, "detail": "Offer not pending or not found"}

        offer.status = 'declined'
        offer.responded_at = utcnow_str()
        
        wait_entry = self.db.query(WaitingListEntry).filter_by(id=offer.waiting_list_id).first()
        if wait_entry:
            wait_entry.status = 'waiting'  # Put back in queue

        self.db.commit()

        # Cascade
        cascade_result = self.handle_cancellation(offer.cancelled_appointment_id)
        return {
            "success": True,
            "detail": "Offer declined. Cascaded to next eligible candidate.",
            "cascade_result": cascade_result
        }
