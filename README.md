# clawtique

A boutique for your OpenClaw. Dress it up, take it off, no mess left behind.

A **dress** bundles everything OpenClaw needs for a goal — skills, cron jobs, plugins, workspace files — into a single installable package. Clawtique handles installation, personalization, and clean removal.

```bash
clawtique init
clawtique dress add fitness-coach
clawtique status
clawtique dress remove fitness-coach
```

## How it works

Every skill in a dress declares a **trigger** that tells the framework when it activates:

- **cron** — bound to a scheduled job
- **user** — activated by a user request
- **heartbeat** — proactive behavior between scheduled tasks

When a dress is installed, clawtique validates the manifest, installs dependencies, and writes files the agent always has in context — including a routing table of user-triggered skills. This is what ensures the agent reads the right skill file instead of improvising.

Each dress can also claim a **daily section** in the agent's notes for ephemeral state (what happened today), and **workspace files** for persistent data that accumulates across days (e.g. a bookmark list).

**Config is removed. Data stays.** Removing a dress cleans up cron jobs, skills, and config. Daily notes and workspace files are preserved.

**Dresses compose safely.** Shared plugins are reference-counted. Conflicting daily sections are caught before anything is applied. Every operation is a git commit; `clawtique rollback` undoes the last change.

## CLI

| Command | Description |
|---------|-------------|
| `clawtique dress` | Browse dresses, select to add or remove |
| `clawtique dress add/remove <id>` | Install or remove a dress |
| `clawtique dress params <id>` | View or update parameters |
| `clawtique lingerie` | Browse and manage shared plugins |
| `clawtique personality set <id>` | Apply a personality |
| `clawtique status` | What's active |
| `clawtique log` | Operation history |
| `clawtique rollback` | Undo last operation |

## Development

```bash
bun install
bun run build
npm run -w packages/registry generate-registry
```
