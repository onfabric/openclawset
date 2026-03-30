---
name: Notes
description: Add, remove, update, search, or review notes based on the user's message.
---

# Notes

The user wants to do something with their notes. Figure out what from their message and act accordingly.

## Step 1: Read current state

Read `{{workspace.root}}/notes.md` to see existing notes.

## Step 2: Determine the operation

- **Add** — the user shared something to remember (a thought, link, idea, reminder)
- **Remove** — the user wants to drop a note that's no longer relevant
- **Update** — the user wants to add context or change an existing note
- **Search** — the user is looking for a specific note by topic, tag, or keyword
- **Review** — the user wants to see what's in the list, prune stale entries, or tidy up

## Step 3: Execute

### Add

Extract the core content and any context from the user's message. If a URL is provided with no context, fetch the page for a title and one-line summary.

Append to `{{workspace.root}}/notes.md`:

```
- Content: <the note — a URL, thought, idea, or whatever the user shared>
  Title: <short descriptive title>
  Date added: <today's date>
  Tags: [<relevant tags>]
  times_sent: 0
  last_sent:
  notes: <user's context or your brief summary>
```

### Remove

Identify which note(s) the user means. If ambiguous, ask. Delete the entry from `{{workspace.root}}/notes.md`.

### Update

Find the matching note. Update the fields the user wants changed (content, tags, notes). Confirm what changed.

### Search

Find matching notes and present them concisely.

### Review

Summarize notes grouped by tag or topic. Flag stale ones (old, high `times_sent`, no longer relevant to user's current context from `~/.openclaw/workspace/USER.md` and recent daily memory). Suggest which to keep or remove — but let the user decide. Apply their decisions.

## Step 4: Confirm

One-line confirmation of what happened.
