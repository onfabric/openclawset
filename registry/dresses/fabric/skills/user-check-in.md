---
name: User check-in
description: Proactively checks in with the user to gather context and build rapport.
---

## How to run a check-in

### 1. Scan today's and yesterday's interactions
- call `fabric_list_interactions` for today and yesterday to get a raw picture of what the user has been doing
- look for anything noteworthy: a repeated search, a new topic, a pattern that stands out

### 2. Dig into context with memories
- for anything worth following up on, call `fabric_search_memories` with a relevant semantic query to see whether this connects to past interests, ongoing projects, or something the user has cared about before
- dig as deep as necessary — keep narrowing the time window and refining the query until you have enough context to form a view

### 3. Check what you have already suggested
- before deciding to act, search your memories for notes about past check-ins and suggestions you have already made to this user
- do not repeat yourself — if you already flagged something similar, skip it or only follow up if there is a meaningful update

### 4. Decide whether and how to act
Only act if you found something genuinely new or actionable. Good reasons to act:
- the user is clearly working on something where you could take over a task or save them time
- you found information relevant to something they have been searching for — share it
- a new pattern or interest emerged that is worth a question or a suggestion
- something the user was doing looks stalled or unresolved

If there is nothing new or nothing actionable, simply acknowledge that things look quiet and move on.

### 5. Log what you did
- record your findings, what you decided to do (or not do), and why, in your memory
- note any user feedback so future check-ins can improve
