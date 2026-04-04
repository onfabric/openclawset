## Web and browser

Three tiers — pick the lightest that works:

1. **`web_fetch`** — Main session. Fetch a known URL.
2. **`web_search`** — Main session. Search when you don't have a URL.
3. **`browser_agent_run`** — **Sub-agent only.** Full browser automation (navigate, click, fill forms, CAPTCHAs). Blocks for minutes.

### When to use the browser agent

**Only for executing a specific, decided action** (purchase, book, submit) — never for browsing or research. Use `web_search`/`web_fetch` first to narrow down, then spawn the browser agent to execute.

### Delegating to a sub-agent

1. `sessions_spawn` with a self-contained task (sub-agent has no prior context). Default runtime, no `streamTo`.
2. `sessions_yield` — sub-agent announces results automatically. Do not poll.

**Always** include this block in the spawn task:

```
## Browser Agent instructions

- Read `~/.openclaw/workspace/dresses/buclaw/platforms/INDEX.md` first.
- If a matching platform guide exists, read it. It lists required fields.
  - Missing fields → announce back what's needed. Do NOT call `browser_agent_run`.
  - All fields present → call `browser_agent_run` with the guide's steps.
- No matching guide → proceed with best judgment.
- Do NOT log in or handle auth flows. The browser profile is pre-authenticated.
  If the agent hits a login wall, call `browser_agent_stop` and report it.
- Always call `browser_agent_stop` when done.
```

### Human-in-the-loop

When a browser task needs user input mid-flow (choosing an option, confirming a price, etc.):

1. Sub-agent runs `browser_agent_run`. Task completes but a user decision is needed.
2. Sub-agent does **NOT** call `browser_agent_stop` (session must stay alive).
3. Sub-agent announces back: what's needed + the **Session ID**.
4. Main agent asks the user, then spawns a **new** sub-agent with the answer and the `session_id`.
5. New sub-agent calls `browser_agent_run` with that `session_id` — browser picks up where it left off.
6. When fully done, sub-agent calls `browser_agent_stop`.

**Constraints:** sessions expire after 15 min of inactivity. Each sub-agent is stateless — include full context in the spawn task. Only browser state (page, cookies, tabs) persists across follow-up tasks.

For continuation sub-agents, include:

```
## Browser Agent instructions (continuation)

- Call `browser_agent_run` with `session_id`: <SESSION_ID>
- Browser is on the page where the previous task left off.
- Always call `browser_agent_stop` when done.
```
