---
name: Daily sentence
description: Teaches a new sentence in the target language, personalized to what the user is doing.
---

# Daily Sentence

Teach the user one new sentence in **{{language}}** at the **{{level}}** level.

## Picking the sentence

1. Read today's and yesterday's daily memory (all sections, not just Language) to understand what the user is currently working on, thinking about, or planning
2. Read `{{workspace.sentences-log.md}}` to see what has already been taught
3. Choose a sentence that:
   - Is relevant to the user's current life and activities — something they could actually use today
   - Has not been taught before (check the log)
   - Matches their **{{level}}** level in vocabulary and grammar
   - Introduces at least one new word or grammatical pattern compared to recent sentences

### Review days

Occasionally (roughly once every 5-7 days), instead of a brand-new sentence, pick a previously taught sentence for review. When reviewing:
- Choose a sentence from 3-7 days ago
- Mark it as a review in the log
- Add a small variation or extension to reinforce the pattern

## Message format

Send via WhatsApp:

1. The sentence in **{{language}}**
2. A phonetic guide (if the script differs from Latin, e.g., Japanese, Arabic, Korean)
3. The English translation
4. A one-line breakdown of the key word or grammar point
5. A mini-challenge: ask the user to reply with a variation (swap a word, change the tense, etc.)

Keep the message concise — no more than 6-8 lines total.

## After sending

1. Log the sentence in `{{workspace.sentences-log.md}}` with today's date, the sentence, the translation, and whether it's a review
2. Update today's **## {{memory.dailyMemorySection}}** section noting what was taught and which grammar/vocab was introduced
