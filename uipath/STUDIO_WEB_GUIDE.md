# UiPath Studio Web — SmartSchedule RPA integration

## Goal
Connect SmartSchedule with UiPath for scheduled reminder sending. This is an integration GUIDE, not a pre-imported UiPath project.

### Before connecting
1. Start FastAPI and test `http://127.0.0.1:8000/health` on the Mac.
2. Studio Web is cloud-hosted and cannot call `localhost`. Deploy your app to a secure HTTPS backend first. Use the same persistent SQLite volume or migrate to PostgreSQL when deploying.
3. Store `SMARTSCHEDULE_API_KEY` securely. For UiPath, store it in an encrypted asset or secure connection, not in screenshots or commits.
4. Connect your Gmail account through UiPath Integration Service. Use a dedicated test inbox.

### Option A — API workflow: Fetch the reminder queue
1. In Studio Web, select a new **API workflow**, then select **+** and add the **HTTP** activity (generic HTTP, NOT Jira HTTP Request).
2. Authentication: **Manual authentication**.
3. Method: **GET**.
4. Request URL: `https://YOUR-DEPLOYED-DOMAIN/api/reminders`.
5. Headers: `{"X-API-Key":"YOUR_KEY","Accept":"application/json"}`. Use secure asset/variable for key when available.
6. Debug. You should receive JSON objects with `appointment_id`, `email`, `kind`, `due_at`, and `status`.
7. IMPORTANT: this endpoint includes all statuses. Filter to pending and due_at <= current UTC time before any send. For production, implement atomic claim/ack endpoints to prevent concurrent sends. Do NOT automatically mark reminders sent merely because they were listed.

### Option B — Recommended for college demo: UiPath creates appointments
1. Create a **Manual trigger** Studio Web API workflow.
2. Add generic **HTTP** activity.
3. Method: **POST**.
4. URL: `https://YOUR-DEPLOYED-DOMAIN/api/appointments`.
5. Headers `{"X-API-Key":"YOUR_KEY","Content-Type":"application/json"}`.
6. Body:
```
{
  "client":"Demo Student",
  "email":"demo@example.org",
  "service":"Academic Advising",
  "staff":"Staff A",
  "starts_at":"2026-12-05T10:00:00+05:30",
  "duration_minutes":30,
  "source":"uipath",
  "external_id":"uipath-demo-001"
}
```
7. Click Debug. Ensure the appointment date is future relative to your actual test date. Expect HTTP 201 and `duplicate:false` the first time. A repeated external_id returns `duplicate:true`.
8. Open dashboard and show new booking, service chart, reminders and report export.

### Actual automatic email delivery
The included **Python reminder worker** is the safe, tested path for automated sends after SMTP setup (`python -m app.reminder_worker --loop`). For real UiPath Gmail delivery, add an endpoint that atomically claims one due reminder and an acknowledgment endpoint after Gmail Send Email succeeds. Simply listing pending reminders may send duplicates if two bots run simultaneously. Gmail sending is NOT represented as completed in this starter.

UiPath official HTTP activity: https://docs.uipath.com/studio-web/automation-cloud/latest/user-guide/http
UiPath Gmail connector: https://docs.uipath.com/integration-service/automation-cloud/latest/user-guide/uipath-google-gmail
