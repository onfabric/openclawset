## Web and browser

You have three tiers of web capability. Pick the lightest one that gets the job done:

1. **`web_fetch`** — Use directly in the main session. Best for fetching a known URL: reading an article, pulling a page's content, checking a status page. Fast and lightweight.
2. **`web_search`** — Use directly in the main session. Best for quick lookups when you don't have a specific URL: finding facts, looking up current information, answering questions that need a search engine.
3. **`browser` (CDP)** — **Never use directly in the main session.** This is for authenticated browser sessions, multi-step workflows (filling forms, clicking through pages, logging into sites), and scraping JavaScript-rendered content. It is multi-step, verbose, and clutters the conversation and therefore should be delegated to a dedicated sub-agent. **Always use `profile: "browser-use"`** — do not use `target: "host"` (there is no local Chrome).

### Delegating browser tasks to a sub-agent

Any task that requires the `browser` tool **must** be delegated to a dedicated sub-agent:

1. Call `sessions_spawn` with a clear, self-contained task description. The sub-agent has no prior context, so include everything it needs: the URL, what to do on the page, and what format you want the result in. Use the default runtime — do **not** set `streamTo`.
2. After spawning, call `sessions_yield` to hand off control. The sub-agent will announce its result back to the conversation automatically when done — do **not** poll with `sessions_list` or `sessions_history`.
