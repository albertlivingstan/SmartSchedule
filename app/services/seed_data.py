"""Seeded demonstration dataset generator for SmartSchedule AI 3.0.
Generates:
- 10 staff members across diverse departments
- 8 specialized appointment services
- 100 realistic sample appointments with varying statuses and AI risk scores
- 30 waiting-list entries
- Multiple cancellation recovery workflows & slot offers
- Automation execution records & outbox logs
All records explicitly tagged as demo data.
"""
from datetime import datetime, timedelta, timezone
import json
import random
import uuid
from sqlalchemy.orm import Session
from app.database import SessionLocal, init_db
from app.models import (
    Staff, Service, Appointment, WaitingListEntry, SlotOffer,
    NotificationOutbox, AutomationExecution, Reminder, Audit, utcnow_str
)
from app.services.ai_prediction import prediction_engine

def populate_seed_data(db: Session, force: bool = False):
    """Populates complete research and demonstration dataset."""
    init_db()

    # Check if already seeded and not force
    if not force and db.query(Appointment).count() >= 50:
        return {"status": "skipped", "message": "Database already populated with demonstration data"}

    rng = random.Random(2026)
    now_utc = datetime.now(timezone.utc)

    # 1. Expand Staff to 10 members
    staff_roster = [
        ("Staff A", "staff.a@smartschedule.local", "Academic Advising"),
        ("Staff B", "staff.b@smartschedule.local", "Career Services"),
        ("Staff C", "staff.c@smartschedule.local", "Student Support"),
        ("Staff D", "staff.d@smartschedule.local", "Technical Support"),
        ("Staff E", "staff.e@smartschedule.local", "Document Verification"),
        ("Dr. Priya Sharma", "priya.sharma@smartschedule.local", "Research Guidance"),
        ("Prof. Marcus Vance", "marcus.vance@smartschedule.local", "Graduate Mentorship"),
        ("Elena Rostova", "elena.rostova@smartschedule.local", "Financial Aid Advising"),
        ("David Chen", "david.chen@smartschedule.local", "International Student Office"),
        ("Sarah Jenkins", "sarah.jenkins@smartschedule.local", "Disability & Access Services")
    ]
    for name, email, dept in staff_roster:
        existing = db.query(Staff).filter_by(name=name).first()
        if not existing:
            st = Staff(
                name=name,
                email=email,
                department=dept,
                working_hours_json=json.dumps({
                    "start": "09:00", "end": "17:00",
                    "break_start": "13:00", "break_end": "14:00",
                    "days": [1, 2, 3, 4, 5]
                }),
                max_daily_appointments=8,
                is_active=True
            )
            db.add(st)

    # 2. Expand Services to 8 specialized services
    services_list = [
        ("Consultation", 30, 10, "General advising consultation", 1.0),
        ("Academic Advising", 45, 15, "Curriculum, credit check and graduation planning", 1.2),
        ("Support Session", 30, 10, "Student guidance and counseling support", 1.0),
        ("Document Verification", 15, 5, "Official degree and identity record verification", 0.8),
        ("Career Mentorship", 60, 15, "Resume critique and interview preparation", 1.3),
        ("Financial Aid Advising", 45, 10, "Grants, scholarship, and student aid assistance", 1.1),
        ("Thesis Defense Prep", 60, 20, "Comprehensive master/doctoral presentation defense review", 1.5),
        ("Visa & Immigration Advisory", 45, 15, "International student compliance and work visa advisory", 1.4)
    ]
    for name, dur, buf, desc, weight in services_list:
        existing = db.query(Service).filter_by(name=name).first()
        if not existing:
            srv = Service(
                name=name,
                duration_minutes=dur,
                buffer_minutes=buf,
                description=desc,
                priority_weight=weight,
                is_active=True
            )
            db.add(srv)
    db.commit()

    active_staff = [s.name for s in db.query(Staff).all()]
    active_services = [s.name for s in db.query(Service).all()]

    # First and last names for synthetic generation
    first_names = ["Aarav", "Ananya", "Rohan", "Sneha", "Kavita", "Liam", "Sophia", "Noah", "Emma", "Lucas", "Maya", "Zain", "Fatima", "Carlos", "Isabella", "Jin", "Hana", "Tariq", "Elena", "Gabriel"]
    last_names = ["Patel", "Verma", "Sharma", "Reddy", "Smith", "Johnson", "Williams", "Brown", "Garcia", "Martinez", "Lee", "Kim", "Wong", "Ali", "Haddad", "Novak", "Ivanov", "Santos", "Silva", "Taylor"]

    # 3. Generate 100 Appointments across a timeline (-14 days to +21 days)
    statuses = ["scheduled", "completed", "cancelled", "no_show", "scheduled", "scheduled"]
    start_base = now_utc - timedelta(days=14)

    created_appointments = []
    for i in range(1, 101):
        c_first = rng.choice(first_names)
        c_last = rng.choice(last_names)
        client_name = f"{c_first} {c_last}"
        client_email = f"{c_first.lower()}.{c_last.lower()}@demo.local"
        staff_assigned = rng.choice(active_staff)
        service_assigned = rng.choice(active_services)

        day_offset = rng.randint(0, 35)
        appt_date = (start_base + timedelta(days=day_offset)).date()
        hour = rng.choice([9, 10, 11, 14, 15, 16])
        minute = rng.choice([0, 30])
        dur = rng.choice([30, 45, 60])

        appt_start = datetime(appt_date.year, appt_date.month, appt_date.day, hour, minute, tzinfo=timezone.utc)
        appt_end = appt_start + timedelta(minutes=dur)

        # Status determined by past vs future
        if appt_start < now_utc:
            status = rng.choice(["completed", "completed", "completed", "cancelled", "no_show"])
        else:
            status = "scheduled"

        # Predict AI risk
        lead_time = max(1.0, (appt_start - now_utc).total_seconds() / 86400.0) if appt_start > now_utc else 2.0
        ai_res = prediction_engine.predict(
            lead_time_days=lead_time,
            starts_at_str=appt_start.isoformat(),
            duration_minutes=dur,
            prior_no_shows=1 if status == "no_show" else 0,
            reminder_ack=1 if status == "completed" else 0
        )

        appt = Appointment(
            client=client_name,
            email=client_email,
            service=service_assigned,
            staff=staff_assigned,
            starts_at=appt_start.isoformat(timespec='seconds'),
            ends_at=appt_end.isoformat(timespec='seconds'),
            status=status,
            notes=f"Synthetic demo appointment #{i} for college RPA evaluation.",
            source="seed_dataset",
            external_id=f"demo-seed-2026-{i:03d}-{uuid.uuid4().hex[:6]}",
            risk_score=ai_res["risk_score"],
            risk_tier=ai_res["risk_tier"],
            risk_factors_json=json.dumps(ai_res["explainable_factors"]),
            slot_score=round(rng.uniform(78.0, 98.5), 1)
        )
        db.add(appt)
        created_appointments.append(appt)

    db.commit()

    # 4. Generate 30 Waiting-List Entries
    waiting_entries = []
    for i in range(1, 31):
        c_first = rng.choice(first_names)
        c_last = rng.choice(last_names)
        client_name = f"{c_first} {c_last}"
        client_email = f"wait.{c_first.lower()}.{c_last.lower()}@demo.local"
        service = rng.choice(active_services)
        staff_pref = rng.choice(["Any", rng.choice(active_staff)])

        day_start = now_utc + timedelta(days=rng.randint(1, 10))
        day_end = day_start + timedelta(days=rng.randint(3, 7))

        urgency = round(rng.uniform(1.0, 5.0), 1)
        st_choice = rng.choice(["waiting", "waiting", "waiting", "offered", "matched"])

        wl = WaitingListEntry(
            client=client_name,
            email=client_email,
            service=service,
            staff_preference=staff_pref,
            preferred_start=day_start.isoformat(timespec='seconds'),
            preferred_end=day_end.isoformat(timespec='seconds'),
            urgency_score=urgency,
            status=st_choice,
            notes=f"Synthetic waiting list customer #{i} (Priority {urgency})"
        )
        db.add(wl)
        waiting_entries.append(wl)
    db.commit()

    # 5. Generate Slot Offers and Recovery Scenarios
    cancelled_appts = [a for a in created_appointments if a.status == "cancelled"]
    for i, appt in enumerate(cancelled_appts[:8]):
        matched_wait = waiting_entries[i % len(waiting_entries)]
        offer_status = "accepted" if i % 2 == 0 else "pending"
        exp_time = (now_utc + timedelta(minutes=45)).isoformat(timespec='seconds')
        offer = SlotOffer(
            waiting_list_id=matched_wait.id,
            cancelled_appointment_id=appt.id,
            offered_start=appt.starts_at,
            offered_end=appt.ends_at,
            staff=appt.staff,
            service=appt.service,
            expires_at=exp_time,
            status=offer_status,
            idempotency_key=f"seed-offer-{appt.id}-{i}-{uuid.uuid4().hex[:6]}",
            responded_at=utcnow_str() if offer_status == "accepted" else None
        )
        db.add(offer)

    # 6. Generate Notification Outbox Entries
    for i in range(1, 25):
        ntype = rng.choice(["reminder_24h", "reminder_1h", "confirmation", "slot_offer", "cancellation"])
        status = rng.choice(["sent_dry_run", "sent_dry_run", "pending", "failed"])
        notif = NotificationOutbox(
            recipient_email=f"student{i}@demo.local",
            recipient_name=f"Student {i}",
            notification_type=ntype,
            subject=f"SmartSchedule AI Notification: {ntype.replace('_', ' ').title()}",
            payload_json=json.dumps({"demo": True, "type": ntype, "index": i}),
            status=status,
            idempotency_key=f"seed-notif-{i}-{uuid.uuid4().hex[:6]}",
            retry_count=1 if status == "failed" else 0,
            last_error="Simulated SMTP connection timeout" if status == "failed" else None
        )
        db.add(notif)

    # 7. Generate Automation Executions (UiPath & Recovery Workflows)
    workflows = [
        "UiPath_Appointment_Creation",
        "UiPath_Reminder_Dispatch",
        "Autonomous Slot Recovery",
        "AI_Risk_Assessment_Batch",
        "UiPath_Cancellation_Sync"
    ]
    for i in range(1, 30):
        wf = rng.choice(workflows)
        st = rng.choice(["completed", "completed", "completed", "running", "failed"])
        exec_rec = AutomationExecution(
            execution_id=f"seed-exec-{i:03d}-{uuid.uuid4().hex[:6]}",
            workflow_name=wf,
            uipath_job_id=f"job-{rng.randint(100000, 999999)}" if "UiPath" in wf else None,
            appointment_id=rng.randint(1, 100),
            event_type="automated_orchestration",
            started_at=(now_utc - timedelta(hours=rng.randint(1, 72))).isoformat(timespec='seconds'),
            completed_at=(now_utc - timedelta(hours=rng.randint(0, 70))).isoformat(timespec='seconds') if st == "completed" else None,
            status=st,
            payload_json=json.dumps({"scenario": "College RPA Evaluation Demo", "workflow": wf}),
            error_message="UiPath network timeout" if st == "failed" else None
        )
        db.add(exec_rec)

    db.commit()
    return {
        "status": "success",
        "staff_count": db.query(Staff).count(),
        "services_count": db.query(Service).count(),
        "appointments_count": db.query(Appointment).count(),
        "waiting_list_count": db.query(WaitingListEntry).count(),
        "slot_offers_count": db.query(SlotOffer).count(),
        "executions_count": db.query(AutomationExecution).count()
    }
