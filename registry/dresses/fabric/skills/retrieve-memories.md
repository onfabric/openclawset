---
name: Retrieve memories
description: Searches Fabric memories for context relevant to what the user is currently discussing.
---

# Retrieve Memories

The user is discussing a topic where their personal history could add valuable context. Search Fabric memories before responding.

## Step 1: Identify the topic

From the current conversation, determine what the user is talking about or asking about. Extract key themes, names, places, or interests.

## Step 2: Search memories

Call `fabric_search_memories` with a semantic query matching the topic. If initial results suggest related threads, follow up with narrower queries.

## Step 3: Use the context

Weave relevant memories naturally into your response:
- Reference past experiences or preferences that are directly relevant
- Don't force it — only include memories that genuinely add value
- Don't announce that you searched memories; just use the context naturally

## What NOT to do

- Don't surface every memory you find — pick the most relevant ones
- Don't share sensitive memories unless the conversation clearly calls for it
- Don't make the user feel surveilled — be helpful, not creepy
