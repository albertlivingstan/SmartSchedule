# Research & College Review Plan

## Problem statement
Manual appointment management creates scheduling conflicts, missed reminder emails, and repetitive record entry. SmartSchedule combines booking validation and time-based automation with a measurable operational dashboard.

## Workflow
Client booking → validate required fields and timestamp → check staff overlap → persist appointment in SQLite → enqueue 24h/1h reminders → display dashboard → reminder worker sends (only when SMTP enabled) → log outcome.

## Evaluation experiments (perform before claiming numbers)
| Experiment | Procedure | Metric |
|---|---|---|
| Overlap prevention | Submit 20 intentional overlaps | Rejected overlaps / overlaps submitted |
| Duplicate prevention | Retry 20 identical external IDs | Duplicate requests without extra records / repeats |
| Reminder schedule | Create bookings 48h, 3h, 20min ahead | Correct number of queued reminders / expected |
| API latency | Time 100 requests locally | Median and p95 response duration (ms) |
| Manual vs automated | Time same 20 bookings in spreadsheet vs dashboard | Minutes saved and percent reduction |
| Email delivery | Use consenting test accounts, enable SMTP | Successful verified deliveries / attempts |

## RPA contribution
UiPath Studio Web generic HTTP requests can create and query appointments. A separate Python worker offers actual scheduled email dispatch. This division must be explained honestly during the review.

## Limitations
Single SQLite instance; one reminder worker recommended; SMTP needs credentials; no Calendar synchronization; single shared API key; no configured email provider out of the box; no real evaluation measurements shipped.

## Suggested viva points
- **Why RPA?** Rule-based repetitive creation, checking, and notifying are suitable for automation.
- **Why SQLite?** No separate server, SQL persistence and easy demonstration.
- **How are overlaps detected?** For same staff, a new interval conflicts when existing start < new end and existing end > new start.
- **How are duplicates avoided?** Unique `external_id` from each source request.
- **How is notification handled?** Pending queue + worker; successful send marks `sent`, failures remain pending with an error.
