"""SmartSchedule AI 3.0 — Autonomous Appointment Intelligence and RPA Orchestration Platform.
Main FastAPI application with backward-compatible API endpoints, AI scheduling,
cancellation recovery, UiPath integration, notification outbox, and research evaluation.
"""
from __future__ import annotations
import csv
import io
import json
import os
import sqlite3
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Optional, List
from contextlib import contextmanager

from fastapi import FastAPI, Header, HTTPException, Query, Response, Depends, Request, status
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr, field_validator
from sqlalchemy.orm import Session

from app.config import settings
from app.database import engine, get_db, init_db, conn, SessionLocal
from app.models import (
    Appointment, Reminder, Audit, User, Staff, Service, WaitingListEntry,
    SlotOffer, NotificationOutbox, AutomationExecution, IntegrationConnection,
    EvaluationRun, utcnow_str
)
from app.security import (
    hash_password, verify_password, create_access_token, decode_access_token,
    verify_api_key, get_current_user_or_api_key, require_admin
)
from app.services.scheduler import SchedulingEngine
from app.services.ai_prediction import prediction_engine
from app.services.recovery import RecoveryEngine
from app.services.outbox_worker import run_worker_tick
from app.services.uipath_service import UiPathService
from app.services.research import ResearchEvaluator
from app.services.seed_data import populate_seed_data

ROOT = Path(__file__).resolve().parent
FRONTEND_DIST = ROOT.parent / "frontend" / "dist"

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(
    title="SmartSchedule AI 3.0",
    description="Autonomous Appointment Intelligence and RPA Orchestration Platform",
    version=settings.VERSION,
    lifespan=lifespan
)

# Enable CORS for local React development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Backward-compatibility constants
API_KEY = settings.SMARTSCHEDULE_API_KEY
DB = Path(settings.DATABASE_URL.replace("sqlite:///", "")) if settings.DATABASE_URL.startswith("sqlite:///") else Path(ROOT.parent / "smartschedule.db")

def now():
    return utcnow_str()

def parse_dt(value):
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if dt.tzinfo is None:
            raise ValueError('Timezone required')
        return dt.astimezone(timezone.utc)
    except (ValueError, AttributeError):
        raise ValueError('Use a timezone-aware ISO 8601 date/time, e.g. 2026-11-03T10:30:00+05:30')

def auth(x_api_key: str | None = Header(default=None)):
    """Backward-compatible auth dependency for existing tests and endpoints."""
    current_key = os.getenv("SMARTSCHEDULE_API_KEY", API_KEY)
    if not x_api_key or not secrets.compare_digest(x_api_key, current_key):
        raise HTTPException(401, 'Invalid or missing X-API-Key')

def audit(db_or_conn, aid: int, action: str, detail: str):
    """Write an audit entry via raw sqlite connection or SQLAlchemy session."""
    if hasattr(db_or_conn, 'execute') and not hasattr(db_or_conn, 'add'):
        db_or_conn.execute('INSERT INTO audit(appointment_id,action,detail,at) VALUES (?,?,?,?)', (aid, action, detail, now()))
    else:
        db_or_conn.add(Audit(appointment_id=aid, action=action, detail=detail, at=now()))

def schedule_reminders(db_or_conn, aid: int, start: datetime):
    """Enqueue 24h and 1h reminders only when in future."""
    current = datetime.now(timezone.utc)
    for kind, offset in [('24h', timedelta(hours=24)), ('1h', timedelta(hours=1))]:
        due = start - offset
        if due > current:
            due_str = due.isoformat(timespec='seconds')
            if hasattr(db_or_conn, 'execute') and not hasattr(db_or_conn, 'add'):
                db_or_conn.execute('INSERT OR IGNORE INTO reminders(appointment_id,kind,due_at) VALUES (?,?,?)', (aid, kind, due_str))
            else:
                db_or_conn.add(Reminder(appointment_id=aid, kind=kind, due_at=due_str, status='pending'))

# ----------------- PYDANTIC SCHEMAS -----------------

class AppointmentIn(BaseModel):
    client: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=3, max_length=254)
    service: str = Field(min_length=2, max_length=120)
    staff: str = Field(min_length=2, max_length=120)
    starts_at: str
    duration_minutes: int = Field(default=30, ge=15, le=240)
    notes: str = Field(default='', max_length=1000)
    source: str = Field(default='dashboard', max_length=40)
    external_id: str | None = Field(default=None, max_length=120)

    @field_validator('email')
    @classmethod
    def valid_email(cls, v):
        if not v or '\n' in v or '\r' in v or '@' not in v or not v.split('@')[1].count('.'):
            raise ValueError('Valid email required')
        return v.strip().lower()

    @field_validator('starts_at')
    @classmethod
    def valid_dt(cls, v):
        parse_dt(v)
        return v

class StatusUpdate(BaseModel):
    status: Literal['scheduled', 'completed', 'cancelled', 'no_show']

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=2)
    role: Optional[str] = "customer"

class SlotRecommendRequest(BaseModel):
    service_name: str
    staff_preference: Optional[str] = "Any"
    target_date: Optional[str] = None
    preferred_time: Optional[str] = None

class WaitingListCreate(BaseModel):
    client: str = Field(min_length=2)
    email: EmailStr
    service: str
    staff_preference: Optional[str] = "Any"
    preferred_start: str
    preferred_end: str
    urgency_score: Optional[float] = 1.0
    notes: Optional[str] = ""

class UiPathAppointmentIn(BaseModel):
    client: str
    email: str
    service: str
    staff: str
    starts_at: str
    duration_minutes: int = 30
    source: str = "uipath_studio_web"
    external_id: str

class UiPathReminderResult(BaseModel):
    reminder_id: int
    appointment_id: int
    delivery_status: str  # sent, failed, bounced
    uipath_job_id: Optional[str] = None
    error: Optional[str] = None

class UiPathWorkflowEvent(BaseModel):
    execution_id: str
    workflow_name: str
    uipath_job_id: Optional[str] = None
    appointment_id: Optional[int] = None
    event_type: str
    status: str
    error_message: Optional[str] = None

class ResearchExperimentRequest(BaseModel):
    sample_size: int = Field(default=100, ge=10, le=1000)
    seed: int = Field(default=42)

# ----------------- LIFESPAN / STARTUP -----------------

def startup():
    init_db()

# ----------------- STATIC & ROOT ROUTES -----------------

# Mount frontend assets
(FRONTEND_DIST / "assets").mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

@app.get('/')
def root_page():
    """Serves the modern React App if built, otherwise original dashboard."""
    if (FRONTEND_DIST / "index.html").exists():
        return FileResponse(FRONTEND_DIST / "index.html")
    return FileResponse(ROOT / 'static' / 'index.html')

@app.get('/health')
def health():
    return {
        'status': 'ok',
        'service': 'SmartSchedule AI 3.0',
        'version': settings.VERSION,
        'ai_model': prediction_engine.model_type,
        'uipath_integration': 'configured' if settings.UIPATH_WEBHOOK_URL else 'ready_local'
    }

# ----------------- AUTHENTICATION ROUTES -----------------

@app.post('/api/auth/login')
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(401, 'Invalid email or password')
    if not user.is_active:
        raise HTTPException(403, 'User account is disabled')

    token = create_access_token({
        "sub": str(user.id),
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "full_name": user.full_name
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user.to_dict()
    }

@app.post('/api/auth/register', status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter_by(email=payload.email.lower()).first()
    if existing:
        raise HTTPException(409, 'Email already registered')
    new_user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=payload.role if payload.role in ['admin', 'staff', 'customer'] else 'customer',
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user.to_dict()

@app.get('/api/auth/me')
def me(auth_data: dict = Depends(get_current_user_or_api_key), db: Session = Depends(get_db)):
    if auth_data.get("type") == "api_key":
        return {
            "id": 0,
            "email": "admin@smartschedule.local",
            "full_name": "API Key Administrator",
            "role": "admin",
            "is_active": True
        }
    user = db.query(User).filter_by(id=auth_data.get("id")).first()
    if not user:
        raise HTTPException(404, 'User profile not found')
    return user.to_dict()

# ----------------- APPOINTMENTS (PRESERVED & UPGRADED) -----------------

@app.get('/api/appointments', dependencies=[Depends(auth)])
def list_appointments(
    status: str | None = None,
    q: str = '',
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db)
):
    query = db.query(Appointment)
    if status and status != 'all':
        query = query.filter(Appointment.status == status)
    if q:
        like_q = f"%{q}%"
        query = query.filter(
            (Appointment.client.like(like_q)) |
            (Appointment.email.like(like_q)) |
            (Appointment.service.like(like_q)) |
            (Appointment.staff.like(like_q))
        )
    query = query.order_by(Appointment.starts_at.desc()).limit(limit)
    return [appt.to_dict() for appt in query.all()]

@app.post('/api/appointments', dependencies=[Depends(auth)], status_code=201)
def create_appointment(payload: AppointmentIn, db: Session = Depends(get_db)):
    start = parse_dt(payload.starts_at)
    end = start + timedelta(minutes=payload.duration_minutes)
    now_utc = datetime.now(timezone.utc)
    if start <= now_utc:
        raise HTTPException(422, 'Appointment must be in the future')

    # Duplicate check by external_id
    if payload.external_id:
        existing = db.query(Appointment).filter_by(external_id=payload.external_id).first()
        if existing:
            return {'appointment': existing.to_dict(), 'duplicate': True}

    # Overlap conflict check for the same staff member
    overlap = db.query(Appointment).filter(
        Appointment.staff == payload.staff,
        Appointment.status == 'scheduled',
        Appointment.starts_at < end.isoformat(),
        Appointment.ends_at > start.isoformat()
    ).first()
    if overlap:
        raise HTTPException(409, 'Staff member already booked for this time')

    # AI No-Show Risk assessment
    lead_time_days = max(1.0, (start - now_utc).total_seconds() / 86400.0)
    ai_risk = prediction_engine.predict(
        lead_time_days=lead_time_days,
        starts_at_str=start.isoformat(),
        duration_minutes=payload.duration_minutes
    )

    appt = Appointment(
        client=payload.client,
        email=payload.email,
        service=payload.service,
        staff=payload.staff,
        starts_at=start.isoformat(timespec='seconds'),
        ends_at=end.isoformat(timespec='seconds'),
        status='scheduled',
        notes=payload.notes,
        source=payload.source,
        external_id=payload.external_id,
        created_at=now(),
        updated_at=now(),
        risk_score=ai_risk["risk_score"],
        risk_tier=ai_risk["risk_tier"],
        risk_factors_json=json.dumps(ai_risk["explainable_factors"]),
        slot_score=85.0
    )
    db.add(appt)
    db.flush()

    # Schedule standard 24h & 1h reminders
    schedule_reminders(db, appt.id, start)

    # Enqueue confirmation outbox message
    notif = NotificationOutbox(
        recipient_email=appt.email,
        recipient_name=appt.client,
        notification_type="confirmation",
        subject=f"Confirmed: Your appointment for {appt.service}",
        payload_json=json.dumps({
            "appointment_id": appt.id,
            "service": appt.service,
            "staff": appt.staff,
            "starts_at": appt.starts_at,
            "risk_tier": appt.risk_tier
        }),
        status="pending",
        idempotency_key=f"confirm-appt-{appt.id}"
    )
    db.add(notif)

    # Write audit log
    audit(db, appt.id, 'created', 'Appointment booked')

    # Record automation execution
    db.add(AutomationExecution(
        execution_id=f"exec-{uuid.uuid4().hex[:12]}",
        workflow_name="Appointment Creation & Validation",
        appointment_id=appt.id,
        event_type="booking_created",
        status="completed",
        payload_json=json.dumps({"source": payload.source, "risk_tier": appt.risk_tier})
    ))

    db.commit()
    db.refresh(appt)

    # Trigger UiPath Webhook if configured
    uipath_svc = UiPathService(db)
    uipath_svc.dispatch_webhook_event("appointment_created", appt.to_dict(), appt.id)

    return {'appointment': appt.to_dict(), 'duplicate': False}

@app.patch('/api/appointments/{aid}', dependencies=[Depends(auth)])
def update_appointment(aid: int, payload: StatusUpdate, db: Session = Depends(get_db)):
    appt = db.query(Appointment).filter_by(id=aid).first()
    if not appt:
        raise HTTPException(404, 'Appointment not found')
    if appt.status == 'cancelled' and payload.status != 'cancelled':
        raise HTTPException(409, 'Cancelled appointment cannot be reopened')

    old_status = appt.status
    appt.status = payload.status
    appt.updated_at = now()

    if payload.status != 'scheduled':
        # Cancel pending reminders
        reminders = db.query(Reminder).filter(
            Reminder.appointment_id == aid,
            Reminder.status == 'pending'
        ).all()
        for r in reminders:
            r.status = 'cancelled'

    audit(db, aid, 'status', f"{old_status} → {payload.status}")

    # Trigger Autonomous Cancellation Recovery if appointment was cancelled
    recovery_result = None
    if payload.status == 'cancelled' and old_status != 'cancelled':
        recovery_engine = RecoveryEngine(db)
        recovery_result = recovery_engine.handle_cancellation(aid)

        # Dispatch UiPath event
        uipath_svc = UiPathService(db)
        uipath_svc.dispatch_webhook_event("appointment_cancelled", {
            "appointment_id": aid,
            "client": appt.client,
            "service": appt.service,
            "recovery_result": recovery_result
        }, aid)

    db.commit()
    db.refresh(appt)
    res = appt.to_dict()
    if recovery_result:
        res["recovery"] = recovery_result
    return res

@app.get('/api/appointments/{aid}/audit', dependencies=[Depends(auth)])
def appointment_audit(aid: int, db: Session = Depends(get_db)):
    records = db.query(Audit).filter_by(appointment_id=aid).order_by(Audit.id.desc()).all()
    return [r.to_dict() for r in records]

@app.get('/api/reminders', dependencies=[Depends(auth)])
def reminders(db: Session = Depends(get_db)):
    results = []
    rows = db.query(Reminder).join(Appointment).order_by(Reminder.due_at.desc()).limit(250).all()
    for r in rows:
        d = r.to_dict()
        d["client"] = r.appointment.client
        d["email"] = r.appointment.email
        d["starts_at"] = r.appointment.starts_at
        results.append(d)
    return results

@app.get('/api/stats', dependencies=[Depends(auth)])
def stats(db: Session = Depends(get_db)):
    rows = db.query(Appointment).all()
    total = len(rows)
    statuses = {s: sum(1 for a in rows if a.status == s) for s in ('scheduled', 'completed', 'cancelled', 'no_show')}
    services = {}
    for a in rows:
        services[a.service] = services.get(a.service, 0) + 1

    days = {}
    for a in rows:
        d = a.starts_at[:10]
        days[d] = days.get(d, 0) + 1

    # Reminder stats
    r_counts = {}
    all_reminders = db.query(Reminder).all()
    for r in all_reminders:
        r_counts[r.status] = r_counts.get(r.status, 0) + 1

    # Recovery metrics
    slot_offers = db.query(SlotOffer).all()
    accepted_offers = sum(1 for o in slot_offers if o.status == 'accepted')
    recovery_rate = round((accepted_offers / max(1, statuses['cancelled'])) * 100, 1)

    return {
        'total': total,
        'statuses': statuses,
        'services': services,
        'days': [{'date': d, 'count': days[d]} for d in sorted(days)[-14:]],
        'reminders': r_counts,
        'recovered_slots': accepted_offers,
        'recovery_rate': recovery_rate,
        'waiting_list_count': db.query(WaitingListEntry).filter_by(status='waiting').count(),
        'executions_count': db.query(AutomationExecution).count()
    }

@app.get('/api/export.csv', dependencies=[Depends(auth)])
def export_csv(db: Session = Depends(get_db)):
    rows = db.query(Appointment).order_by(Appointment.starts_at.desc()).all()
    f = io.StringIO()
    fields = ['id', 'client', 'email', 'service', 'staff', 'starts_at', 'ends_at', 'status', 'source', 'risk_tier', 'risk_score']
    writer = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
    writer.writeheader()
    for r in rows:
        writer.writerow(r.to_dict())
    return Response(
        f.getvalue(),
        media_type='text/csv',
        headers={'Content-Disposition': 'attachment; filename="appointments.csv"'}
    )

# ----------------- SCHEDULING ENGINE ROUTES -----------------

@app.get('/api/scheduling/staff', dependencies=[Depends(auth)])
def get_staff_list(db: Session = Depends(get_db)):
    staff_members = db.query(Staff).filter_by(is_active=True).all()
    return [s.to_dict() for s in staff_members]

@app.get('/api/scheduling/services', dependencies=[Depends(auth)])
def get_services_list(db: Session = Depends(get_db)):
    services = db.query(Service).filter_by(is_active=True).all()
    return [s.to_dict() for s in services]

@app.post('/api/scheduling/recommend-slots', dependencies=[Depends(auth)])
def recommend_slots(payload: SlotRecommendRequest, db: Session = Depends(get_db)):
    scheduler = SchedulingEngine(db)
    candidates = scheduler.get_candidate_slots(
        service_name=payload.service_name,
        staff_preference=payload.staff_preference,
        target_date_str=payload.target_date
    )
    ranked = scheduler.rank_slots(candidates, preferred_time_str=payload.preferred_time)
    return {
        "service": payload.service_name,
        "staff_preference": payload.staff_preference,
        "total_available_slots": len(candidates),
        "recommended_slots": ranked
    }

# ----------------- WAITING LIST & RECOVERY ROUTES -----------------

@app.get('/api/waiting-list', dependencies=[Depends(auth)])
def list_waiting_list(status: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(WaitingListEntry)
    if status and status != 'all':
        q = q.filter(WaitingListEntry.status == status)
    entries = q.order_by(WaitingListEntry.urgency_score.desc(), WaitingListEntry.created_at.asc()).all()
    return [e.to_dict() for e in entries]

@app.post('/api/waiting-list', dependencies=[Depends(auth)], status_code=201)
def add_to_waiting_list(payload: WaitingListCreate, db: Session = Depends(get_db)):
    entry = WaitingListEntry(
        client=payload.client,
        email=payload.email,
        service=payload.service,
        staff_preference=payload.staff_preference,
        preferred_start=payload.preferred_start,
        preferred_end=payload.preferred_end,
        urgency_score=payload.urgency_score or 1.0,
        status='waiting',
        notes=payload.notes or ''
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry.to_dict()

@app.delete('/api/waiting-list/{entry_id}', dependencies=[Depends(auth)])
def cancel_waiting_list(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(WaitingListEntry).filter_by(id=entry_id).first()
    if not entry:
        raise HTTPException(404, 'Waiting list entry not found')
    entry.status = 'cancelled'
    db.commit()
    return {"message": "Waiting list entry cancelled"}

@app.get('/api/recovery/offers', dependencies=[Depends(auth)])
def list_slot_offers(db: Session = Depends(get_db)):
    offers = db.query(SlotOffer).order_by(SlotOffer.id.desc()).all()
    return [o.to_dict() for o in offers]

@app.post('/api/recovery/offers/{offer_id}/accept')
def accept_slot_offer(offer_id: int, db: Session = Depends(get_db)):
    recovery_engine = RecoveryEngine(db)
    res = recovery_engine.accept_offer(offer_id)
    if not res["success"]:
        raise HTTPException(status_code=res.get("status_code", 400), detail=res["detail"])
    return res

@app.post('/api/recovery/offers/{offer_id}/decline')
def decline_slot_offer(offer_id: int, db: Session = Depends(get_db)):
    recovery_engine = RecoveryEngine(db)
    res = recovery_engine.decline_offer(offer_id)
    if not res["success"]:
        raise HTTPException(400, res["detail"])
    return res

@app.post('/api/recovery/trigger/{appointment_id}', dependencies=[Depends(auth)])
def trigger_manual_recovery(appointment_id: int, db: Session = Depends(get_db)):
    recovery_engine = RecoveryEngine(db)
    res = recovery_engine.handle_cancellation(appointment_id)
    return res

# ----------------- AI & ML ROUTES -----------------

@app.post('/api/ai/predict-no-show', dependencies=[Depends(auth)])
def predict_no_show_endpoint(
    lead_time_days: float,
    starts_at: str,
    duration_minutes: int = 30,
    prior_no_shows: int = 0,
    prior_cancellations: int = 0,
    reminder_ack: int = 1
):
    return prediction_engine.predict(
        lead_time_days=lead_time_days,
        starts_at_str=starts_at,
        duration_minutes=duration_minutes,
        prior_no_shows=prior_no_shows,
        prior_cancellations=prior_cancellations,
        reminder_ack=reminder_ack
    )

@app.get('/api/ai/model-info', dependencies=[Depends(auth)])
def get_model_info():
    return {
        "version": prediction_engine.version,
        "model_type": prediction_engine.model_type,
        "metrics": prediction_engine.metrics,
        "feature_importances": prediction_engine.feature_importances
    }

@app.post('/api/ai/retrain', dependencies=[Depends(auth)])
def retrain_model(model_type: str = Query("Random Forest", enum=["Random Forest", "Logistic Regression"])):
    res = prediction_engine.train_custom(model_type=model_type)
    return res

# ----------------- NOTIFICATIONS & OUTBOX -----------------

@app.get('/api/notifications/outbox', dependencies=[Depends(auth)])
def get_outbox_items(limit: int = 50, db: Session = Depends(get_db)):
    items = db.query(NotificationOutbox).order_by(NotificationOutbox.id.desc()).limit(limit).all()
    return [i.to_dict() for i in items]

@app.post('/api/notifications/process-tick', dependencies=[Depends(auth)])
def trigger_notification_process():
    res = run_worker_tick()
    return {"message": "Outbox worker processed successfully", "counts": res}

@app.get('/api/notifications/status', dependencies=[Depends(auth)])
def get_notification_status():
    return {
        "smtp_enabled": settings.SMTP_ENABLED,
        "mode": "Live SMTP" if settings.SMTP_ENABLED else "Dry-Run Preview (Safe)",
        "host": settings.SMTP_HOST,
        "port": settings.SMTP_PORT,
        "from_address": settings.SMTP_FROM
    }

# ----------------- UIPATH INTEGRATION ROUTES -----------------

@app.get('/api/integrations/uipath/health')
def uipath_health():
    return {
        "status": "active",
        "service": "UiPath Studio Web Integration Connector",
        "version": settings.VERSION,
        "capabilities": [
            "HTTP generic POST/GET connector",
            "Idempotent appointment booking",
            "Reminder delivery webhook callback",
            "Execution feedback telemetry",
            "Authenticated polling fallback"
        ]
    }

@app.post('/api/integrations/uipath/appointments', dependencies=[Depends(auth)], status_code=201)
def uipath_create_appointment(payload: UiPathAppointmentIn, db: Session = Depends(get_db)):
    """UiPath generic HTTP activity target for appointment creation."""
    in_payload = AppointmentIn(
        client=payload.client,
        email=payload.email,
        service=payload.service,
        staff=payload.staff,
        starts_at=payload.starts_at,
        duration_minutes=payload.duration_minutes,
        source=payload.source,
        external_id=payload.external_id
    )
    result = create_appointment(in_payload, db)

    # Log UiPath Execution Record
    db.add(AutomationExecution(
        execution_id=f"uipath-job-{uuid.uuid4().hex[:8]}",
        workflow_name="UiPath Studio Web Booking",
        appointment_id=result["appointment"]["id"],
        event_type="uipath_booking",
        status="completed",
        payload_json=json.dumps(payload.model_dump())
    ))
    db.commit()

    return {
        "status": "success",
        "uipath_status": "PROCESSED",
        "duplicate": result["duplicate"],
        "appointment": result["appointment"]
    }

@app.get('/api/integrations/uipath/appointments/{aid}', dependencies=[Depends(auth)])
def uipath_get_appointment(aid: int, db: Session = Depends(get_db)):
    appt = db.query(Appointment).filter_by(id=aid).first()
    if not appt:
        raise HTTPException(404, 'Appointment not found')
    return appt.to_dict()

@app.post('/api/integrations/uipath/reminder-results', dependencies=[Depends(auth)])
def uipath_report_reminder_result(payload: UiPathReminderResult, db: Session = Depends(get_db)):
    """UiPath reports back the outcome of reminder email dispatch (e.g. via UiPath Gmail Activity)."""
    rem = db.query(Reminder).filter_by(id=payload.reminder_id).first()
    if not rem:
        raise HTTPException(404, 'Reminder ID not found')

    rem.status = 'sent' if payload.delivery_status == 'sent' else 'failed'
    rem.sent_at = now() if payload.delivery_status == 'sent' else None
    rem.error = payload.error

    db.add(AutomationExecution(
        execution_id=f"uipath-rem-{uuid.uuid4().hex[:8]}",
        workflow_name="UiPath Reminder Dispatcher",
        uipath_job_id=payload.uipath_job_id,
        appointment_id=payload.appointment_id,
        event_type="reminder_dispatched",
        status="completed" if payload.delivery_status == 'sent' else 'failed',
        error_message=payload.error
    ))

    db.add(Audit(
        appointment_id=payload.appointment_id,
        action='uipath_reminder_reported',
        detail=f"UiPath reported reminder status: {payload.delivery_status}"
    ))

    db.commit()
    return {"status": "acknowledged", "reminder_id": rem.id, "new_status": rem.status}

@app.post('/api/integrations/uipath/workflow-events', dependencies=[Depends(auth)])
def uipath_log_workflow_event(payload: UiPathWorkflowEvent, db: Session = Depends(get_db)):
    svc = UiPathService(db)
    rec = svc.record_uipath_result(
        execution_id=payload.execution_id,
        workflow_name=payload.workflow_name,
        status=payload.status,
        uipath_job_id=payload.uipath_job_id,
        appointment_id=payload.appointment_id,
        error_message=payload.error_message
    )
    return {"status": "recorded", "execution": rec.to_dict()}

@app.get('/api/integrations/uipath/pending-tasks', dependencies=[Depends(auth)])
def uipath_poll_pending_tasks(db: Session = Depends(get_db)):
    """Authenticated polling fallback for UiPath Studio Web when inbound webhooks cannot reach localhost."""
    pending = db.query(NotificationOutbox).filter(
        NotificationOutbox.status == 'pending',
        NotificationOutbox.scheduled_for <= now()
    ).limit(10).all()
    return {
        "pending_count": len(pending),
        "tasks": [p.to_dict() for p in pending]
    }

@app.get('/api/integrations/executions', dependencies=[Depends(auth)])
def list_automation_executions(limit: int = 50, db: Session = Depends(get_db)):
    executions = db.query(AutomationExecution).order_by(AutomationExecution.id.desc()).limit(limit).all()
    return [e.to_dict() for e in executions]

# ----------------- RESEARCH EVALUATION ROUTES -----------------

@app.post('/api/research/run-experiment', dependencies=[Depends(auth)])
def run_research_experiment(payload: ResearchExperimentRequest, db: Session = Depends(get_db)):
    evaluator = ResearchEvaluator(db)
    return evaluator.run_comparative_experiment(sample_size=payload.sample_size, seed=payload.seed)

@app.get('/api/research/latest', dependencies=[Depends(auth)])
def get_latest_research(db: Session = Depends(get_db)):
    latest = db.query(EvaluationRun).order_by(EvaluationRun.id.desc()).first()
    if latest and latest.metrics_json:
        try:
            return json.loads(latest.metrics_json)
        except Exception:
            pass
    evaluator = ResearchEvaluator(db)
    return evaluator.run_comparative_experiment(sample_size=100, seed=42)

@app.get('/api/research/export.csv', dependencies=[Depends(auth)])
def export_research_csv(db: Session = Depends(get_db)):
    evaluator = ResearchEvaluator(db)
    exp = evaluator.run_comparative_experiment(sample_size=100, seed=42)
    f = io.StringIO()
    fields = ['Metric', 'Approach A: Manual Baseline', 'Approach B: Rule-Based', 'Approach C: SmartSchedule AI 3.0']
    writer = csv.DictWriter(f, fieldnames=fields)
    writer.writeheader()

    a = exp["approaches"]["manual_baseline"]
    b = exp["approaches"]["rule_based"]
    c = exp["approaches"]["smartschedule_ai"]

    rows = [
        {"Metric": "Conflict Prevention Rate (%)", "Approach A: Manual Baseline": a["conflict_prevention_rate"], "Approach B: Rule-Based": b["conflict_prevention_rate"], "Approach C: SmartSchedule AI 3.0": c["conflict_prevention_rate"]},
        {"Metric": "Slot Recovery Rate (%)", "Approach A: Manual Baseline": a["slot_recovery_rate"], "Approach B: Rule-Based": b["slot_recovery_rate"], "Approach C: SmartSchedule AI 3.0": c["slot_recovery_rate"]},
        {"Metric": "Slot Utilization (%)", "Approach A: Manual Baseline": a["slot_utilization_percent"], "Approach B: Rule-Based": b["slot_utilization_percent"], "Approach C: SmartSchedule AI 3.0": c["slot_utilization_percent"]},
        {"Metric": "Automation Success Rate (%)", "Approach A: Manual Baseline": a["automation_success_rate"], "Approach B: Rule-Based": b["automation_success_rate"], "Approach C: SmartSchedule AI 3.0": c["automation_success_rate"]},
        {"Metric": "Total Time for 100 Appts", "Approach A: Manual Baseline": f"{a['total_duration_hours']} hours", "Approach B: Rule-Based": f"{b['total_duration_hours']} hours", "Approach C: SmartSchedule AI 3.0": f"{c['average_processing_time_ms']} ms/req"}
    ]
    writer.writerows(rows)
    return Response(
        f.getvalue(),
        media_type='text/csv',
        headers={'Content-Disposition': 'attachment; filename="research_evaluation_matrix.csv"'}
    )

# ----------------- SYSTEM & SEED ROUTES -----------------

@app.post('/api/system/seed-demo', dependencies=[Depends(auth)])
def seed_demo_data(force: bool = False, db: Session = Depends(get_db)):
    return populate_seed_data(db, force=force)
