---
name: Retrieve interactions
description: Lists recent Fabric interactions for context relevant to what the user is currently discussing.
---

# Retrieve Interactions

The user is discussing a topic where their recent activity across platforms could add valuable context. List their interactions before responding.

## Step 1: Identify the topic

From the current conversation, determine what the user is talking about or asking about. Extract key themes, names, places, or interests.

## Step 2: List relevant interactions

Call `fabric_list_interaction_types` to understand what platforms are available, then call `fabric_list_interactions` filtering by relevant types and recent date ranges. Paginate if needed to find interactions that relate to the topic.

## Step 3: Use the context

Weave relevant interactions naturally into your response:
- Reference past activity or patterns that are directly relevant
- Don't force it — only include context that genuinely adds value
- Don't announce that you searched interactions; just use the context naturally

## What NOT to do

- Don't surface every interaction you find — pick the most relevant ones
- Don't share sensitive activity unless the conversation clearly calls for it
- Don't make the user feel surveilled — be helpful, not creepy
