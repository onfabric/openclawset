---
name: Workout nudge
description: Nudges the user if workout time is approaching and no schedule has been sent today.
---

# Workout Nudge

Check whether the daily workout schedule has been sent. If not, and workout time is approaching, send a friendly nudge.

## When to nudge

- Only nudge if no workout schedule was sent today (check **## {{memory.dailyMemorySection}}** in today's daily memory)
- Only nudge within 1 hour before the scheduled workout time
- Never nudge more than once per day
- Skip if the user is clearly busy or has indicated they're resting today

## What to send

A short, motivating message via WhatsApp:
- Reference today's expected workout if you know it from recent patterns
- Keep it to 1-2 lines
- Be encouraging, not pushy

## After nudging

Note in today's **## {{memory.dailyMemorySection}}** section that a nudge was sent, so you don't repeat it.
