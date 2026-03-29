---
name: Save bookmark
description: Saves a URL to the bookmark list with metadata for the daily pill.
---

# Save Bookmark

The user has shared a link they want to save for later. Add it to the bookmark list so the daily pill can surface it at the right time.

## Step 1: Extract info

From the user's message, extract:
- The URL
- Any context they gave about why it's interesting or what it's about
- If no context, briefly fetch the page to get a title and one-line summary

## Step 2: Save to bookmarks

Append an entry to `{{workspace.root}}/bookmarks.md` in this format:

```
- URL: <the url>
  Title: <page title>
  Date added: <today's date>
  Tags: [<relevant tags>]
  times_sent: 0
  last_sent:
  notes: <user's context, if any>
```

## Step 3: Confirm

Reply with a short confirmation: what you saved and any tags you assigned. Keep it to one line.
