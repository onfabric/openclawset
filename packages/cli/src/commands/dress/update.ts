import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Args, Flags } from '@oclif/core';
import chalk from 'chalk';
import { Listr } from 'listr2';
import { BaseCommand } from '#base.ts';
import type { DressJson, Weekday } from '#core/index.ts';
import {
  type AppliedCron,
  ensureDressesReference,
  generateDresscode,
  removeSection,
  wrapSection,
} from '#core/index.ts';
import {
  type CronScheduleChoice,
  compileDress,
  compiledToResolved,
  parseSkillMeta,
  validateDress,
} from '#lib/compile.ts';
import { checkbox, input, select } from '#lib/prompt.ts';
import { createRegistryProvider } from '#lib/registry.ts';

const ALL_DAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export default class DressUpdate extends BaseCommand {
  static override summary = 'Update schedules or params for an active dress';

  static override description =
    'Re-configure an active dress without removing it. Updates cron schedules, ' +
    'skill params, or both. Recompiles affected skills, regenerates DRESSCODE.md, ' +
    'and updates crons in OpenClaw atomically.';

  static override examples = [
    '<%= config.bin %> dress update fitness-coach',
    '<%= config.bin %> dress update fitness-coach --schedules \'{"workout-schedule":{"time":"07:00","days":["mon","wed","fri"]}}\'',
    '<%= config.bin %> dress update fitness-coach --params \'{"workout-schedule":{"muscleGroup":"legs"}}\'',
  ];

  static override args = {
    id: Args.string({
      description: 'Dress ID to update',
      required: false,
    }),
  };

  static override flags = {
    ...BaseCommand.baseFlags,
    schedules: Flags.string({
      description: 'Cron schedules as JSON: {"cronId": {"time":"HH:MM","days":["mon",...]}}',
    }),
    params: Flags.string({
      description: 'Skill params as JSON: {"skillId": {"paramName": "value"}}',
    }),
    'dry-run': Flags.boolean({
      description: 'Show what would change without applying',
      default: false,
    }),
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip confirmation prompts',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(DressUpdate);
    const config = await this.loadConfig();

    const state = await this.stateManager.load();

    // Pick dress
    let dressId = args.id;
    if (!dressId) {
      const activeIds = Object.keys(state.dresses);
      if (activeIds.length === 0) {
        this.error('No active dresses to update.');
      }
      dressId = await select({
        message: 'Choose a dress to update',
        choices: activeIds.map((id) => ({
          name: `${id} ${chalk.dim(`v${state.dresses[id]!.version}`)}`,
          value: id,
        })),
      });
    }

    const entry = this.stateManager.getDressEntry(state, dressId);
    if (!entry) {
      this.error(`Dress "${dressId}" is not active.`);
    }

    // Load dress definition from registry
    const registry = createRegistryProvider(process.cwd(), this.clawtiquePaths.cache);
    let dress: DressJson;
    try {
      dress = await registry.getDressJson(dressId);
    } catch {
      this.error(
        `Could not load dress "${dressId}" from registry. ` +
          'The registry is needed to recompile skills.',
      );
    }

    // Fetch skill contents
    const skillContents = new Map<string, string>();
    for (const [skillId, skillDef] of Object.entries(dress.skills)) {
      if (skillDef.source === 'clawhub') continue;
      try {
        const content = await registry.getSkillContent(dressId, skillId);
        skillContents.set(skillId, content);
      } catch {
        this.error(`Failed to fetch skill "${skillId}" for dress "${dressId}".`);
      }
    }

    // Validate
    const validation = validateDress(dress, skillContents);
    if (validation.errors.length > 0) {
      for (const err of validation.errors) {
        this.log(`  ${chalk.red('✗')} ${err}`);
      }
      this.error('Dress definition has errors.');
    }

    // Resolve current values from state
    const currentSchedules: Record<string, CronScheduleChoice> = entry.schedules
      ? Object.fromEntries(
          Object.entries(entry.schedules).map(([id, s]) => [
            id,
            { time: s.time, days: s.days as Weekday[], channel: s.channel },
          ]),
        )
      : {};
    const currentParams: Record<string, Record<string, unknown>> = (entry.params ?? {}) as Record<
      string,
      Record<string, unknown>
    >;

    // Collect new values
    let newSchedules: Record<string, CronScheduleChoice>;
    let newParams: Record<string, Record<string, unknown>>;

    if (flags.schedules || flags.params) {
      // Non-interactive mode
      newSchedules = flags.schedules
        ? (JSON.parse(flags.schedules) as Record<string, CronScheduleChoice>)
        : {};
      newParams = flags.params
        ? (JSON.parse(flags.params) as Record<string, Record<string, unknown>>)
        : {};

      // Merge with current: only override what's provided
      newSchedules = { ...currentSchedules, ...newSchedules };
      newParams = { ...currentParams, ...newParams };

      // If dress has crons but no schedules are available, we can't compile
      const missingSchedules = dress.crons.filter((c) => !newSchedules[c.id]);
      if (missingSchedules.length > 0) {
        this.error(
          `Missing schedules for cron(s): ${missingSchedules.map((c) => c.id).join(', ')}.\n` +
            'This dress was installed before schedule tracking was added.\n' +
            'Run without --schedules/--params to re-enter schedules interactively.',
        );
      }
    } else {
      // Interactive mode
      newSchedules = { ...currentSchedules };
      newParams = { ...currentParams };

      // Prompt for schedules
      if (dress.crons.length > 0) {
        this.log(chalk.bold(`\n  Schedules (current values shown as defaults):\n`));

        for (const cron of dress.crons) {
          const current = currentSchedules[cron.id];
          const defaultTime = current?.time ?? cron.defaults.time ?? '09:00';
          const defaultDays = current?.days ?? cron.defaults.days ?? ALL_DAYS;

          const cronSkillId = Object.entries(dress.skills).find(
            ([, s]) => s.trigger.type === 'cron' && s.trigger.cronId === cron.id,
          )?.[0];
          this.log(`  ${chalk.cyan(cron.name)}${cronSkillId ? ` → skill: ${cronSkillId}` : ''}`);

          const time = await input({
            message: `  Time (HH:MM)`,
            default: defaultTime,
            validate: (v) => /^\d{2}:\d{2}$/.test(v) || 'Use HH:MM format',
          });

          const days = (await checkbox({
            message: `  Days`,
            choices: ALL_DAYS.map((d) => ({
              name: d,
              value: d as Weekday,
              checked: defaultDays.includes(d),
            })),
          })) as Weekday[];

          if (days.length === 0) {
            this.error('Must select at least one day.');
          }

          let channel: string | undefined = current?.channel;
          if (!channel && dress.requires.lingerie.length === 1) {
            channel = dress.requires.lingerie[0];
          } else if (!channel && dress.requires.lingerie.length > 1) {
            channel = await select({
              message: `  Channel`,
              choices: dress.requires.lingerie.map((id) => ({ name: id, value: id })),
            });
          }

          newSchedules[cron.id] = { time, days, channel };
          this.log('');
        }
      }

      // Prompt for params
      for (const [skillId, skillDef] of Object.entries(dress.skills)) {
        const paramEntries = Object.entries(skillDef.params);
        if (paramEntries.length === 0) continue;

        const content = skillContents.get(skillId);
        const meta = content ? parseSkillMeta(content) : undefined;
        this.log(`  ${chalk.bold(meta?.name ?? skillId)}`);

        const values: Record<string, unknown> = {};
        const currentSkillParams = currentParams[skillId] ?? {};

        for (const [paramName, paramDef] of paramEntries) {
          const currentVal = currentSkillParams[paramName] ?? paramDef.default;
          if (paramDef.type === 'number') {
            const raw = await input({
              message: `    ${paramDef.description}`,
              default: String(currentVal),
            });
            values[paramName] = Number(raw);
          } else if (paramDef.type === 'string[]') {
            const raw = await input({
              message: `    ${paramDef.description}`,
              default: (currentVal as string[]).join(', '),
            });
            values[paramName] = raw
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean);
          } else {
            const raw = await input({
              message: `    ${paramDef.description}`,
              default: String(currentVal),
            });
            values[paramName] = raw;
          }
        }

        newParams[skillId] = values;
        this.log('');
      }
    }

    // Compute what changed
    const scheduleChanges: string[] = [];
    for (const cron of dress.crons) {
      const prev = currentSchedules[cron.id];
      const next = newSchedules[cron.id];
      if (!next) continue;
      if (
        !prev ||
        prev.time !== next.time ||
        JSON.stringify(prev.days) !== JSON.stringify(next.days)
      ) {
        const label = prev
          ? `${prev.time} ${prev.days.join(',')} → ${next.time} ${next.days.join(',')}`
          : `${next.time} ${next.days.join(',')}`;
        scheduleChanges.push(`  ${chalk.yellow('~')} cron ${cron.name}: ${label}`);
      }
    }

    const paramChanges: string[] = [];
    for (const [skillId, values] of Object.entries(newParams)) {
      const prev = currentParams[skillId] ?? {};
      for (const [key, val] of Object.entries(values)) {
        if (JSON.stringify(prev[key]) !== JSON.stringify(val)) {
          paramChanges.push(
            `  ${chalk.yellow('~')} ${skillId}.${key}: ${chalk.red(JSON.stringify(prev[key]))} → ${chalk.green(JSON.stringify(val))}`,
          );
        }
      }
    }

    if (scheduleChanges.length === 0 && paramChanges.length === 0) {
      this.log('\nNo changes detected.\n');
      return;
    }

    this.log(chalk.bold('\nChanges:\n'));
    for (const c of scheduleChanges) this.log(c);
    for (const c of paramChanges) this.log(c);
    this.log('');

    if (this.isDryRun(flags)) return;
    if (await this.confirmOrAbort(flags)) return;
    await this.ensureHealthy();

    // Recompile the dress with new values
    const compiled = compileDress({
      dress,
      skillContents,
      cronSchedules: newSchedules,
      skillParams: newParams,
      timezone: config.timezone,
    });

    await this.withAtomicOp(async () => {
      const tasks = new Listr(
        [
          {
            title: 'Updating crons',
            skip: () => scheduleChanges.length === 0,
            task: async () => {
              // Remove old crons
              for (const cron of entry.applied.crons) {
                try {
                  await this.openclawDriver.cronRemove(cron);
                } catch {
                  // May have been manually removed
                }
              }
              // Add new crons
              for (const cron of compiled.crons) {
                await this.openclawDriver.cronAdd(cron);
              }
            },
          },
          {
            title: 'Recompiling skills',
            skip: () => compiled.bundledSkills.size === 0,
            task: async () => {
              for (const [skillName, content] of compiled.bundledSkills) {
                await this.openclawDriver.skillCopyBundled(skillName, content);
              }
            },
          },
          {
            title: 'Regenerating DRESSCODE.md',
            task: async () => {
              const dressDir = join(this.openclawPaths.dresses, dressId);
              const resolved = compiledToResolved(compiled);
              const dresscode = generateDresscode(resolved, compiled.skillTriggers);
              await writeFile(join(dressDir, 'DRESSCODE.md'), dresscode);
            },
          },
          {
            title: 'Updating heartbeat rules',
            skip: () => {
              const hbSkills = Object.entries(compiled.skillTriggers).filter(
                ([, t]) => t.type === 'heartbeat',
              );
              return hbSkills.length === 0;
            },
            task: async () => {
              const heartbeatPath = this.openclawPaths.heartbeat;

              // Strip old rules
              if (existsSync(heartbeatPath)) {
                const content = await readFile(heartbeatPath, 'utf-8');
                if (content.includes(`clawtique:${dressId}`)) {
                  const cleaned = removeSection(dressId, content);
                  await writeFile(heartbeatPath, cleaned);
                }
              }

              // Write new rules
              const hbEntries = Object.entries(compiled.skillTriggers)
                .filter(([, t]) => t.type === 'heartbeat')
                .map(
                  ([id, t]) =>
                    `**${id}** — ${(t as { description: string }).description}\n  → \`~/.openclaw/skills/${id}/SKILL.md\``,
                );

              let content = existsSync(heartbeatPath) ? await readFile(heartbeatPath, 'utf-8') : '';
              const rulesBlock = hbEntries.map((r) => `- ${r}`).join('\n');
              const section = `\n## ${dressId}\n${rulesBlock}\n`;
              const wrapped = wrapSection(dressId, section);
              content = `${content.trimEnd()}\n\n${wrapped}\n`;
              await writeFile(heartbeatPath, content);
            },
          },
          {
            title: 'Ensuring DRESSES.md reference',
            task: async () => {
              const workspaceDir = join(this.openclawPaths.root, 'workspace');
              await ensureDressesReference(workspaceDir);
            },
          },
          {
            title: 'Saving state',
            task: async () => {
              const allSkills = [...compiled.bundledSkills.keys(), ...compiled.clawHubSkills];
              const appliedCrons: AppliedCron[] = compiled.crons.map((c) => ({
                qualifiedId: `${c.dressId}:${c.id}`,
                displayName: `[${c.dressId}] ${c.name}`,
                skill: c.skill,
                channel: c.channel,
              }));

              entry.params = Object.fromEntries(
                Object.entries(newParams).filter(([, v]) => Object.keys(v).length > 0),
              );
              entry.schedules = newSchedules;
              entry.applied = {
                ...entry.applied,
                crons: appliedCrons,
                skills: allSkills,
                heartbeatSkills: Object.entries(compiled.skillTriggers)
                  .filter(([, t]) => t.type === 'heartbeat')
                  .map(([id]) => id),
                userSkills: Object.entries(compiled.skillTriggers)
                  .filter(([, t]) => t.type === 'user')
                  .map(([id]) => id),
              };
              state.dresses[dressId] = entry;
              await this.stateManager.save(state);
            },
          },
        ],
        { concurrent: false },
      );

      await tasks.run();

      const changeDesc = [
        scheduleChanges.length > 0 ? `${scheduleChanges.length} schedule(s)` : '',
        paramChanges.length > 0 ? `${paramChanges.length} param(s)` : '',
      ]
        .filter(Boolean)
        .join(', ');

      await this.gitManager.commit('refactor', dressId, `update ${changeDesc}`);

      await this.resetWaclawSessionTask();

      this.log(`\n${chalk.green('✓')} Updated ${chalk.bold(dressId)}: ${changeDesc}`);
    });
  }
}
