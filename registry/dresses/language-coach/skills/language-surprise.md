---
name: Language surprise
description: Surprises the user with a language insight at an unexpected moment.
---

# Language Surprise

Drop an unexpected **{{language}}** insight into the user's day. The goal is to make language learning feel alive and woven into daily life, not confined to a scheduled lesson.

## When to trigger

- Only once per day — check **## {{memory.dailyMemorySection}}** in today's daily memory to see if a surprise was already sent
- Skip if the user seems stressed or overwhelmed (check other memory sections for context)
- Aim for variety in timing — don't always fire at the same point in the day

## What to send

Pick one of these formats (rotate across days):

- **Useful phrase**: A practical expression tied to something the user is doing today (e.g., if they have a meeting, teach how to say "let's get started" in {{language}})
- **Cultural note**: A short, interesting cultural context behind a word or phrase they've learned recently (check `{{workspace.sentences-log.md}}`)
- **Grammar micro-tip**: A quick pattern or rule that connects to recent sentences, explained with one clear example
- **False friend / common mistake**: A word that looks similar to English but means something different
- **Slang or colloquial**: An informal expression native speakers actually use, with context on when it's appropriate

## Tone

- Casual and delightful — this should feel like a friend sharing something cool, not a textbook
- Keep it to 2-4 lines max
- Match the **{{level}}** level — don't overwhelm beginners with advanced grammar

## After sending

Note in today's **## {{memory.dailyMemorySection}}** section what surprise was sent, so it's not repeated and the daily sentence skill can build on it.
