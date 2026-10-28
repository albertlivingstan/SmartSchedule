"""Intelligent Scheduling Engine for SmartSchedule AI 3.0.
Calculates constraint-aware slot availability and deterministic weighted rankings.
"""
from datetime import datetime, timedelta, timezone, time
import json
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models import Appointment, Staff, Service
from app.config import settings

def parse_iso_utc(dt_str: str) -> datetime:
    """Parse an ISO 8601 string to a UTC datetime."""
    dt = datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

class SchedulingEngine:
    def __init__(self, db: Session):
        self.db = db

    def get_candidate_slots(
        self,
        service_name: str,
        staff_preference: Optional[str] = "Any",
        target_date_str: Optional[str] = None,
        days_ahead: int = 7
    ) -> List[Dict[str, Any]]:
        """
        Generates available valid time slots for given service and staff across upcoming days.
        Respects staff working hours, breaks, and existing appointments.
        """
        service = self.db.query(Service).filter_by(name=service_name, is_active=True).first()
        duration = service.duration_minutes if service else 30
        buffer_min = service.buffer_minutes if service else 10

        staff_query = self.db.query(Staff).filter_by(is_active=True)
        if staff_preference and staff_preference != "Any":
            staff_query = staff_query.filter_by(name=staff_preference)
        active_staff = staff_query.all()

        if not active_staff:
            return []

        now_utc = datetime.now(timezone.utc)
        if target_date_str:
            try:
                base_date = parse_iso_utc(target_date_str).date()
            except Exception:
                base_date = (now_utc + timedelta(days=1)).date()
        else:
            base_date = (now_utc + timedelta(days=1)).date()

        candidate_slots = []

        # Generate slots for up to days_ahead
        for day_offset in range(days_ahead):
            current_day = base_date + timedelta(days=day_offset)
            weekday_iso = current_day.isoweekday()  # 1=Mon, 7=Sun

            for staff_member in active_staff:
                wh = {}
                if staff_member.working_hours_json:
                    try:
                        wh = json.loads(staff_member.working_hours_json)
                    except Exception:
                        pass
                
                allowed_days = wh.get("days", [1, 2, 3, 4, 5])
                if weekday_iso not in allowed_days:
                    continue

                # Parse working hours
                start_h, start_m = [int(x) for x in wh.get("start", "09:00").split(":")]
                end_h, end_m = [int(x) for x in wh.get("end", "17:00").split(":")]
                b_start_h, b_start_m = [int(x) for x in wh.get("break_start", "13:00").split(":")]
                b_end_h, b_end_m = [int(x) for x in wh.get("break_end", "14:00").split(":")]

                work_start = datetime(current_day.year, current_day.month, current_day.day, start_h, start_m, tzinfo=timezone.utc)
                work_end = datetime(current_day.year, current_day.month, current_day.day, end_h, end_m, tzinfo=timezone.utc)
                break_start = datetime(current_day.year, current_day.month, current_day.day, b_start_h, b_start_m, tzinfo=timezone.utc)
                break_end = datetime(current_day.year, current_day.month, current_day.day, b_end_h, b_end_m, tzinfo=timezone.utc)

                # Fetch all scheduled appointments for this staff member on this date
                day_start_iso = work_start.isoformat()
                day_end_iso = work_end.isoformat()
                existing_appts = self.db.query(Appointment).filter(
                    Appointment.staff == staff_member.name,
                    Appointment.status == 'scheduled',
                    Appointment.starts_at < day_end_iso,
                    Appointment.ends_at > day_start_iso
                ).all()

                # Walk through candidate intervals (step by 30 min)
                slot_cursor = work_start
                step_interval = timedelta(minutes=30)
                service_delta = timedelta(minutes=duration)

                while slot_cursor + service_delta <= work_end:
                    slot_end = slot_cursor + service_delta

                    # Check break overlap
                    if not (slot_end <= break_start or slot_cursor >= break_end):
                        slot_cursor += step_interval
                        continue

                    # Check must be in future (with at least 30 min lead)
                    if slot_cursor <= now_utc + timedelta(minutes=30):
                        slot_cursor += step_interval
                        continue

                    # Check collision with existing appointments
                    collision = False
                    for appt in existing_appts:
                        a_start = parse_iso_utc(appt.starts_at)
                        a_end = parse_iso_utc(appt.ends_at)
                        # Conflict if intervals overlap
                        if slot_cursor < a_end and slot_end > a_start:
                            collision = True
                            break

                    if not collision:
                        candidate_slots.append({
                            "starts_at": slot_cursor.isoformat(),
                            "ends_at": slot_end.isoformat(),
                            "staff": staff_member.name,
                            "service": service_name,
                            "staff_load_count": len(existing_appts)
                        })

                    slot_cursor += step_interval

        return candidate_slots

    def rank_slots(
        self,
        candidate_slots: List[Dict[str, Any]],
        preferred_time_str: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Applies deterministic weighted scoring to rank available candidate slots.
        Returns top slots with transparent explainability breakdown.
        """
        if not candidate_slots:
            return []

        w_pref = settings.WEIGHT_PREFERENCE_PROXIMITY
        w_staff = settings.WEIGHT_STAFF_BALANCE
        w_buf = settings.WEIGHT_BUFFER_EFFICIENCY

        preferred_hour = 10.0  # Default preferred 10:00 AM
        if preferred_time_str:
            try:
                p_dt = parse_iso_utc(preferred_time_str)
                preferred_hour = p_dt.hour + (p_dt.minute / 60.0)
            except Exception:
                preferred_hour = 10.0

        ranked = []
        for slot in candidate_slots:
            s_dt = parse_iso_utc(slot["starts_at"])
            slot_hour = s_dt.hour + (s_dt.minute / 60.0)

            # 1. Preference proximity (closer to preferred hour is better)
            hour_diff = abs(slot_hour - preferred_hour)
            proximity_score = max(0.0, 100.0 - (hour_diff * 12.0))

            # 2. Staff workload balance (lower existing daily count is better)
            load = slot.get("staff_load_count", 0)
            workload_score = max(20.0, 100.0 - (load * 15.0))

            # 3. Buffer and continuity efficiency (morning & early afternoon preferred over edge limits)
            if 9.5 <= slot_hour <= 12.5 or 14.0 <= slot_hour <= 16.0:
                buffer_score = 95.0
            else:
                buffer_score = 75.0

            composite_score = round(
                (w_pref * proximity_score) + (w_staff * workload_score) + (w_buf * buffer_score),
                1
            )

            # Explainable rationale
            reasons = []
            if proximity_score >= 85:
                reasons.append("Close to requested time window")
            if workload_score >= 80:
                reasons.append("Staff has low workload")
            if buffer_score >= 90:
                reasons.append("Optimal continuous scheduling block")
            if not reasons:
                reasons.append("Standard available slot")

            ranked.append({
                "starts_at": slot["starts_at"],
                "ends_at": slot["ends_at"],
                "staff": slot["staff"],
                "service": slot["service"],
                "score": composite_score,
                "breakdown": {
                    "preference_proximity": round(proximity_score, 1),
                    "workload_balance": round(workload_score, 1),
                    "buffer_efficiency": round(buffer_score, 1)
                },
                "reason": "; ".join(reasons)
            })

        # Sort descending by composite score
        ranked.sort(key=lambda x: x["score"], reverse=True)
        return ranked[:5]
