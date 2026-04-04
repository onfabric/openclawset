# clawtique

A dress manager for [OpenClaw](https://openclaw.ai). Install capabilities, take them off, no mess left behind.

A **dress** bundles everything OpenClaw needs for a specific job — skills, cron schedules, plugins, heartbeat rules, workspace files — into one installable package. Clawtique handles installation, personalization, and clean removal.

## Quick start

```bash
clawtique init
clawtique dress add journaling-companion
clawtique status
clawtique dress remove journaling-companion
```

## How it works

### What OpenClaw loads

OpenClaw always loads these files at session start: `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `IDENTITY.md`. It also auto-discovers all installed skills from `~/.openclaw/workspace/skills/` and injects their name and description into every turn.

Clawtique hooks into this by injecting a reference to `DRESSES.md` in `AGENTS.md`. This creates the discovery chain:

```
AGENTS.md (always loaded)
  → DRESSES.md (lists active dresses)
      → DRESSCODE.md (per dress — skills, schedules, workspace files)
```

### What a dress contains

- **Skills** — markdown files installed to `~/.openclaw/workspace/skills/<id>/SKILL.md`
- **Crons** — scheduled tasks bound to skills
- **Plugins** — OpenClaw plugins required by the dress
- **Heartbeat rules** — proactive behaviors appended to `HEARTBEAT.md`
- **Workspace files** — templates copied to `~/.openclaw/workspace/dresses/<dress-id>/`
- **Daily memory section** — a named section the agent owns in daily notes

### What each command does

**`clawtique init`** — Creates `~/.clawtique/` (config, state, git repo). Writes an initial `DRESSES.md` to the OpenClaw workspace. Injects the DRESSES.md reference into `AGENTS.md`.

**`clawtique personality set <id>`** — Overwrites personality files (`AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `TOOLS.md`), then re-injects the DRESSES.md reference since the overwrite removes it.

**`clawtique dress add <id>`** — Installs skills, plugins, crons, heartbeat rules, and workspace files. Generates a `DRESSCODE.md` describing everything the dress provides. Updates `DRESSES.md` with the new dress. All changes are tracked in state and committed to git.

**`clawtique dress remove <id>`** — Removes crons, skills (only those clawtique installed), plugins (only if no other dress needs them), heartbeat rules, and dress files. Workspace files are preserved by default. Rebuilds `DRESSES.md`. Data the agent created while the dress was active stays untouched.

### Lingerie

Some dresses need shared plugins — like a messaging channel. These are called **lingerie**. They're installed automatically when a dress requires them and only removed when nothing depends on them.
