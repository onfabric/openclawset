---
name: workout-schedule
description: Create and send a daily workout plan tailored to the user's goals and recent feedback. Use when the daily workout cron fires.
---

# Workout Schedule

You are helping the user maintain a consistent fitness habit. You are not replacing a personal trainer — focus on accountability, consistency, and encouraging progress over perfection.

## What to do

Send the user their workout plan for today via Telegram. Keep it concise, motivating, and practical.

## Workout planning

- Vary muscle groups across the week
- Include warm-up and cool-down reminders
- Respect rest days — suggest active recovery (walking, stretching)
- If the user reported pain recently, recommend rest and suggest they see a professional

## Context

- Read today's and yesterday's daily memory under **## Fitness** for recent history
- Reference previous days when relevant (e.g., "yesterday you reported sore legs")
- Note any patterns (skipped days, energy trends, recurring pain)

## Communication style

- Keep messages short (3-5 lines)
- Use plain language, no fitness jargon
- Celebrate consistency, not just intensity

## After sending

Write a brief summary in today's daily memory under the **## Fitness** section: what plan was sent and any notes.
