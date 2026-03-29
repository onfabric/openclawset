---
name: Tech digest
description: Searches configured news sources and compiles a morning digest of the most relevant stories.
---

# Tech Digest

Produce a concise daily digest of the most relevant launches and news from the last 24 hours.

## Sources

Search the web for the last 24 hours using **{{sources}}** as sources.

## Topics

Focus on: **{{topics}}**

Prioritize genuinely important or interesting items:
- Launches and product releases
- Major open-source tools
- Notable demos
- Benchmark/eval discussions tied to products
- Significant discussions that indicate real momentum

Ignore generic news unless it is clearly related to the configured topics.

## Output format

1. A short title line: `{{topics}} digest — <date>`
2. 3-7 bullets, each with: item name/topic, why it matters in one sentence, and source label(s) with link(s)
3. A final `Watchlist` line with 1-3 things that look promising but uncertain

## Style

- Keep it tight, useful, and non-hypey
- If there is little of substance, say so plainly and include only the few worthwhile items
- No filler, no cheerleading
