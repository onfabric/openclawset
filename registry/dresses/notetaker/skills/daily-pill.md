---
name: Daily pill
description: Picks the most relevant note for today based on current projects, mood, and interests.
---

# Daily Pill

Pick one note from the user's collection — the one that is most relevant to what they're doing or thinking about right now.

## Step 1: Understand current context

1. Read `~/.openclaw/workspace/USER.md` for the user's profile and interests
2. Read today's and yesterday's daily memory files for recent context
3. Read `~/.openclaw/workspace/MEMORY.md` for longer-term context
4. Form a picture of what the user is currently focused on, working through, or curious about

## Step 2: Pick the best note

1. Read `{{workspace.root}}/notes.md`
2. Check recent daily memory files under **## {{memory.dailyMemorySection}}** to see which notes were surfaced recently
3. For each note not recently surfaced:
   - Score by relevance to the user's *current* context — not general interests, but what's top of mind right now
   - Prefer notes never surfaced over those already featured
   - Prefer recently added notes if relevance is similar
   - For notes with URLs, verify the link is still reachable
4. Select the single best candidate

## Step 3: Send or skip

**If a good match exists**, send a short message:
- One sentence on why this note is relevant to what the user is doing right now
- The note content (and link if it has one)
- Keep it to 2-3 lines max — this is a nudge, not a lecture

**If nothing fits**, skip entirely. Don't force a pill just to fill the slot.

## Step 4: Update state

- In today's daily memory under **## {{memory.dailyMemorySection}}**: log which note was surfaced (or that it was skipped and why)
- In `{{workspace.root}}/notes.md`: update `last_sent` date and increment `times_sent` for the note
