# clawtique

A boutique for your OpenClaw. Dress it up, take it off, no mess left behind.

Setting up OpenClaw for a specific goal means installing skills, wiring cron jobs, defining memory sections, configuring plugins, and hoping nothing breaks when you update or remove one. Clawtique fixes this. A **dress** bundles everything OpenClaw needs for a job into a single installable package. The CLI handles installation, personalization, and clean removal.

## Quick start

```bash
# Initialize — point at your OpenClaw instance
clawtique init

# Put on a dress
clawtique dress

# See what's active
clawtique status

# Take it off (your data stays)
clawtique undress fitness-coach
```

## What's a dress?

A JSON package that bundles everything needed for a goal:

- **Skills** — what OpenClaw can do (e.g. plan workouts, read Oura data)
- **Crons** — when it does it (e.g. every weekday at 6pm)
- **Memory sections** — where it tracks what it learns (e.g. `## Fitness` in daily notes)
- **Heartbeat rules** — when to proactively check in
- **Secrets** — API keys, prompted at install time

```json
{
  "id": "fitness-coach",
  "name": "Fitness Coach",
  "version": "2.0.0",
  "requires": { "lingerie": ["waclaw"] },
  "crons": [
    {
      "id": "workout-schedule",
      "skill": "workout-schedule",
      "defaults": { "time": "18:00", "days": ["mon", "tue", "wed", "thu", "fri"] }
    }
  ],
  "skills": { "workout-schedule": {} },
  "memory": { "dailySections": ["Fitness"] }
}
```

## Lingerie

Some dresses share infrastructure — like a WhatsApp channel. These shared plugins are called **lingerie**. They're installed once automatically when a dress needs them, and removed only when nothing depends on them anymore.

```bash
clawtique lingerie list
```

## Personalization

When you put on a dress, clawtique prompts you to customize schedules and parameters. Times are converted to UTC automatically based on your timezone.

```
$ clawtique dress fitness-coach

  ? When should "Daily workout schedule" run? (18:00) › 17:30
  ? Which days? (mon-fri) › mon, wed, fri

  + cron: Daily workout schedule (30 15 * * 1,3,5 UTC)
  + cron: Post-workout check-in (0 17 * * 1,3,5 UTC)
  + memory section: Fitness
```

Update parameters later:

```bash
clawtique params fitness-coach --set workout-schedule.time=18:00
```

## The rules

**Config is removed. Data stays.** When you undress, clawtique removes cron jobs, skills, and config. Everything OpenClaw wrote while wearing that dress — daily notes, logs, generated files — stays untouched.

**Dresses compose safely.** Shared plugins are reference-counted. Conflicting memory sections are caught before anything is applied.

**Everything is tracked.** Every operation is a git commit. `clawtique log` shows the history. `clawtique rollback` undoes the last change.

## CLI reference

| Command | Description |
|---------|-------------|
| `clawtique init` | Initialize clawtique for an OpenClaw instance |
| `clawtique dress <id>` | Install a dress (interactive picker if no id) |
| `clawtique undress <id>` | Remove a dress's config, keep its data |
| `clawtique status` | List active dresses and their components |
| `clawtique params <id>` | View or update a dress's parameters |
| `clawtique diff` | Show everything clawtique has applied |
| `clawtique doctor` | Verify files, crons, and connections |
| `clawtique log` | History of all operations |
| `clawtique rollback` | Undo the last operation |
| `clawtique lingerie list` | Show installed lingerie and dependents |
| `clawtique lingerie remove <id>` | Remove unused lingerie |

Mutating commands support `--dry-run`. Read commands support `--json`.

## Available dresses

| Dress | Description |
|-------|-------------|
| `sleeping-coach` | Sleep coaching via Oura Ring |
| `fitness-coach` | Workout scheduling and feedback |
| `ontology` | Personal knowledge graph maintenance |
| `daily-reflection` | End-of-day reflection and intentions |
| `tech-bro-digest` | Daily tech news digest |
| `daily-pill` | One curated link per day |
| `fabric` | Portable AI memory via Fabric |

## Project structure

```
clawtique/
├── packages/
│   ├── cli/          # The clawtique CLI (oclif)
│   ├── core/         # Types, schemas, merge logic
│   ├── pack-utils/   # Build utilities
│   └── registry/     # Registry build script
└── registry/
    ├── dresses/      # Available dresses (JSON + skills)
    └── lingerie/     # Shared plugin packages
```

## Development

```bash
bun install
bun run build    # builds all packages via turbo
```
