"""Real UiPath Studio Web Integration Service.
Handles inbound RPA calls, event webhook dispatching, polling fallback,
and execution feedback logging.
"""
import httpx
import json
import uuid
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models import AutomationExecution, IntegrationConnection, utcnow_str
from app.config import settings

class UiPathService:
    def __init__(self, db: Session):
        self.db = db

    def dispatch_webhook_event(
        self,
        event_type: str,
        payload: Dict[str, Any],
        appointment_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Dispatches an event to the configured UiPath Webhook or Integration Service endpoint.
        Falls back to local queued state if external connection is not yet configured.
        """
        exec_id = f"uipath-{uuid.uuid4().hex[:12]}"
        correlation_id = str(uuid.uuid4())

        exec_record = AutomationExecution(
            execution_id=exec_id,
            workflow_name=f"UiPath_{event_type}",
            appointment_id=appointment_id,
            event_type=event_type,
            started_at=utcnow_str(),
            status="pending",
            payload_json=json.dumps(payload),
            correlation_id=correlation_id
        )
        self.db.add(exec_record)
        self.db.commit()

        webhook_url = settings.UIPATH_WEBHOOK_URL
        if not webhook_url:
            exec_record.status = "queued_local"
            exec_record.error_message = "UiPath webhook URL not configured; queued for polling fallback."
            self.db.commit()
            return {
                "dispatched": False,
                "reason": "Webhook URL not configured",
                "execution_id": exec_id,
                "correlation_id": correlation_id
            }

        headers = {
            "Content-Type": "application/json",
            "X-Correlation-ID": correlation_id
        }
        if settings.UIPATH_AUTH_TOKEN:
            headers["Authorization"] = f"Bearer {settings.UIPATH_AUTH_TOKEN}"

        try:
            with httpx.Client(timeout=10.0) as client:
                res = client.post(webhook_url, json={"event": event_type, "payload": payload}, headers=headers)
                if res.is_success:
                    exec_record.status = "completed"
                    exec_record.completed_at = utcnow_str()
                    self.db.commit()
                    return {"dispatched": True, "status_code": res.status_code, "execution_id": exec_id}
                else:
                    exec_record.status = "failed"
                    exec_record.error_message = f"UiPath Webhook HTTP {res.status_code}: {res.text[:200]}"
                    self.db.commit()
                    return {"dispatched": False, "status_code": res.status_code, "execution_id": exec_id}
        except Exception as exc:
            exec_record.status = "failed"
            exec_record.error_message = f"Webhook connection error: {str(exc)[:200]}"
            self.db.commit()
            return {"dispatched": False, "error": str(exc), "execution_id": exec_id}

    def record_uipath_result(
        self,
        execution_id: str,
        workflow_name: str,
        status: str,
        uipath_job_id: Optional[str] = None,
        appointment_id: Optional[int] = None,
        error_message: Optional[str] = None
    ) -> AutomationExecution:
        """Records an execution outcome reported directly by UiPath Studio Web."""
        existing = self.db.query(AutomationExecution).filter_by(execution_id=execution_id).first()
        if existing:
            existing.status = status
            existing.uipath_job_id = uipath_job_id or existing.uipath_job_id
            existing.completed_at = utcnow_str()
            existing.error_message = error_message
            self.db.commit()
            return existing

        new_rec = AutomationExecution(
            execution_id=execution_id,
            workflow_name=workflow_name,
            uipath_job_id=uipath_job_id,
            appointment_id=appointment_id,
            event_type="uipath_callback",
            started_at=utcnow_str(),
            completed_at=utcnow_str(),
            status=status,
            error_message=error_message
        )
        self.db.add(new_rec)
        self.db.commit()
        return new_rec

    # --- Conflict Resolution & Rescheduling Event Triggers ---
    def trigger_conflict_detected(self, conflict_data: Dict[str, Any]) -> Dict[str, Any]:
        return self.dispatch_webhook_event("ConflictDetected", conflict_data)

    def trigger_alternative_slots_generated(self, data: Dict[str, Any]) -> Dict[str, Any]:
        return self.dispatch_webhook_event("AlternativeSlotsGenerated", data)

    def trigger_rescheduling_requested(self, data: Dict[str, Any]) -> Dict[str, Any]:
        return self.dispatch_webhook_event("ReschedulingApprovalRequested", data)

    def trigger_admin_approval_required(self, data: Dict[str, Any]) -> Dict[str, Any]:
        return self.dispatch_webhook_event("AdminApprovalRequired", data)

    def trigger_rescheduling_approved(self, data: Dict[str, Any]) -> Dict[str, Any]:
        return self.dispatch_webhook_event("ReschedulingApproved", data)

    def trigger_rescheduling_rejected(self, data: Dict[str, Any]) -> Dict[str, Any]:
        return self.dispatch_webhook_event("ReschedulingRejected", data)

    def trigger_booking_confirmed(self, data: Dict[str, Any], appointment_id: Optional[int] = None) -> Dict[str, Any]:
        return self.dispatch_webhook_event("BookingConfirmed", data, appointment_id=appointment_id)

    def trigger_booking_cancelled(self, data: Dict[str, Any], appointment_id: Optional[int] = None) -> Dict[str, Any]:
        return self.dispatch_webhook_event("BookingCancelled", data, appointment_id=appointment_id)

