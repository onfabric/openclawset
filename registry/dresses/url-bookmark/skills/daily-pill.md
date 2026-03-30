---
name: Daily pill
description: Picks the most relevant bookmark for today based on current projects and interests.
---

# Daily Pill

Pick one bookmark from the user's reading list — the one that is most relevant to what they're doing or thinking about right now.

## Step 1: Understand current context

1. Read `~/.openclaw/workspace/USER.md` for the user's profile and interests
2. Read today's and yesterday's daily memory files for recent context
3. Read `~/.openclaw/workspace/MEMORY.md` for longer-term context
4. Form a picture of what the user is currently focused on, working through, or curious about

## Step 2: Pick the best bookmark

1. Read `{{workspace.root}}/bookmarks.md`
2. Check recent daily memory files under **## {{memory.dailyMemorySection}}** to see which bookmarks were sent recently
3. For each bookmark not recently sent:
   - Score by relevance to the user's *current* context — not general interests, but what's top of mind right now
   - Prefer bookmarks never sent over those already featured
   - Prefer recently added bookmarks if relevance is similar
4. Select the single best candidate
5. Fetch the page and verify it's actually worth reading

## Step 3: Send or skip

**If a good match exists**, send a short message:
- One sentence on why this is relevant to what the user is doing right now
- The link title and URL
- Keep it to 2-3 lines max — this is a nudge, not a summary

**If nothing fits**, skip entirely. Don't force a pill just to fill the slot.

## Step 4: Update state

- In today's daily memory under **## {{memory.dailyMemorySection}}**: log which bookmark was sent (or that it was skipped and why)
- In `{{workspace.root}}/bookmarks.md`: update `last_sent` date and increment `times_sent` for the bookmark
