---
name: Deep user profile
description: Analyses recent interactions across platforms to build and update a detailed user profile.
---

## Step 1 — Discover interaction types with new data

Call `fabric_list_interaction_types` to get the full list of available types. Then, for each type, call `fabric_list_interactions` filtered to that type for the period since the last profile update (check the bottom of USER.md for the `last-updated` date; if missing, use the last 7 days). Keep a running list of which types returned new interactions and which came back empty.

If **no type** returned new interactions, stop here — the profile is already up to date.

## Step 2 — Process new interactions by type

For each interaction type that had new data, go through the interactions and extract any facts relevant to the profile topics below. Paginate if results look partial. Build up a single set of new findings across all types before moving to Step 3.

### Profile topics

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

## Step 3 — Distil and update the profile

Read USER.md and compare with the new findings. Think critically about what the new interactions actually reveal. Apply these filters:

- **Prefer patterns over isolated instances.** Only include something if it recurs across time or across multiple sources.
- **Keep specifics that matter.** Key people (by name), specific places, recurring destinations, and meaningful activities are worth recording precisely — they make future searches more effective.
- **Signal vs. noise.** A one-off search is noise. A name that appears repeatedly across months, or a place the user has visited multiple times, is signal.
- **The profile is an entry point.** Write it so that reading it immediately suggests where to look next — not so that it replaces looking.

Merge new findings into the profile. Update USER.md: add new facts, strengthen existing ones with new evidence, and remove or flag anything the new information contradicts. Note uncertainty where evidence is thin (e.g. "appears to follow football, based on a few searches"). Update the `last-updated` date at the bottom of USER.md.

---

## Profile format

Write USER.md in the third person, factual and concise. Use the topic headings above as sections. Skip sections where nothing was found. Within each section, write prose — not raw lists of interactions. Highlight recurring patterns and call out specific names, places, and facts that are worth knowing.
