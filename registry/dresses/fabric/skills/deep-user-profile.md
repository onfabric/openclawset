---
name: Deep user profile
description: Analyses recent conversations to build and update a detailed user profile in Fabric.
---

Build a rich profile of the user by processing each topic below one at a time. For each topic, run the following three-step pipeline before moving on to the next.

## Topics

- Relationships — family, romantic partner, close friends, recurring names or people mentioned across platforms
- Work & career — job, company, industry, professional interests, side projects, tools used
- Travel — places visited, trips planned or taken, recurring destinations, travel style
- Food — restaurants, cuisines, dietary preferences or restrictions, cooking
- Activities & hobbies — recurring things done in free time, creative pursuits, games, reading
- Sport & fitness — sports practised or followed, teams supported, training habits
- Health & wellbeing — any recurring health-related searches or interests
- Entertainment — music, films, TV shows, podcasts, YouTube content consumed
- Shopping & brands — products researched or bought, recurring brands, style preferences
- Values & beliefs — political or social interests, causes, recurring themes in content consumed

---

## Three-step pipeline (repeat for each topic)

### Step 1 — Review existing profile

Read the current USER.md and extract what is already known about this topic. Hold that context in mind throughout the rest of the pipeline so that new findings are interpreted against it, not in isolation.

### Step 2 — Gather information

Search broadly first: call `fabric_search_memories` with a semantic query for this topic, without restricting the date range. If the results hint at adjacent sub-topics or related names and places, follow those threads with additional `fabric_search_memories` calls. For the most informative memories, call `fabric_list_interactions` for a date range surrounding those memories to surface the raw activity behind them — details that memories may have compressed or omitted. Paginate iteratively if any response looks partial.

### Step 3 — Distill and update

Think critically about what the gathered information actually reveals. The goal is not to record everything — it is to extract a genuine understanding of the user. Apply these filters:

- **Prefer patterns over isolated instances.** Only include something if it recurs across time or across multiple sources.
- **Keep specifics that matter.** Key people (by name), specific places, recurring destinations, and meaningful activities are worth recording precisely — they make future memory searches more effective.
- **Signal vs. noise.** A one-off search is noise. A name that appears repeatedly across months, or a place the user has visited multiple times, is signal.
- **The profile is an entry point.** Write it so that reading it immediately suggests where to look next in memory — not so that it replaces looking.

Merge what you found with what was already in the profile. Update USER.md: add new facts, strengthen existing ones with new evidence, and remove or flag anything the new information contradicts. Note uncertainty where evidence is thin (e.g. "appears to follow football, based on a few searches").

---

## Profile format

Write USER.md in the third person, factual and concise. Use the topic headings above as sections. Skip sections where nothing was found. Within each section, write prose — not raw lists of interactions. Highlight recurring patterns and call out specific names, places, and facts that are worth knowing.
