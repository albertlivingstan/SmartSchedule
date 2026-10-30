import os
import concurrent.futures
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient

# Use the real database configuration from environment, or fallback
from app.main import app, init_db
from app.database import get_db, SessionLocal
from app.models import (
    Appointment, AppointmentSlot, BookingConflict,
    ReschedulingRequest, BookingHold, BookingAuditLog, Staff, Service
)

client = TestClient(app)
AUTH_HEADERS = {"X-API-Key": os.getenv("SMARTSCHEDULE_API_KEY", "local-demo-key")}

def future_iso(days=10, hour=10, minute=0):
    dt = (datetime.now(timezone.utc) + timedelta(days=days)).replace(
        hour=hour, minute=minute, second=0, microsecond=0
    )
    return dt.isoformat()

@pytest.fixture(autouse=True)
def ensure_db_initialized():
    init_db()

# -------------------------------------------------------------------------
# Test 1: 2 simultaneous booking requests for the same slot
# Expected: Exactly 1 HTTP 201, 1 HTTP 409 with alternative slots payload
# -------------------------------------------------------------------------
def test_scenario_01_two_simultaneous_bookings():
    slot_time = future_iso(days=5, hour=10, minute=0)
    payload_a = {
        "client": "User Alpha",
        "email": "alpha@example.com",
        "service": "General Consultation",
        "staff": "Dr. Sarah Stone",
        "starts_at": slot_time,
        "duration_minutes": 30,
        "external_id": "test-sim-01-a"
    }
    payload_b = {
        "client": "User Beta",
        "email": "beta@example.com",
        "service": "General Consultation",
        "staff": "Dr. Sarah Stone",
        "starts_at": slot_time,
        "duration_minutes": 30,
        "external_id": "test-sim-01-b"
    }

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f_a = executor.submit(lambda: client.post("/api/appointments/book", headers=AUTH_HEADERS, json=payload_a))
        f_b = executor.submit(lambda: client.post("/api/appointments/book", headers=AUTH_HEADERS, json=payload_b))
        results = [f_a.result(), f_b.result()]

    status_codes = sorted([r.status_code for r in results])
    assert status_codes == [201, 409], f"Expected [201, 409], got {status_codes}"
    
    conflict_res = [r for r in results if r.status_code == 409][0].json()
    assert conflict_res["status"] == "conflict"
    assert "already fully booked" in conflict_res["message"]
    assert "alternatives" in conflict_res
    assert len(conflict_res["alternatives"]) > 0

# -------------------------------------------------------------------------
# Test 2: 10 concurrent requests for a capacity-1 slot
# Expected: Exactly 1 confirmed, 9 conflicts
# -------------------------------------------------------------------------
def test_scenario_02_ten_concurrent_requests():
    slot_time = future_iso(days=6, hour=14, minute=0)
    
    def book_request(idx):
        payload = {
            "client": f"Stress User {idx}",
            "email": f"stress{idx}@example.com",
            "service": "General Consultation",
            "staff": "Dr. Sarah Stone",
            "starts_at": slot_time,
            "duration_minutes": 30,
            "external_id": f"stress-ten-{idx}"
        }
        return client.post("/api/appointments/book", headers=AUTH_HEADERS, json=payload)

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(book_request, i) for i in range(10)]
        results = [f.result() for f in futures]

    statuses = [r.status_code for r in results]
    success_count = statuses.count(201)
    conflict_count = statuses.count(409)

    assert success_count == 1, f"Expected 1 confirmed booking, got {success_count}"
    assert conflict_count == 9, f"Expected 9 conflicts, got {conflict_count}"

# -------------------------------------------------------------------------
# Test 3: Conflict response contains exactly 3 valid alternative slots with reasoning
# -------------------------------------------------------------------------
def test_scenario_03_three_valid_alternatives_with_reasoning():
    slot_time = future_iso(days=7, hour=9, minute=0)
    first_res = client.post("/api/appointments/book", headers=AUTH_HEADERS, json={
        "client": "Primary User",
        "email": "primary@example.com",
        "service": "General Consultation",
        "staff": "Dr. Sarah Stone",
        "starts_at": slot_time,
        "duration_minutes": 30
    })
    assert first_res.status_code == 201

    second_res = client.post("/api/appointments/book", headers=AUTH_HEADERS, json={
        "client": "Secondary User",
        "email": "secondary@example.com",
        "service": "General Consultation",
        "staff": "Dr. Sarah Stone",
        "starts_at": slot_time,
        "duration_minutes": 30
    })
    assert second_res.status_code == 409
    body = second_res.json()
    alternatives = body["alternatives"]
    assert len(alternatives) == 3, f"Expected exactly 3 alternatives, got {len(alternatives)}"
    for alt in alternatives:
        assert "starts_at" in alt
        assert "staff" in alt
        assert "reason" in alt
        assert len(alt["reason"]) > 0

# -------------------------------------------------------------------------
# Test 4: Customer rejects/cancels rescheduling -> no new booking created
# -------------------------------------------------------------------------
def test_scenario_04_customer_rejects_rescheduling():
    slot_time = future_iso(days=8, hour=11, minute=0)
    # First book original
    client.post("/api/appointments/book", headers=AUTH_HEADERS, json={
        "client": "Booker One",
        "email": "one@example.com",
        "service": "General Consultation",
        "staff": "Dr. Sarah Stone",
        "starts_at": slot_time,
        "duration_minutes": 30
    })
    # Second booking gets conflict
    res2 = client.post("/api/appointments/book", headers=AUTH_HEADERS, json={
        "client": "Booker Two",
        "email": "two@example.com",
        "service": "General Consultation",
        "staff": "Dr. Sarah Stone",
        "starts_at": slot_time,
        "duration_minutes": 30
    })
    assert res2.status_code == 409
    conflict_id = res2.json()["conflict_id"]
    
    # Customer declines/cancels rescheduling (does not call approve)
    # Check that Booker Two has no confirmed appointment
    with SessionLocal() as db:
        appt = db.query(Appointment).filter(Appointment.email == "two@example.com").first()
        assert appt is None

# -------------------------------------------------------------------------
# Test 5: Customer approves alternative slot -> new slot confirmed atomically
# -------------------------------------------------------------------------
def test_scenario_05_customer_approves_alternative_slot():
    slot_time = future_iso(days=9, hour=10, minute=0)
    client.post("/api/appointments/book", headers=AUTH_HEADERS, json={
        "client": "Existing User",
        "email": "existing@example.com",
        "service": "General Consultation",
        "staff": "Dr. Sarah Stone",
        "starts_at": slot_time,
        "duration_minutes": 30
    })
    conf_res = client.post("/api/appointments/book", headers=AUTH_HEADERS, json={
        "client": "Rescheduling User",
        "email": "resched@example.com",
        "service": "General Consultation",
        "staff": "Dr. Sarah Stone",
        "starts_at": slot_time,
        "duration_minutes": 30
    })
    assert conf_res.status_code == 409
    conf_data = conf_res.json()
    alt_slot = conf_data["alternatives"][0]

    # Customer submits rescheduling request with user agreement
    resched_res = client.post("/api/rescheduling/request", headers=AUTH_HEADERS, json={
        "conflict_id": conf_data["conflict_id"],
        "client_name": "Rescheduling User",
        "client_email": "resched@example.com",
        "service_name": "General Consultation",
        "chosen_staff": alt_slot["staff"],
        "chosen_starts_at": alt_slot["starts_at"],
        "duration_minutes": 30,
        "user_agreement": True
    })
    assert resched_res.status_code in [200, 201]
    resched_data = resched_res.json()
    assert resched_data["status"] in ["CONFIRMED", "APPROVED", "RESOLVED"]
    assert "booking_reference" in resched_data

# -------------------------------------------------------------------------
# Test 6: Administrator rejects rescheduling request -> request status REJECTED
# -------------------------------------------------------------------------
def test_scenario_06_admin_rejects_rescheduling():
    slot_time = future_iso(days=10, hour=15, minute=0)
    alt_time = future_iso(days=10, hour=16, minute=0)

    # Create admin approval request
    resched_res = client.post("/api/rescheduling/request", headers=AUTH_HEADERS, json={
        "client_name": "Admin Approval Candidate",
        "client_email": "candidate@example.com",
        "service_name": "Specialist Consultation",  # Marked as requires_admin_approval
        "chosen_staff": "Dr. Sarah Stone",
        "chosen_starts_at": alt_time,
        "duration_minutes": 30,
        "user_agreement": True
    })
    req_id = resched_res.json()["request_id"]
    
    # Admin rejects
    reject_res = client.post(f"/api/rescheduling/{req_id}/reject", headers=AUTH_HEADERS, json={
        "approver_identity": "admin@clinic.org",
        "reason": "Staff member has mandatory medical conference"
    })
    assert reject_res.status_code == 200
    assert reject_res.json()["status"] == "REJECTED"

    # Status check
    stat = client.get(f"/api/rescheduling/{req_id}/status", headers=AUTH_HEADERS).json()
    assert stat["status"] == "REJECTED"

# -------------------------------------------------------------------------
# Test 7: Alternative slot taken before approval -> no double booking; returns fresh alternatives
# -------------------------------------------------------------------------
def test_scenario_07_alternative_taken_before_approval():
    alt_time = future_iso(days=11, hour=11, minute=0)
    
    # Booker 1 requests admin approval for alt_time without hold
    resched_req = client.post("/api/rescheduling/request", headers=AUTH_HEADERS, json={
        "client_name": "Applicant One",
        "client_email": "app1@example.com",
        "service_name": "Specialist Consultation",
        "chosen_staff": "Dr. Sarah Stone",
        "chosen_starts_at": alt_time,
        "duration_minutes": 30,
        "user_agreement": True
    }).json()
    req_id = resched_req["request_id"]

    # In the meantime, Booker 2 books that slot directly
    direct_book = client.post("/api/appointments/book", headers=AUTH_HEADERS, json={
        "client": "Direct Booker",
        "email": "direct@example.com",
        "service": "General Consultation",
        "staff": "Dr. Sarah Stone",
        "starts_at": alt_time,
        "duration_minutes": 30
    })
    assert direct_book.status_code == 201

    # Now Admin attempts to approve Applicant One for that already-taken slot
    approve_res = client.post(f"/api/rescheduling/{req_id}/approve", headers=AUTH_HEADERS, json={
        "approver_identity": "admin@clinic.org"
    })
    # Must fail or return 409 conflict because slot is already taken!
    assert approve_res.status_code in [400, 409]
    res_data = approve_res.json()
    assert "fresh_alternatives" in res_data or "already booked" in str(res_data)

# -------------------------------------------------------------------------
# Test 8: Idempotency / double-click confirm -> exactly one confirmed booking
# -------------------------------------------------------------------------
def test_scenario_08_idempotency_double_click():
    slot_time = future_iso(days=12, hour=10, minute=0)
    payload = {
        "client": "Idempotent User",
        "email": "idempotent@example.com",
        "service": "General Consultation",
        "staff": "Dr. Sarah Stone",
        "starts_at": slot_time,
        "duration_minutes": 30,
        "external_id": "unique-idempotency-key-08"
    }

    # Click 1
    res1 = client.post("/api/appointments/book", headers=AUTH_HEADERS, json=payload)
    assert res1.status_code == 201
    
    # Click 2 (duplicate submission with same external_id)
    res2 = client.post("/api/appointments/book", headers=AUTH_HEADERS, json=payload)
    assert res2.status_code in [200, 201]
    assert res2.json().get("duplicate") is True or res2.json()["appointment"]["id"] == res1.json()["appointment"]["id"]

# -------------------------------------------------------------------------
# Test 9: Overlapping variable durations (e.g. 10:00–11:00 vs 10:30–11:30)
# -------------------------------------------------------------------------
def test_scenario_09_overlapping_variable_durations():
    t_10_00 = future_iso(days=13, hour=10, minute=0)
    t_10_30 = future_iso(days=13, hour=10, minute=30)

    # 1-hour appointment from 10:00 to 11:00
    res1 = client.post("/api/appointments/book", headers=AUTH_HEADERS, json={
        "client": "Long Duration User",
        "email": "long@example.com",
        "service": "Comprehensive Assessment",
        "staff": "Dr. Sarah Stone",
        "starts_at": t_10_00,
        "duration_minutes": 60
    })
    assert res1.status_code == 201

    # Overlapping 1-hour appointment from 10:30 to 11:30 for same staff
    res2 = client.post("/api/appointments/book", headers=AUTH_HEADERS, json={
        "client": "Overlapping User",
        "email": "overlap@example.com",
        "service": "Comprehensive Assessment",
        "staff": "Dr. Sarah Stone",
        "starts_at": t_10_30,
        "duration_minutes": 60
    })
    assert res2.status_code == 409
    assert "already fully booked" in res2.json()["message"]

# -------------------------------------------------------------------------
# Test 10: Different staff at same time -> both bookings succeed independently
# -------------------------------------------------------------------------
def test_scenario_10_different_staff_same_time():
    same_time = future_iso(days=14, hour=10, minute=0)

    res_staff1 = client.post("/api/appointments/book", headers=AUTH_HEADERS, json={
        "client": "Patient One",
        "email": "patient1@example.com",
        "service": "General Consultation",
        "staff": "Dr. Sarah Stone",
        "starts_at": same_time,
        "duration_minutes": 30
    })
    assert res_staff1.status_code == 201

    res_staff2 = client.post("/api/appointments/book", headers=AUTH_HEADERS, json={
        "client": "Patient Two",
        "email": "patient2@example.com",
        "service": "General Consultation",
        "staff": "Dr. Michael Chen",
        "starts_at": same_time,
        "duration_minutes": 30
    })
    assert res_staff2.status_code == 201

# -------------------------------------------------------------------------
# Test 11: Slot with capacity = 2 receives 3 concurrent requests
# Expected: Exactly 2 succeed, 1 rejected
# -------------------------------------------------------------------------
def test_scenario_11_slot_with_multi_capacity():
    slot_time = future_iso(days=15, hour=10, minute=0)
    
    # Pre-create or ensure a slot with capacity=2 for Group Workshop
    with SessionLocal() as db:
        slot = AppointmentSlot(
            staff="Dr. Sarah Stone",
            service="Group Workshop",
            starts_at=datetime.fromisoformat(slot_time),
            ends_at=datetime.fromisoformat(slot_time) + timedelta(minutes=30),
            capacity=2,
            booked_count=0
        )
        db.add(slot)
        db.commit()

    def book_capacity(idx):
        return client.post("/api/appointments/book", headers=AUTH_HEADERS, json={
            "client": f"Group Attendee {idx}",
            "email": f"group{idx}@example.com",
            "service": "Group Workshop",
            "staff": "Dr. Sarah Stone",
            "starts_at": slot_time,
            "duration_minutes": 30,
            "external_id": f"group-cap-{idx}"
        })

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        futs = [executor.submit(book_capacity, i) for i in range(3)]
        results = [f.result() for f in futs]

    status_codes = [r.status_code for r in results]
    assert status_codes.count(201) == 2, f"Expected 2 successful bookings, got {status_codes.count(201)}"
    assert status_codes.count(409) == 1, f"Expected 1 conflict, got {status_codes.count(409)}"

# -------------------------------------------------------------------------
# Test 12: Notification dispatch failure -> database booking transaction remains intact
# -------------------------------------------------------------------------
def test_scenario_12_notification_failure_does_not_rollback_booking():
    slot_time = future_iso(days=16, hour=10, minute=0)

    # Book with an invalid email / offline notification mock
    res = client.post("/api/appointments/book", headers=AUTH_HEADERS, json={
        "client": "Resilient Booker",
        "email": "unreachable-smtp-address@invalid-domain-test.xyz",
        "service": "General Consultation",
        "staff": "Dr. Sarah Stone",
        "starts_at": slot_time,
        "duration_minutes": 30
    })
    assert res.status_code == 201
    
    # Confirm that the booking is committed safely in the database
    with SessionLocal() as db:
        appt = db.query(Appointment).filter(Appointment.email == "unreachable-smtp-address@invalid-domain-test.xyz").first()
        assert appt is not None
        assert appt.status == "confirmed"

# -------------------------------------------------------------------------
# Test 13: Unauthorized user access to admin endpoints -> access denied (401/403)
# -------------------------------------------------------------------------
def test_scenario_13_unauthorized_admin_access():
    no_auth_res = client.get("/api/admin/booking-conflicts")
    assert no_auth_res.status_code == 401
    
    invalid_auth_res = client.get("/api/admin/booking-conflicts", headers={"X-API-Key": "wrong-secret-key"})
    assert invalid_auth_res.status_code == 401

# -------------------------------------------------------------------------
# Test 14: Expired hold / approval timeout -> hold releases, cannot confirm expired slot
# -------------------------------------------------------------------------
def test_scenario_14_expired_hold_releases():
    slot_time = future_iso(days=17, hour=10, minute=0)
    
    # Create hold expired 10 minutes ago
    with SessionLocal() as db:
        past_expired = datetime.now(timezone.utc) - timedelta(minutes=10)
        hold = BookingHold(
            staff="Dr. Sarah Stone",
            service="Specialist Consultation",
            starts_at=datetime.fromisoformat(slot_time),
            ends_at=datetime.fromisoformat(slot_time) + timedelta(minutes=30),
            client_email="expired_hold@example.com",
            hold_token="expired-token-14",
            status="ACTIVE",
            expires_at=past_expired
        )
        db.add(hold)
        db.commit()

    # Now a new client tries to book that exact slot. Since hold expired, the new client should succeed!
    res = client.post("/api/appointments/book", headers=AUTH_HEADERS, json={
        "client": "New User After Expiration",
        "email": "newuser14@example.com",
        "service": "Specialist Consultation",
        "staff": "Dr. Sarah Stone",
        "starts_at": slot_time,
        "duration_minutes": 30
    })
    assert res.status_code == 201
