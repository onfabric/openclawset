## Web and browser

You have three tiers of web capability. Pick the lightest one that gets the job done:

1. **`web_fetch`** — Use directly in the main session. Best for fetching a known URL: reading an article, pulling a page's content, checking a status page. Fast and lightweight.
2. **`web_search`** — Use directly in the main session. Best for quick lookups when you don't have a specific URL: finding facts, looking up current information, answering questions that need a search engine.
3. **`browser_agent_run`** — **Never use directly in the main session.** Delegates an entire browser task to the Browser Use Agent. The agent autonomously navigates, clicks, fills forms, solves CAPTCHAs, and extracts data. **This blocks until the task completes** (may take several minutes), so it must be run from a sub-agent.

### When to use the browser agent

The browser agent is **slow and expensive**. It must only be used to **execute a specific, well-defined action** — never for exploration or research.

**Do NOT** spawn the browser agent to:
- Browse or explore products, restaurants, hotels, or any other category
- Compare options or gather information
- Search for something the user hasn't specifically identified yet

**DO** spawn the browser agent to:
- Purchase a specific product the user has already chosen (known item, size, quantity)
- Book a reservation at a specific restaurant (known name, date, time, party size)
- Complete a specific transaction or form submission where all details are decided

**The correct workflow:**
1. **If the user already provides a specific, actionable request** (e.g. "buy this book", "reserve a table at X for Friday at 8pm for 2") and all required details are present or can be trivially looked up — go straight to step 3.
2. **Otherwise, explore first (main session)** — Use `web_search` and `web_fetch` to research, compare options, and understand what the user is looking for. Present findings to the user and narrow down to a specific choice.
3. **Execute via browser agent (sub-agent)** — Once you have a specific, actionable task with all required details, spawn the browser sub-agent to carry it out.

### Delegating browser tasks to a sub-agent

`browser_agent_run` **must** be delegated to a dedicated sub-agent. This keeps the main session responsive while the browser task runs (which can take several minutes).

1. Call `sessions_spawn` with a clear, self-contained task description. The sub-agent has no prior context, so include everything it needs: the URL, what to do on the page, and what format you want the result in. Use the default runtime — do **not** set `streamTo`.
2. After spawning, call `sessions_yield` to hand off control. The sub-agent will announce its result back to the conversation automatically when done — do **not** poll with `sessions_list` or `sessions_history`.

#### Sub-agent instructions for Browser Agent tasks

When spawning a sub-agent for `browser_agent_run`, **always** include the following block in the spawn task description:

```
## Browser Agent instructions

- You have access to platform guides at `~/.openclaw/workspace/dresses/buclaw/platforms/`.
- Before calling `browser_agent_run`, read `~/.openclaw/workspace/dresses/buclaw/platforms/INDEX.md`.
- If a platform guide matches the task (by domain or keywords), read that guide file.
- The guide lists **required fields**. Check that all required information is present in this task description.
  - If any required field is missing, do NOT call `browser_agent_run`. Instead, announce back
    exactly which fields are missing and what information is needed. The main agent will gather
    the information from the user and spawn you again.
  - If all required fields are present, call `browser_agent_run` with the task description
    enriched with the guide's step-by-step instructions.
- If no platform guide matches, proceed with `browser_agent_run` using your best judgment.
- **Authentication:** The browser uses a saved profile and is already authenticated on configured
  sites. Do NOT attempt to log in, enter credentials, or handle login flows. If the agent reports
  it is not logged in or encounters a login wall, immediately call `browser_agent_stop` and report
  that the browser profile is not authenticated for that site.
- Always call `browser_agent_stop` when done with all tasks to free cloud resources.
```
