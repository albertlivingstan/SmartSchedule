"""SQLAlchemy ORM models for SmartSchedule AI 3.0."""
from datetime import datetime, timezone
import json
from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey, Index, UniqueConstraint
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

def utcnow_str():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')

class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(254), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(120), nullable=False)
    role = Column(String(20), nullable=False, default='customer')  # admin, staff, customer
    is_active = Column(Boolean, default=True)
    created_at = Column(String(40), default=utcnow_str)

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'full_name': self.full_name,
            'role': self.role,
            'is_active': self.is_active,
            'created_at': self.created_at
        }

class Staff(Base):
    __tablename__ = 'staff'

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(120), unique=True, nullable=False)
    email = Column(String(254), nullable=False)
    department = Column(String(120), nullable=False, default='General')
    working_hours_json = Column(Text, default='{"start":"09:00","end":"17:00","break_start":"13:00","break_end":"14:00","days":[1,2,3,4,5]}')
    max_daily_appointments = Column(Integer, default=8)
    is_active = Column(Boolean, default=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'department': self.department,
            'working_hours': json.loads(self.working_hours_json) if self.working_hours_json else {},
            'max_daily_appointments': self.max_daily_appointments,
            'is_active': self.is_active
        }

class Service(Base):
    __tablename__ = 'services'

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(120), unique=True, nullable=False)
    duration_minutes = Column(Integer, nullable=False, default=30)
    buffer_minutes = Column(Integer, default=10)
    description = Column(Text, default='')
    priority_weight = Column(Float, default=1.0)
    requires_admin_approval = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'duration_minutes': self.duration_minutes,
            'buffer_minutes': self.buffer_minutes,
            'description': self.description,
            'priority_weight': self.priority_weight,
            'requires_admin_approval': bool(self.requires_admin_approval),
            'is_active': self.is_active
        }

class AvailabilityRule(Base):
    __tablename__ = 'availability_rules'

    id = Column(Integer, primary_key=True, autoincrement=True)
    staff_id = Column(Integer, ForeignKey('staff.id'), nullable=True)
    rule_type = Column(String(50), nullable=False)  # break, holiday, blackout, buffer
    start_time = Column(String(40), nullable=False)
    end_time = Column(String(40), nullable=False)
    reason = Column(String(255), default='')

class Appointment(Base):
    __tablename__ = 'appointments'

    id = Column(Integer, primary_key=True, autoincrement=True)
    client = Column(String(120), nullable=False)
    email = Column(String(254), nullable=False)
    service = Column(String(120), nullable=False)
    staff = Column(String(120), nullable=False)
    starts_at = Column(String(40), nullable=False, index=True)
    ends_at = Column(String(40), nullable=False)
    status = Column(String(40), nullable=False, default='scheduled')  # scheduled, completed, cancelled, no_show, recovered
    notes = Column(Text, nullable=False, default='')
    created_at = Column(String(40), nullable=False, default=utcnow_str)
    updated_at = Column(String(40), nullable=False, default=utcnow_str)
    source = Column(String(40), nullable=False, default='dashboard')
    external_id = Column(String(120), unique=True, nullable=True)
    
    # Extended fields for SmartSchedule AI 3.0
    booking_reference = Column(String(120), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    risk_score = Column(Float, default=0.0)
    risk_tier = Column(String(20), default='Low')  # Low, Medium, High
    risk_factors_json = Column(Text, default='[]')
    slot_score = Column(Float, default=0.0)

    reminders = relationship("Reminder", back_populates="appointment", cascade="all, delete-orphan")

    def to_dict(self):
        factors = []
        if self.risk_factors_json:
            try:
                factors = json.loads(self.risk_factors_json)
            except Exception:
                factors = []
        return {
            'id': self.id,
            'client': self.client,
            'email': self.email,
            'service': self.service,
            'staff': self.staff,
            'starts_at': self.starts_at,
            'ends_at': self.ends_at,
            'status': self.status,
            'notes': self.notes,
            'created_at': self.created_at,
            'updated_at': self.updated_at,
            'source': self.source,
            'external_id': self.external_id,
            'booking_reference': self.booking_reference,
            'risk_score': self.risk_score or 0.0,
            'risk_tier': self.risk_tier or 'Low',
            'risk_factors': factors,
            'slot_score': self.slot_score or 0.0
        }

class Reminder(Base):
    __tablename__ = 'reminders'

    id = Column(Integer, primary_key=True, autoincrement=True)
    appointment_id = Column(Integer, ForeignKey('appointments.id'), nullable=False)
    kind = Column(String(20), nullable=False)  # 24h, 1h
    due_at = Column(String(40), nullable=False, index=True)
    status = Column(String(20), nullable=False, default='pending')  # pending, claimed, sent, cancelled, failed
    sent_at = Column(String(40), nullable=True)
    error = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint('appointment_id', 'kind', name='uq_appointment_kind'),
    )

    appointment = relationship("Appointment", back_populates="reminders")

    def to_dict(self):
        return {
            'id': self.id,
            'appointment_id': self.appointment_id,
            'kind': self.kind,
            'due_at': self.due_at,
            'status': self.status,
            'sent_at': self.sent_at,
            'error': self.error
        }

class Audit(Base):
    __tablename__ = 'audit'

    id = Column(Integer, primary_key=True, autoincrement=True)
    appointment_id = Column(Integer, nullable=False, index=True)
    action = Column(String(50), nullable=False)
    detail = Column(Text, nullable=False)
    at = Column(String(40), nullable=False, default=utcnow_str)

    def to_dict(self):
        return {
            'id': self.id,
            'appointment_id': self.appointment_id,
            'action': self.action,
            'detail': self.detail,
            'at': self.at
        }

class WaitingListEntry(Base):
    __tablename__ = 'waiting_list_entries'

    id = Column(Integer, primary_key=True, autoincrement=True)
    client = Column(String(120), nullable=False)
    email = Column(String(254), nullable=False)
    service = Column(String(120), nullable=False)
    staff_preference = Column(String(120), default='Any')  # specific staff or Any
    preferred_start = Column(String(40), nullable=False)
    preferred_end = Column(String(40), nullable=False)
    acceptable_days_json = Column(Text, default='[1,2,3,4,5]')
    urgency_score = Column(Float, default=1.0)  # 1.0 to 5.0
    status = Column(String(30), default='waiting')  # waiting, offered, matched, cancelled, expired
    notes = Column(Text, default='')
    created_at = Column(String(40), default=utcnow_str)
    updated_at = Column(String(40), default=utcnow_str)

    def to_dict(self):
        return {
            'id': self.id,
            'client': self.client,
            'email': self.email,
            'service': self.service,
            'staff_preference': self.staff_preference,
            'preferred_start': self.preferred_start,
            'preferred_end': self.preferred_end,
            'acceptable_days': json.loads(self.acceptable_days_json) if self.acceptable_days_json else [],
            'urgency_score': self.urgency_score,
            'status': self.status,
            'notes': self.notes,
            'created_at': self.created_at,
            'updated_at': self.updated_at
        }

class SlotOffer(Base):
    __tablename__ = 'slot_offers'

    id = Column(Integer, primary_key=True, autoincrement=True)
    waiting_list_id = Column(Integer, ForeignKey('waiting_list_entries.id'), nullable=False)
    cancelled_appointment_id = Column(Integer, ForeignKey('appointments.id'), nullable=True)
    offered_start = Column(String(40), nullable=False)
    offered_end = Column(String(40), nullable=False)
    staff = Column(String(120), nullable=False)
    service = Column(String(120), nullable=False)
    expires_at = Column(String(40), nullable=False)
    status = Column(String(30), default='pending')  # pending, accepted, declined, expired
    idempotency_key = Column(String(120), unique=True, nullable=False)
    created_at = Column(String(40), default=utcnow_str)
    responded_at = Column(String(40), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'waiting_list_id': self.waiting_list_id,
            'cancelled_appointment_id': self.cancelled_appointment_id,
            'offered_start': self.offered_start,
            'offered_end': self.offered_end,
            'staff': self.staff,
            'service': self.service,
            'expires_at': self.expires_at,
            'status': self.status,
            'idempotency_key': self.idempotency_key,
            'created_at': self.created_at,
            'responded_at': self.responded_at
        }

class NotificationOutbox(Base):
    __tablename__ = 'notification_outbox'

    id = Column(Integer, primary_key=True, autoincrement=True)
    recipient_email = Column(String(254), nullable=False)
    recipient_name = Column(String(120), nullable=False)
    notification_type = Column(String(50), nullable=False)  # confirmation, reminder_24h, reminder_1h, slot_offer, cancellation, alert
    subject = Column(String(255), nullable=False)
    payload_json = Column(Text, nullable=False, default='{}')
    status = Column(String(30), default='pending', index=True)  # pending, claimed, sent, failed, dead_letter
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)
    idempotency_key = Column(String(120), unique=True, nullable=False)
    last_error = Column(Text, nullable=True)
    scheduled_for = Column(String(40), nullable=False, default=utcnow_str, index=True)
    created_at = Column(String(40), default=utcnow_str)
    processed_at = Column(String(40), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'recipient_email': self.recipient_email,
            'recipient_name': self.recipient_name,
            'notification_type': self.notification_type,
            'subject': self.subject,
            'payload': json.loads(self.payload_json) if self.payload_json else {},
            'status': self.status,
            'retry_count': self.retry_count,
            'max_retries': self.max_retries,
            'idempotency_key': self.idempotency_key,
            'last_error': self.last_error,
            'scheduled_for': self.scheduled_for,
            'created_at': self.created_at,
            'processed_at': self.processed_at
        }

class AutomationExecution(Base):
    __tablename__ = 'automation_executions'

    id = Column(Integer, primary_key=True, autoincrement=True)
    execution_id = Column(String(120), unique=True, nullable=False, index=True)
    workflow_name = Column(String(120), nullable=False)
    uipath_job_id = Column(String(120), nullable=True)
    appointment_id = Column(Integer, nullable=True)
    event_type = Column(String(60), nullable=False)  # booking_created, reminder_dispatched, slot_recovered, cancellation_handled
    started_at = Column(String(40), default=utcnow_str)
    completed_at = Column(String(40), nullable=True)
    status = Column(String(30), default='pending')  # pending, running, completed, failed, retrying
    retry_count = Column(Integer, default=0)
    payload_json = Column(Text, default='{}')
    error_message = Column(Text, nullable=True)
    correlation_id = Column(String(120), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'execution_id': self.execution_id,
            'workflow_name': self.workflow_name,
            'uipath_job_id': self.uipath_job_id,
            'appointment_id': self.appointment_id,
            'event_type': self.event_type,
            'started_at': self.started_at,
            'completed_at': self.completed_at,
            'status': self.status,
            'retry_count': self.retry_count,
            'payload': json.loads(self.payload_json) if self.payload_json else {},
            'error_message': self.error_message,
            'correlation_id': self.correlation_id
        }

class IntegrationConnection(Base):
    __tablename__ = 'integration_connections'

    id = Column(Integer, primary_key=True, autoincrement=True)
    service_name = Column(String(60), unique=True, nullable=False)  # uipath, gmail, webhook
    enabled = Column(Boolean, default=False)
    webhook_url = Column(String(500), default='')
    auth_token = Column(String(255), default='')
    config_json = Column(Text, default='{}')
    last_ping_at = Column(String(40), nullable=True)
    status = Column(String(30), default='unverified')  # unverified, active, failed

    def to_dict(self):
        return {
            'id': self.id,
            'service_name': self.service_name,
            'enabled': self.enabled,
            'webhook_url': self.webhook_url,
            'last_ping_at': self.last_ping_at,
            'status': self.status,
            'config': json.loads(self.config_json) if self.config_json else {}
        }

class ModelVersion(Base):
    __tablename__ = 'model_versions'

    id = Column(Integer, primary_key=True, autoincrement=True)
    version_name = Column(String(60), unique=True, nullable=False)
    model_type = Column(String(60), nullable=False)  # Random Forest, Logistic Regression, Heuristic
    trained_at = Column(String(40), default=utcnow_str)
    metrics_json = Column(Text, default='{}')
    is_active = Column(Boolean, default=False)

    def to_dict(self):
        return {
            'id': self.id,
            'version_name': self.version_name,
            'model_type': self.model_type,
            'trained_at': self.trained_at,
            'metrics': json.loads(self.metrics_json) if self.metrics_json else {},
            'is_active': self.is_active
        }

class PredictionResult(Base):
    __tablename__ = 'prediction_results'

    id = Column(Integer, primary_key=True, autoincrement=True)
    appointment_id = Column(Integer, ForeignKey('appointments.id'), nullable=False)
    model_version = Column(String(60), nullable=False)
    predicted_risk = Column(Float, nullable=False)
    risk_factors_json = Column(Text, default='[]')
    actual_outcome = Column(String(40), nullable=True)  # attended, no_show, cancelled
    created_at = Column(String(40), default=utcnow_str)

    def to_dict(self):
        return {
            'id': self.id,
            'appointment_id': self.appointment_id,
            'model_version': self.model_version,
            'predicted_risk': self.predicted_risk,
            'risk_factors': json.loads(self.risk_factors_json) if self.risk_factors_json else [],
            'actual_outcome': self.actual_outcome,
            'created_at': self.created_at
        }

class EvaluationRun(Base):
    __tablename__ = 'evaluation_runs'

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_name = Column(String(120), nullable=False)
    scenario = Column(String(80), nullable=False)  # manual_baseline, rule_based, intelligent_recovery
    sample_size = Column(Integer, default=100)
    conflict_prevention_rate = Column(Float, default=0.0)
    slot_recovery_rate = Column(Float, default=0.0)
    avg_processing_time_ms = Column(Float, default=0.0)
    time_saved_minutes = Column(Float, default=0.0)
    automation_success_rate = Column(Float, default=0.0)
    metrics_json = Column(Text, default='{}')
    created_at = Column(String(40), default=utcnow_str)

    def to_dict(self):
        m = {}
        if self.metrics_json:
            try:
                m = json.loads(self.metrics_json)
            except Exception:
                try:
                    import ast
                    m = ast.literal_eval(self.metrics_json)
                except Exception:
                    m = {}
        return {
            'id': self.id,
            'run_name': self.run_name,
            'scenario': self.scenario,
            'sample_size': self.sample_size,
            'conflict_prevention_rate': self.conflict_prevention_rate,
            'slot_recovery_rate': self.slot_recovery_rate,
            'avg_processing_time_ms': self.avg_processing_time_ms,
            'time_saved_minutes': self.time_saved_minutes,
            'automation_success_rate': self.automation_success_rate,
            'metrics': m,
            'created_at': self.created_at
        }


class AppointmentSlot(Base):
    __tablename__ = 'appointment_slots'

    id = Column(Integer, primary_key=True, autoincrement=True)
    staff = Column(String(120), nullable=False, index=True)
    service = Column(String(120), nullable=False)
    starts_at = Column(String(40), nullable=False, index=True)  # UTC ISO-8601
    ends_at = Column(String(40), nullable=False)
    capacity = Column(Integer, default=1, nullable=False)
    booked_count = Column(Integer, default=0, nullable=False)
    is_locked = Column(Boolean, default=False)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(String(40), default=utcnow_str)
    updated_at = Column(String(40), default=utcnow_str)

    __table_args__ = (
        UniqueConstraint('staff', 'starts_at', name='uq_slot_staff_start'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'staff': self.staff,
            'service': self.service,
            'starts_at': self.starts_at,
            'ends_at': self.ends_at,
            'capacity': self.capacity,
            'booked_count': self.booked_count,
            'available_capacity': max(0, self.capacity - self.booked_count),
            'is_locked': self.is_locked,
            'version': self.version,
            'created_at': self.created_at,
            'updated_at': self.updated_at
        }


class BookingConflict(Base):
    __tablename__ = 'booking_conflicts'

    id = Column(Integer, primary_key=True, autoincrement=True)
    conflict_id = Column(String(80), unique=True, nullable=False, index=True)
    booking_reference = Column(String(120), nullable=True, index=True)
    client_name = Column(String(120), nullable=False)
    client_email = Column(String(254), nullable=False, index=True)
    service = Column(String(120), nullable=False)
    staff = Column(String(120), nullable=False)
    requested_starts_at = Column(String(40), nullable=False)
    requested_ends_at = Column(String(40), nullable=False)
    duration_minutes = Column(Integer, default=30)
    conflict_reason = Column(Text, default="This appointment slot is already fully booked. Please select another available time.")
    status = Column(String(40), default='CONFLICT_DETECTED', index=True)
    # CONFLICT_DETECTED, ALTERNATIVES_OFFERED, AWAITING_USER_APPROVAL, AWAITING_ADMIN_APPROVAL, APPROVED, REJECTED, EXPIRED, RESOLVED
    alternatives_json = Column(Text, default='[]')
    resolution_notes = Column(Text, default='')
    idempotency_key = Column(String(120), unique=True, nullable=True)
    created_at = Column(String(40), default=utcnow_str)
    resolved_at = Column(String(40), nullable=True)

    def to_dict(self):
        alts = []
        if self.alternatives_json:
            try:
                alts = json.loads(self.alternatives_json)
            except Exception:
                alts = []
        return {
            'id': self.id,
            'conflict_id': self.conflict_id,
            'booking_reference': self.booking_reference,
            'client_name': self.client_name,
            'client_email': self.client_email,
            'service': self.service,
            'staff': self.staff,
            'requested_starts_at': self.requested_starts_at,
            'requested_ends_at': self.requested_ends_at,
            'duration_minutes': self.duration_minutes,
            'conflict_reason': self.conflict_reason,
            'status': self.status,
            'alternatives': alts,
            'resolution_notes': self.resolution_notes,
            'idempotency_key': self.idempotency_key,
            'created_at': self.created_at,
            'resolved_at': self.resolved_at
        }


class ReschedulingRequest(Base):
    __tablename__ = 'rescheduling_requests'

    id = Column(Integer, primary_key=True, autoincrement=True)
    request_id = Column(String(80), unique=True, nullable=False, index=True)
    conflict_id = Column(String(80), nullable=True, index=True)
    booking_reference = Column(String(120), nullable=True, index=True)
    original_appointment_id = Column(Integer, ForeignKey('appointments.id'), nullable=True)
    new_appointment_id = Column(Integer, ForeignKey('appointments.id'), nullable=True)
    client_name = Column(String(120), nullable=False)
    client_email = Column(String(254), nullable=False, index=True)
    service = Column(String(120), nullable=False)
    staff = Column(String(120), nullable=False)
    original_starts_at = Column(String(40), nullable=False)
    requested_starts_at = Column(String(40), nullable=False)
    requested_ends_at = Column(String(40), nullable=False)
    duration_minutes = Column(Integer, default=30)
    approval_type = Column(String(30), default='customer_approval')  # 'customer_approval' or 'admin_approval'
    status = Column(String(40), default='AWAITING_USER_APPROVAL', index=True)
    # CONFLICT_DETECTED, ALTERNATIVES_OFFERED, AWAITING_USER_APPROVAL, AWAITING_ADMIN_APPROVAL, APPROVED, REJECTED, EXPIRED, RESOLVED
    user_consent = Column(Boolean, default=False)
    consent_timestamp = Column(String(40), nullable=True)
    approver_id = Column(String(120), nullable=True)
    approver_notes = Column(Text, default='')
    hold_token = Column(String(80), nullable=True)
    expires_at = Column(String(40), nullable=True)
    idempotency_key = Column(String(120), unique=True, nullable=True)
    created_at = Column(String(40), default=utcnow_str)
    updated_at = Column(String(40), default=utcnow_str)

    def to_dict(self):
        return {
            'id': self.id,
            'request_id': self.request_id,
            'conflict_id': self.conflict_id,
            'booking_reference': self.booking_reference,
            'original_appointment_id': self.original_appointment_id,
            'new_appointment_id': self.new_appointment_id,
            'client_name': self.client_name,
            'client_email': self.client_email,
            'service': self.service,
            'staff': self.staff,
            'original_starts_at': self.original_starts_at,
            'requested_starts_at': self.requested_starts_at,
            'requested_ends_at': self.requested_ends_at,
            'duration_minutes': self.duration_minutes,
            'approval_type': self.approval_type,
            'status': self.status,
            'user_consent': bool(self.user_consent),
            'consent_timestamp': self.consent_timestamp,
            'approver_id': self.approver_id,
            'approver_notes': self.approver_notes,
            'hold_token': self.hold_token,
            'expires_at': self.expires_at,
            'idempotency_key': self.idempotency_key,
            'created_at': self.created_at,
            'updated_at': self.updated_at
        }


class BookingHold(Base):
    __tablename__ = 'booking_holds'

    id = Column(Integer, primary_key=True, autoincrement=True)
    hold_token = Column(String(80), unique=True, nullable=False, index=True)
    staff = Column(String(120), nullable=False)
    service = Column(String(120), nullable=False)
    starts_at = Column(String(40), nullable=False)
    ends_at = Column(String(40), nullable=False)
    client_email = Column(String(254), nullable=False)
    expires_at = Column(String(40), nullable=False, index=True)
    status = Column(String(30), default='active', index=True)  # active, released, converted, expired
    created_at = Column(String(40), default=utcnow_str)

    def to_dict(self):
        return {
            'id': self.id,
            'hold_token': self.hold_token,
            'staff': self.staff,
            'service': self.service,
            'starts_at': self.starts_at,
            'ends_at': self.ends_at,
            'client_email': self.client_email,
            'expires_at': self.expires_at,
            'status': self.status,
            'created_at': self.created_at
        }


class BookingAuditLog(Base):
    __tablename__ = 'booking_audit_logs'

    id = Column(Integer, primary_key=True, autoincrement=True)
    conflict_id = Column(String(80), nullable=True, index=True)
    rescheduling_id = Column(String(80), nullable=True, index=True)
    appointment_id = Column(Integer, nullable=True, index=True)
    event_type = Column(String(60), nullable=False, index=True)
    # conflict_detected, alternative_offered, approval_requested, approved, rejected, expired, resolved, double_booking_prevented
    actor = Column(String(120), default='system')
    details_json = Column(Text, default='{}')
    created_at = Column(String(40), default=utcnow_str)

    def to_dict(self):
        d = {}
        if self.details_json:
            try:
                d = json.loads(self.details_json)
            except Exception:
                d = {}
        return {
            'id': self.id,
            'conflict_id': self.conflict_id,
            'rescheduling_id': self.rescheduling_id,
            'appointment_id': self.appointment_id,
            'event_type': self.event_type,
            'actor': self.actor,
            'details': d,
            'created_at': self.created_at
        }

