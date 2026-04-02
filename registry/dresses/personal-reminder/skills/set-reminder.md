---
name: Set reminder
description: Parses the user's reminder request, determines timing, and creates a cron job.
---

# Set Reminder

The user wants to be reminded about something. Your job is to understand what, when, and how often — then create the appropriate cron job.

## Step 1: Load user context

1. Read `~/.openclaw/workspace/USER.md` for the user's profile
2. Read today's and yesterday's daily memory for recent context
3. Determine the user's **timezone** — check `~/.openclaw/workspace/memory/MEMORY.md` for timezone info. If you cannot determine it, ask and then store it in `~/.openclaw/workspace/memory/MEMORY.md`.

## Step 2: Parse the reminder

From the user's message, extract:
- **What**: The reminder message (what they want to be reminded about)
- **When**: The date/time or schedule for the reminder
- **Recurrence**: Whether this is a one-time or recurring reminder

Examples:
- "Remind me to call the dentist tomorrow at 10am" → one-time, specific date/time
- "Remind me every Monday at 9am to submit my weekly report" → recurring, weekly
- "Remind me in 2 hours to check the oven" → one-time, relative time
- "Remind me every day at 8pm to take my vitamins" → recurring, daily

If the request is ambiguous (e.g., missing time, unclear recurrence), ask for clarification before creating the cron.

## Step 3: Create the cron

Call the `cron` tool with `action: "add"`. Use these fixed parameter values — do NOT deviate:

- **`name`**: MUST start with `[custom-personal-reminder]` — this is how we identify reminder crons
- **`sessionTarget`**: `"isolated"` — never use `"main"`
- **`payload.kind`**: `"agentTurn"` with `thinking: "low"`
- **`delivery`**: `mode: "announce"`, `channel: "waclaw"` — never ask the user which channel to use

### For recurring reminders

- `schedule.kind`: `"cron"`
- `schedule.expr`: 5-field cron expression in the user's local time
- `schedule.tz`: user's IANA timezone (the `tz` field handles UTC conversion)

### For one-time reminders

- `schedule.kind`: `"at"`
- `schedule.at`: ISO 8601 timestamp with timezone offset (e.g. `2025-03-15T10:00:00+01:00`)
- `deleteAfterRun`: `true` — the job is automatically cleaned up after it fires
- For relative times ("in 2 hours"), calculate the absolute ISO 8601 timestamp from the current time

## Step 4: Confirm

Send a **short, natural confirmation**. Just acknowledge the reminder is set — one or two sentences max.

Good: "Done — I'll remind you to call the dentist tomorrow at 10am."
Good: "All set! You'll get a reminder every Monday at 9am about the weekly report."

**Never mention** cron expressions, tool calls, session types, delivery modes, UTC times, or any other technical details in your response. Always express times in the user's local timezone.

## Step 5: Update daily memory

In today's daily memory under **## {{memory.dailyMemorySection}}**, log:
- What reminder was created
- The schedule (human-readable)
- Whether it's one-time or recurring

## Rules

- Always include the user's IANA timezone: in `schedule.tz` for recurring reminders, and as the offset in the ISO 8601 timestamp for one-time reminders
- For relative times ("in 2 hours"), calculate the absolute time from now
- Keep the reminder message clear and actionable
- If the tool call fails, fix it silently and retry. Do not surface errors to the user.
- If the error keeps persisting, after trying multiple times, let the user know but without going into technical details.
