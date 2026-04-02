---
name: Manage reminders
description: Lists, removes, or edits existing personal reminders.
---

# Manage Reminders

The user wants to see, remove, or modify their existing reminders. All reminders created by this dress have names prefixed with `[custom-personal-reminder]`.

## Step 1: List current reminders

Call the `cron` tool with `action: "list"`:

```json
{
  "action": "list"
}
```

Filter the results to only show jobs whose `name` starts with `[custom-personal-reminder]`. These are the reminders managed by this dress — ignore all other cron jobs.

## Step 2: Determine the operation

- **List** — the user wants to see what reminders are active
- **Remove** — the user wants to cancel a specific reminder
- **Edit** — the user wants to change the time or content of a reminder

## Step 3: Execute

### List

Present the filtered reminders in a clear format:
- Reminder description (the part after the `[custom-personal-reminder]` prefix)
- Schedule (translated to the user's local time — check `~/.openclaw/workspace/USER.md` for timezone)
- Whether it's one-time or recurring (one-time reminders have `schedule.kind: "at"`, recurring have `schedule.kind: "cron"`)

If there are no reminders, let the user know and offer to help set one up.

### Remove

Identify which reminder the user wants to remove. If ambiguous, show the list and ask them to clarify.

Call the `cron` tool with `action: "remove"`:

```json
{
  "action": "remove",
  "jobId": "<job-id>"
}
```

Confirm the removal to the user.

### Edit

To modify a reminder:
1. Remove the existing one using `cron` tool with `action: "remove"`
2. Create a new one with the updated parameters using `cron` tool with `action: "add"` (follow the set-reminder skill instructions)

Explain this to the user and confirm before proceeding.

## Step 4: Update daily memory

In today's daily memory under **## {{memory.dailyMemorySection}}**, log what operation was performed (listed, removed, or edited reminders).

## Rules

- Only touch cron jobs with the `[custom-personal-reminder]` prefix — never modify or remove other cron jobs
- Always confirm before removing a reminder
- When listing, translate cron expressions to human-readable schedules in the user's timezone
