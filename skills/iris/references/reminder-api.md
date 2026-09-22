# Reminder Phase 1

Reminder is a time-based attention schedule. ReminderOccurrence is one logical cycle.
Project is optional; never create a Project merely to hold a personal reminder.
No Task/Milestone/Resource binding, conditions, pause/resume, snooze alias or hard delete.
**Production channel adapter is pending:** Notification durable acceptance is integrated,
but production currently has no usable adapter. Without a usable channel, occurrences stay
pending. Do not promise external delivery. Fake adapters are test-only.

## Load and resolve

Load this reference for Reminder operations; add project-api.md only to resolve an
explicit Project. Use OpenAPI only for exact schema/debugging. Do not automatically
load Finance, content, Resource or Capability references.
Read before write. Resolve actual reminderId and occurrenceId from API state or reliable
notification context; verify the nested relationship. Titles are not identities.
If several candidates remain, ask which one. Never guess from “done” or “later”.

## API

All paths below are under `/api/v1`, require Bearer auth, and are user scoped.
Requests use snake_case, responses camelCase and `{success:true,data:...}`.
CREATE returns 201; reads/PATCH/actions return 200. No pagination in Phase 1.

| Method/path | Use |
| --- | --- |
| POST `/reminders` | Create definition and first occurrence atomically |
| GET `/reminders` | Filters `status`, `project_id`; createdAt descending |
| GET `/reminders/{reminderId}` | Definition, scheduleVersion and nextTriggerAt |
| PATCH `/reminders/{reminderId}` | Metadata or permanent schedule change |
| POST `/reminders/{reminderId}/cancel` | Permanently stop the whole Reminder |
| GET `/reminders/{reminderId}/occurrences` | Filters `status`, `from`, `to` |
| GET `/reminders/{reminderId}/occurrences/{occurrenceId}` | Exact occurrence |
| POST `.../occurrences/{occurrenceId}/done` | Finish this occurrence |
| POST `.../occurrences/{occurrenceId}/skip` | Skip this occurrence |
| POST `.../occurrences/{occurrenceId}/delay` | Change this occurrence's trigger time |

Occurrence from/to filters use **scheduledFor**, inclusive, with from <= to.
Occurrence list sorts by scheduledFor then scheduleVersion, ascending.
DONE/SKIP/CANCEL accept no body or `{}`; unknown fields are rejected.
DELAY body is `{"until":"2026-09-24T10:00:00+08:00"}`; until must be strictly future.

## CREATE and time conversion

```json
{
  "title": "提交资料",
  "description": "学校报名材料",
  "starts_at": "2026-09-24T15:00:00+08:00",
  "timezone": "Asia/Shanghai"
}
```

For recurring, add `"rrule":"FREQ=DAILY"`; `rrule:null` means one-time.
`project_id` is optional/nullable and must belong to the authenticated user.
First scheduledFor and triggerAt equal starts_at, including past-due CREATE.
The Agent converts natural language to explicit absolute ISO datetime and IANA timezone.
The Worker never parses “tomorrow”, “tonight” or “two hours later”. Do not infer an
unknown timezone or ambiguous local time; ask when it materially changes the instant.
Responses use UTC ISO timestamps; local display is the Agent's responsibility.

Recurring examples: `FREQ=WEEKLY;BYDAY=MO`, `FREQ=MONTHLY;BYMONTHDAY=1`,
`FREQ=MONTHLY;BYMONTHDAY=-1`, `FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=23`.
Supported: DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, BYDAY (including monthly/yearly
ordinals), BYMONTHDAY, BYMONTH, COUNT **or** UNTIL. UNTIL uses inclusive UTC compact
format, e.g. `UNTIL=20260930T120000Z`. No DTSTART/TZID inside RRULE. Unsupported keys,
invalid combinations, or an anchor not matching the rule are rejected.

Recurrence follows local wall-clock time. Nonexistent spring times/month dates are
skipped, not shifted, and do not consume COUNT. Fall repeats use only the first instant;
a recurring anchor using the second instant is rejected. Existing valid periods missed
during downtime consume COUNT; DELAY never consumes another cycle. UNTIL limits the
logical schedule, not delayed triggerAt. One-time and DELAY use their absolute instant.
The input offset need not be written like the IANA zone's offset; Z is accepted.

## State and actions

Reminder statuses: active / completed / cancelled.
Occurrence statuses: pending / triggered / done / skipped / cancelled.
`triggered` means durable event acceptance, not delivery, viewing or completion.
A Reminder completes only when no future rule occurrence and no pending/triggered
occurrence in **any** version remains. Active with nextTriggerAt=null is legitimate.
No completed→active special case remains. Cancelled is permanent.

- DONE/SKIP accept pending or triggered; repeat of the same terminal action succeeds
  without changing handledAt. Different terminal actions are rejected.
- DELAY accepts pending/triggered in the current version of an active Reminder only.
  It preserves scheduledFor, schedule, triggerCount and lastTriggeredAt; changes
  triggerAt, sets pending and increments triggerVersion only when the time changes.
  Repeating the same still-future target is a no-op. No `delayed` status exists.
- DELAY may coexist with normal recurrence or other delayed occurrences. It never
  modifies/cancels/merges other occurrences. SKIP means “this time no, next time normal”.
- CANCEL cancels every pending occurrence across versions, preserves triggered history,
  and prevents new scheduling. Historical triggered may still DONE/SKIP; DELAY is forbidden.

## Permanent reschedule

PATCH allows title, description, project_id, starts_at, timezone and rrule only.
Metadata changes do not touch occurrences. `null` clears description/project_id/rrule.
Changed starts_at/timezone/rrule increments scheduleVersion; equivalent normalized RRULE
or identical schedule is a no-op. Clients cannot set versions or statuses directly.
All old pending are cancelled atomically, including overdue and delayed pending.
Historical triggered/done/skipped/cancelled remain unchanged by PATCH.
Old triggered may DONE/SKIP without advancing any version; old versions cannot DELAY.

For an active parent: future anchor creates that first occurrence; past one-time creates
one overdue occurrence; past recurring selects the first valid logical time strictly
after now. An exhausted replacement rule is accepted with no new occurrence, and parent
completion is recomputed. Completed/cancelled parents reject schedule changes.
A return to a previous time is legal in a new scheduleVersion.

## Progression and identities

After trigger or early DONE/SKIP, advance strictly after max(now, scheduledFor), only
when that version has no later occurrence already. Historical actions never advance twice.
Do not materialize ungenerated downtime backlog; existing delayed occurrences are retained.
nextTriggerAt is min(triggerAt) across all pending, or null.

Logical identity: `(reminderId, scheduleVersion, scheduledFor)`.
Execution identity: `(occurrenceId, triggerVersion)`; A→B→A creates different generations.
Notification + initial Delivery + occurrence status/count + necessary next occurrence share
one guarded D1 batch. Dedupe is `reminder-occurrence:{occurrenceId}:trigger:{triggerVersion}`.
Action-first blocks stale acceptance; event-first preserves Notification and Delivery retries.
Notification response sourceContext.reminderId and sourceId resolve the nested action target;
read the current occurrence before acting on context from an older triggerVersion.
triggerAt is a target time; processing depends on the approximately one-minute scheduler cadence, without a seconds-level SLA.

## Intent mapping

| User intent | Action |
| --- | --- |
| 明天提醒我 | CREATE one-time |
| 每晚八点提醒我 | CREATE recurring with a matching first anchor |
| 做完了 | DONE exact occurrence |
| 晚两个小时 / 明天再提醒我 | DELAY exact occurrence |
| 今天算了，明天正常 | SKIP |
| 以后别提醒了 | CANCEL Reminder |
| 以后都改成晚上九点 | PATCH schedule |

## Errors

400 BAD_REQUEST: malformed datetime/fields/range; unknown fields are rejected.
401 UNAUTHORIZED: follow Skill credential handling; never print tokens.
404 REMINDER_NOT_FOUND / REMINDER_OCCURRENCE_NOT_FOUND / PROJECT_NOT_FOUND: absent or
outside user/parent scope. Do not probe or automatically create a replacement.
409 INVALID_REMINDER_STATE: cannot reschedule completed/cancelled parent.
409 INVALID_OCCURRENCE_STATE: terminal mismatch, old-version DELAY or cancelled-parent DELAY.
422 INVALID_TIMEZONE / INVALID_RRULE / INVALID_DELAY_TIME: correct input within intent.
500 INTERNAL_ERROR: outcome may be uncertain; read current state before retrying.
REMINDER_BUSY is reserved for a future uncertain external ownership scenario and is not
implemented or returned for ordinary same-D1 competition in this phase.
