# UiPath Studio Web Integration Guide — SmartSchedule AI 3.0

**Official College Project:** Project 23 — Appointment Scheduling and Reminder Automation  
**Platform:** SmartSchedule AI 3.0 (Autonomous Appointment Intelligence and RPA Orchestration)

---

## 1. Architectural Overview & Cloud-to-Local Network Prerequisite

UiPath Studio Web runs entirely within **UiPath Automation Cloud** (SaaS).

> [!IMPORTANT]
> **Network Connectivity Note:**  
> UiPath Studio Web cannot directly reach `http://127.0.0.1:8000` or `http://localhost:8000` on your physical Mac because localhost is private to your computer.  
> To test live cloud execution from Studio Web to your local machine, expose your local FastAPI server via an encrypted HTTPS tunnel:
> ```bash
> # Option 1: ngrok (recommended for viva demonstration)
> ngrok http 8000
> # Forwarding URL provided: https://abc-123.ngrok-free.app
>
> # Option 2: Cloudflare Tunnel (free, zero install)
> cloudflared tunnel --url http://localhost:8000
> ```
> Use this generated HTTPS endpoint (e.g., `https://abc-123.ngrok-free.app`) in your UiPath activities.

---

## 2. UiPath Integration Endpoints Contract

SmartSchedule AI 3.0 provides dedicated, validated endpoints designed specifically for UiPath generic HTTP activities:

| Endpoint | Method | Authentication | Purpose |
|---|---|---|---|
| `/api/integrations/uipath/health` | GET | Public | Health, connector status & telemetry check |
| `/api/integrations/uipath/appointments` | POST | `X-API-Key` | Idempotent appointment creation |
| `/api/integrations/uipath/appointments/{id}` | GET | `X-API-Key` | Fetch booking status, time, and staff details |
| `/api/integrations/uipath/reminder-results` | POST | `X-API-Key` | UiPath reports outcome of reminder dispatch |
| `/api/integrations/uipath/workflow-events` | POST | `X-API-Key` | Telemetry logging & heartbeat reporting |
| `/api/integrations/uipath/pending-tasks` | GET | `X-API-Key` | Polling fallback for offline / firewall environments |

---

## 3. Step-by-Step UiPath Studio Web Workflow Implementations

### Workflow 1: Automated Appointment Creation
**Trigger:** Manual Trigger or Form Request in Studio Web  
**Objective:** Robot validates student scheduling request and registers slot idempotently.

1. Sign in to [UiPath Automation Cloud](https://cloud.uipath.com/).
2. In the left navigation, select **Studio Web**.
3. Click **New Project** → Select **API Workflow** (or **Manual Trigger**).
4. Click the **+** (Add activity) button in the canvas and search for **HTTP**. Select **Generic HTTP Request** (not Jira or Slack).
5. Configure the activity:
   * **Endpoint URL:** `https://YOUR-DEPLOYED-DOMAIN.ngrok-free.app/api/integrations/uipath/appointments`
   * **Request Method:** `POST`
   * **Headers:**
     ```json
     {
       "X-API-Key": "local-demo-key",
       "Content-Type": "application/json",
       "Accept": "application/json"
     }
     ```
   * **Body (JSON):**
     ```json
     {
       "client": "Aarav Sharma",
       "email": "aarav.sharma@demo.local",
       "service": "Academic Advising",
       "staff": "Staff A",
       "starts_at": "2026-11-20T10:00:00+05:30",
       "duration_minutes": 45,
       "source": "uipath_studio_web",
       "external_id": "uipath-job-2026-001"
     }
     ```
6. Click **Debug / Test Run** in Studio Web.
7. **Expected HTTP 201 Response:**
   ```json
   {
     "status": "success",
     "uipath_status": "PROCESSED",
     "duplicate": false,
     "appointment": {
       "id": 105,
       "client": "Aarav Sharma",
       "risk_tier": "Low",
       "status": "scheduled"
     }
   }
   ```
8. **Verify Idempotency:** Run the test again with the exact same `external_id`. Notice the response returns `duplicate: true` without creating redundant appointments or throwing errors.

---

### Workflow 2: Automated Reminder Dispatch & Delivery Feedback
**Trigger:** Scheduled Daily Trigger or Polling Trigger  
**Objective:** Robot claims pending reminder, sends message via UiPath Gmail connector, and reports delivery confirmation back to SmartSchedule.

1. Add **HTTP Request** activity to fetch pending reminders:
   * **Method:** `GET`
   * **URL:** `https://YOUR-DOMAIN/api/reminders`
   * **Headers:** `{"X-API-Key": "local-demo-key"}`
2. Add a **For Each** activity to loop through items where `status == "pending"`.
3. Inside the loop, add the **Send Email** activity (UiPath Google Gmail Integration Service).
   * **To:** `item.email`
   * **Subject:** `Appointment Reminder — SmartSchedule AI`
   * **Body:** `Hello {item.client}, your appointment for {item.service} is scheduled for {item.starts_at}.`
4. Add an **HTTP Request** activity to report delivery feedback:
   * **Method:** `POST`
   * **URL:** `https://YOUR-DOMAIN/api/integrations/uipath/reminder-results`
   * **Headers:** `{"X-API-Key": "local-demo-key", "Content-Type": "application/json"}`
   * **Body:**
     ```json
     {
       "reminder_id": 1,
       "appointment_id": 105,
       "delivery_status": "sent",
       "uipath_job_id": "uipath-job-982143",
       "error": null
     }
     ```
5. Check SmartSchedule Automation Center: the execution record and reminder status are updated live to `sent`.

---

### Workflow 3: Autonomous Cancellation Recovery
**Trigger:** UiPath Webhook or Poll (`/api/integrations/uipath/pending-tasks`)  
**Objective:** When an appointment is cancelled, the robot retrieves the top waiting-list candidate, dispatches the slot offer, and awaits response.

1. When cancellation occurs, SmartSchedule executes the recovery pipeline and issues a `slot_offer`.
2. UiPath calls `/api/recovery/offers` to monitor active pending offers.
3. If acceptance is received from the candidate, the robot calls:
   * **POST** `/api/recovery/offers/{offer_id}/accept`
4. The slot is locked and confirmed transactionally, preventing double booking.

---

### Workflow 4: Transient Error & Dead-Letter Escalation
**Objective:** Handling network drops, schedule conflicts, or invalid inputs.

```
Request Fails
   │
   ├── HTTP 409 (Conflict): Staff member already booked.
   │     └── Robot logs warning and queries alternative recommended slots via /api/scheduling/recommend-slots.
   │
   ├── HTTP 422 (Validation): Date in past or invalid email.
   │     └── Robot flags input data and notifies administrative inbox.
   │
   └── HTTP 500 / Network Timeout:
         └── Robot applies exponential backoff retry (up to 3 attempts), then logs dead-letter incident.
```

---

## 4. Troubleshooting HTTP Error Codes

| Error | Meaning | Solution |
|---|---|---|
| **401 Unauthorized** | Missing or invalid `X-API-Key` | Verify header is named `X-API-Key` and matches `SMARTSCHEDULE_API_KEY` (default: `local-demo-key`). |
| **404 Not Found** | Resource or ID does not exist | Verify appointment ID or offer ID exists in database. |
| **409 Conflict** | Staff already booked or appointment cannot be reopened | The selected slot overlaps with an existing scheduled booking. Call `/api/scheduling/recommend-slots` to select conflict-free intervals. |
| **422 Unprocessable** | Invalid timestamp or date in the past | Timestamps must be timezone-aware ISO 8601 (e.g. `2026-12-05T10:00:00+05:30`) and set to a future date. |
| **500 Server Error** | Backend exception | Check terminal logs or `/api/integrations/executions` for traceback details. |

---

## 5. Local Viva Testing Commands (cURL)

Test all integration contracts directly from your terminal:

```bash
# 1. Health check
curl -s http://127.0.0.1:8000/api/integrations/uipath/health

# 2. Book appointment via UiPath generic connector
curl -s -X POST http://127.0.0.1:8000/api/integrations/uipath/appointments \
  -H "Content-Type: application/json" \
  -H "X-API-Key: local-demo-key" \
  -d '{
    "client": "College Viva Reviewer",
    "email": "reviewer@college.edu",
    "service": "Thesis Defense Prep",
    "staff": "Staff A",
    "starts_at": "2026-12-15T10:00:00+05:30",
    "duration_minutes": 60,
    "source": "uipath_studio_web",
    "external_id": "viva-demo-001"
  }'

# 3. Report reminder execution feedback
curl -s -X POST http://127.0.0.1:8000/api/integrations/uipath/reminder-results \
  -H "Content-Type: application/json" \
  -H "X-API-Key: local-demo-key" \
  -d '{
    "reminder_id": 1,
    "appointment_id": 1,
    "delivery_status": "sent",
    "uipath_job_id": "uipath-viva-job-777"
  }'
```
