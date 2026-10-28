"""Comprehensive test suite for SmartSchedule AI 3.0 advanced capabilities."""
import pytest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from app.main import app, init_db, conn
from app.services.ai_prediction import prediction_engine
from app.services.outbox_worker import run_worker_tick
from app.database import SessionLocal
from app.models import Appointment, WaitingListEntry, SlotOffer, NotificationOutbox

client = TestClient(app)
AUTH_HEADERS = {"X-API-Key": "local-demo-key"}

@pytest.fixture(autouse=True)
def setup_test_db():
    init_db()

import random

def future_iso(base_hours=100):
    offset = base_hours + random.randint(50, 9000)
    return (datetime.now(timezone.utc) + timedelta(hours=offset)).isoformat(timespec='seconds')

def test_slot_recommendation_engine():
    res = client.post(
        "/api/scheduling/recommend-slots",
        headers=AUTH_HEADERS,
        json={
            "service_name": "Consultation",
            "staff_preference": "Staff A",
            "preferred_time": "10:00"
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert "recommended_slots" in data
    assert len(data["recommended_slots"]) > 0
    top_slot = data["recommended_slots"][0]
    assert "score" in top_slot
    assert "breakdown" in top_slot
    assert "reason" in top_slot
    assert top_slot["score"] >= 0

def test_ai_no_show_prediction():
    res = client.post(
        "/api/ai/predict-no-show",
        headers=AUTH_HEADERS,
        params={
            "lead_time_days": 12.0,
            "starts_at": future_iso(72),
            "duration_minutes": 45,
            "prior_no_shows": 2,
            "prior_cancellations": 1,
            "reminder_ack": 0
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert "risk_score" in data
    assert "risk_tier" in data
    assert "explainable_factors" in data
    assert data["risk_tier"] in ["Low", "Medium", "High"]
    assert len(data["explainable_factors"]) > 0

def test_waiting_list_and_autonomous_cancellation_recovery():
    # 1. Create a booking to cancel
    target_start_dt = datetime.now(timezone.utc) + timedelta(days=200 + random.randint(1, 50))
    target_start = target_start_dt.isoformat(timespec='seconds')
    booking_res = client.post(
        "/api/appointments",
        headers=AUTH_HEADERS,
        json={
            "client": "Original Student",
            "email": "original@example.org",
            "service": "Career Mentorship",
            "staff": "Staff B",
            "starts_at": target_start,
            "duration_minutes": 60,
            "external_id": f"test-rec-{datetime.now().timestamp()}"
        }
    )
    assert booking_res.status_code == 201
    appt_id = booking_res.json()["appointment"]["id"]

    # 2. Add waiting list candidate covering this window
    pref_start = (target_start_dt - timedelta(days=1)).isoformat(timespec='seconds')
    pref_end = (target_start_dt + timedelta(days=1)).isoformat(timespec='seconds')
    wait_res = client.post(
        "/api/waiting-list",
        headers=AUTH_HEADERS,
        json={
            "client": "Waiting Candidate",
            "email": "waiting.candidate@example.org",
            "service": "Career Mentorship",
            "staff_preference": "Staff B",
            "preferred_start": pref_start,
            "preferred_end": pref_end,
            "urgency_score": 4.5,
            "notes": "Urgent career interview prep"
        }
    )
    assert wait_res.status_code == 201
    wait_id = wait_res.json()["id"]

    # 3. Cancel the original appointment -> Triggers Autonomous Recovery!
    cancel_res = client.patch(
        f"/api/appointments/{appt_id}",
        headers=AUTH_HEADERS,
        json={"status": "cancelled"}
    )
    assert cancel_res.status_code == 200
    cancel_data = cancel_res.json()
    assert cancel_data["status"] == "cancelled"
    assert "recovery" in cancel_data
    recovery = cancel_data["recovery"]
    assert recovery["success"] is True
    assert "offer" in recovery
    offer_id = recovery["offer"]["id"]

    # 4. Accept the slot offer
    accept_res = client.post(f"/api/recovery/offers/{offer_id}/accept")
    assert accept_res.status_code == 200
    accept_data = accept_res.json()
    assert accept_data["success"] is True
    assert "appointment" in accept_data
    new_appt = accept_data["appointment"]
    assert new_appt["client"] == "Waiting Candidate"
    assert new_appt["status"] == "scheduled"
    assert new_appt["source"] == "autonomous_recovery"

def test_uipath_studio_web_generic_http_integration():
    ext_id = f"uipath-test-{datetime.now().timestamp()}"
    payload = {
        "client": "UiPath Robot Student",
        "email": "uipath.bot@example.org",
        "service": "Academic Advising",
        "staff": "Staff A",
        "starts_at": (datetime.now(timezone.utc) + timedelta(days=300 + random.randint(1, 100))).isoformat(timespec='seconds'),
        "duration_minutes": 45,
        "source": "uipath_studio_web",
        "external_id": ext_id
    }
    res = client.post("/api/integrations/uipath/appointments", headers=AUTH_HEADERS, json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "success"
    assert data["uipath_status"] == "PROCESSED"
    assert data["duplicate"] is False
    assert data["appointment"]["client"] == "UiPath Robot Student"

    # Test idempotency / duplicate
    res_dup = client.post("/api/integrations/uipath/appointments", headers=AUTH_HEADERS, json=payload)
    assert res_dup.status_code == 201
    assert res_dup.json()["duplicate"] is True

def test_research_evaluation_experiment():
    res = client.post(
        "/api/research/run-experiment",
        headers=AUTH_HEADERS,
        json={"sample_size": 50, "seed": 42}
    )
    assert res.status_code == 200
    data = res.json()
    assert "approaches" in data
    assert "manual_baseline" in data["approaches"]
    assert "rule_based" in data["approaches"]
    assert "smartschedule_ai" in data["approaches"]
    ai = data["approaches"]["smartschedule_ai"]
    assert ai["conflict_prevention_rate"] == 100.0
    assert ai["slot_recovery_rate"] > 70.0
    assert "time_saved_hours" in ai

def test_notification_outbox_tick():
    counts = run_worker_tick()
    assert isinstance(counts, dict)
    assert "outbox" in counts
    assert "reminders" in counts
