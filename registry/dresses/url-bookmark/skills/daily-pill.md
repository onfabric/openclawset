---
name: Daily pill
description: Picks the most relevant bookmark for today based on current projects and interests.
---

# Daily Pill

Pick one bookmark from the user's reading list — the one that is most relevant to what they're doing or thinking about right now.

## Workspace files

All data lives in `{{workspace.root}}/`:
- `bookmarks.md` — saved links with metadata
- `pill-history.md` — log of past pills sent

## Step 1: Understand current context

1. Read `~/.openclaw/workspace/USER.md` for the user's profile and interests
2. Read today's and yesterday's daily memory files for recent context
3. Read `~/.openclaw/workspace/MEMORY.md` for longer-term context
4. Form a picture of what the user is currently focused on, working through, or curious about

## Step 2: Pick the best bookmark

1. Read `{{workspace.root}}/bookmarks.md` and `{{workspace.root}}/pill-history.md`
2. For each bookmark not recently sent (check pill history):
   - Score by relevance to the user's *current* context — not general interests, but what's top of mind right now
   - Prefer bookmarks never sent over those already featured
   - Prefer recently added bookmarks if relevance is similar
3. Select the single best candidate
4. Fetch the page and verify it's actually worth reading

## Step 3: Send or skip

**If a good match exists**, send a short message:
- One sentence on why this is relevant to what the user is doing right now
- The link title and URL
- Keep it to 2-3 lines max — this is a nudge, not a summary

**If nothing fits**, skip entirely. Don't force a pill just to fill the slot. Log the skip to pill history.

## Step 4: Update state

- In `{{workspace.root}}/pill-history.md`: append an entry with the date, link sent (or skip reason)
- In `{{workspace.root}}/bookmarks.md`: update `last_sent` date for the bookmark if one was sent
