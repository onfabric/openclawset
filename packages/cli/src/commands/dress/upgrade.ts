import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkbox, confirm, input, select } from '@inquirer/prompts';
import { Args, Flags } from '@oclif/core';
import chalk from 'chalk';
import { Listr } from 'listr2';
import { BaseCommand } from '#base.ts';
import type { DressJson, LingerieJson, Weekday } from '#core/index.ts';
import {
  type AppliedCron,
  type DressEntry,
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
  type SkillMeta,
  validateDress,
} from '#lib/compile.ts';
import { createRegistryProvider } from '#lib/registry.ts';

const ALL_DAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export default class DressUpgrade extends BaseCommand {
  static override summary = 'Upgrade a dress to the latest registry version';

  static override description =
    'Upgrades an active dress to the latest published version. Preserves existing ' +
    'schedules and params where possible, prompts for new params, and handles ' +
    'added/removed skills, plugins, and crons.';

  static override examples = [
    '<%= config.bin %> dress upgrade fitness-coach',
    '<%= config.bin %> dress upgrade --check',
    '<%= config.bin %> dress upgrade fitness-coach --dry-run',
  ];

  static override args = {
    id: Args.string({
      description: 'Dress ID to upgrade',
      required: false,
    }),
  };

  static override flags = {
    ...BaseCommand.baseFlags,
    check: Flags.boolean({
      description: 'Just check for available upgrades without applying',
      default: false,
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
    const { args, flags } = await this.parse(DressUpgrade);
    const config = await this.loadConfig();

    const registry = createRegistryProvider(process.cwd(), this.clawtiquePaths.cache);
    const state = await this.stateManager.load();

    // Pick dress
    let dressId = args.id;
    if (!dressId) {
      const activeIds = Object.keys(state.dresses);
      if (activeIds.length === 0) {
        this.error('No active dresses to upgrade.');
      }
      dressId = await select({
        message: 'Choose a dress to upgrade',
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

    // Fetch latest dress definition
    this.log(`\nResolving ${chalk.cyan(dressId)}...`);

    let dress: DressJson;
    try {
      dress = await registry.getDressJson(dressId);
    } catch {
      this.error(`Dress "${dressId}" not found in the registry.`);
    }

    // Compare versions
    if (entry.version === dress.version) {
      this.log(
        `\n${chalk.green('✓')} Dress "${dressId}" is already at the latest version (v${entry.version}).`,
      );
      return;
    }

    this.log(
      `\n  ${chalk.bold(dress.name)} ${chalk.dim(`v${entry.version}`)} → ${chalk.green(`v${dress.version}`)}`,
    );
    if (dress.description) {
      this.log(`  ${chalk.dim(dress.description)}`);
    }
    this.log('');

    // Fetch skill contents
    const skillContents = new Map<string, string>();
    for (const [skillId, skillDef] of Object.entries(dress.skills)) {
      if (skillDef.source === 'clawhub') continue;
      try {
        const content = await registry.getSkillContent(dress.id, skillId);
        skillContents.set(skillId, content);
      } catch {
        this.error(`Failed to fetch skill "${skillId}" for dress "${dress.id}".`);
      }
    }

    // Validate new dress definition
    const validation = validateDress(dress, skillContents);
    if (validation.errors.length > 0) {
      for (const err of validation.errors) {
        this.log(`  ${chalk.red('✗')} ${err}`);
      }
      this.error('New dress version has validation errors.');
    }
    for (const warn of validation.warnings) {
      this.warn(warn);
    }

    // Build skill metadata
    const skillMetaMap = new Map<string, SkillMeta>();
    for (const [skillId, skillDef] of Object.entries(dress.skills)) {
      if (skillDef.source === 'clawhub') continue;
      const content = skillContents.get(skillId);
      if (content) {
        const meta = parseSkillMeta(content);
        if (meta) skillMetaMap.set(skillId, meta);
      }
    }

    // -----------------------------------------------------------------------
    // Compute structural diff
    // -----------------------------------------------------------------------

    const oldSkillIds = new Set(entry.applied.skills);
    const newSkillIds = new Set([
      ...Object.entries(dress.skills)
        .filter(([, s]) => s.source === 'bundled')
        .map(([id]) => id),
      ...Object.entries(dress.skills)
        .filter(([, s]) => s.source === 'clawhub')
        .map(([id]) => id),
    ]);
    const skillsAdded = [...newSkillIds].filter((s) => !oldSkillIds.has(s));
    const skillsRemoved = [...entry.applied.installedSkills].filter((s) => !newSkillIds.has(s));
    const skillsKept = [...newSkillIds].filter((s) => oldSkillIds.has(s));

    const oldPluginIds = new Set(entry.applied.plugins);
    const newPluginIds = new Set(dress.requires.plugins.map((p) => p.id));
    const pluginsAdded = dress.requires.plugins.filter((p) => !oldPluginIds.has(p.id));
    const pluginsRemoved = (entry.applied.installedPlugins ?? []).filter(
      (p) => !newPluginIds.has(p),
    );

    const oldCronIds = new Set(entry.applied.crons.map((c) => c.qualifiedId.split(':')[1]!));
    const newCronIds = new Set(dress.crons.map((c) => c.id));
    const cronsAdded = dress.crons.filter((c) => !oldCronIds.has(c.id));
    const cronsRemoved = entry.applied.crons.filter(
      (c) => !newCronIds.has(c.qualifiedId.split(':')[1]!),
    );
    const cronsKept = dress.crons.filter((c) => oldCronIds.has(c.id));

    const oldLingerieIds = new Set(entry.applied.lingerie ?? []);
    const newLingerieIds = new Set(dress.requires.lingerie);
    const lingerieAdded = dress.requires.lingerie.filter((id) => !oldLingerieIds.has(id));
    const lingerieRemoved = [...oldLingerieIds].filter((id) => !newLingerieIds.has(id));

    const oldWorkspaceFiles = new Set(
      (entry.applied.workspaceFiles ?? []).map((w) => w.replace(`${dressId}/`, '')),
    );
    const _newWorkspaceFiles = new Set(dress.workspace);
    const workspaceAdded = dress.workspace.filter((w) => !oldWorkspaceFiles.has(w));

    // New params that need user input
    const newParamsNeeded: {
      skillId: string;
      paramName: string;
      paramDef: DressJson['skills'][string]['params'][string];
    }[] = [];
    const currentParams = (entry.params ?? {}) as Record<string, Record<string, unknown>>;
    for (const [skillId, skillDef] of Object.entries(dress.skills)) {
      for (const [paramName, paramDef] of Object.entries(skillDef.params)) {
        const existingValue = currentParams[skillId]?.[paramName];
        if (existingValue === undefined) {
          newParamsNeeded.push({ skillId, paramName, paramDef });
        }
      }
    }

    // -----------------------------------------------------------------------
    // Show diff
    // -----------------------------------------------------------------------

    this.log(chalk.bold('Changes:'));

    if (lingerieAdded.length > 0) {
      this.log(chalk.yellow('\n  Breaking: new lingerie required'));
      for (const id of lingerieAdded) {
        this.log(`  ${chalk.green('+')} lingerie: ${id}`);
      }
    }

    for (const p of pluginsAdded) {
      this.log(`  ${chalk.green('+')} plugin: ${p.id} ${chalk.dim(`(${p.spec})`)}`);
    }
    for (const p of pluginsRemoved) {
      this.log(`  ${chalk.red('-')} plugin: ${p}`);
    }
    for (const s of skillsAdded) {
      const meta = skillMetaMap.get(s);
      this.log(`  ${chalk.green('+')} skill: ${meta?.name ?? s}`);
    }
    for (const s of skillsRemoved) {
      this.log(`  ${chalk.red('-')} skill: ${s}`);
    }
    for (const s of skillsKept) {
      const meta = skillMetaMap.get(s);
      this.log(
        `  ${chalk.yellow('~')} skill: ${meta?.name ?? s} ${chalk.dim('(content updated)')}`,
      );
    }
    for (const c of cronsAdded) {
      this.log(`  ${chalk.green('+')} cron: ${c.name} ${chalk.dim('(schedule needed)')}`);
    }
    for (const c of cronsRemoved) {
      this.log(`  ${chalk.red('-')} cron: ${c.displayName}`);
    }
    for (const c of cronsKept) {
      this.log(`  ${chalk.dim('~')} cron: ${c.name} (schedule preserved)`);
    }
    if (newParamsNeeded.length > 0) {
      for (const { skillId, paramName } of newParamsNeeded) {
        this.log(
          `  ${chalk.green('+')} param: ${skillId}.${paramName} ${chalk.dim('(input needed)')}`,
        );
      }
    }
    if (lingerieRemoved.length > 0) {
      for (const id of lingerieRemoved) {
        this.log(
          `  ${chalk.dim('~')} lingerie dependency removed: ${id} ${chalk.dim('(lingerie kept)')}`,
        );
      }
    }
    for (const w of workspaceAdded) {
      this.log(`  ${chalk.green('+')} workspace: ~/.openclaw/workspace/dresses/${dress.id}/${w}`);
    }
    this.log('');

    if (flags.check) {
      return;
    }

    // -----------------------------------------------------------------------
    // Phase: Dependencies — install missing lingerie
    // -----------------------------------------------------------------------

    for (const uwId of lingerieAdded) {
      if (state.lingerie?.[uwId]) continue;

      const install = await confirm({
        message: `New version requires lingerie "${uwId}". Install it now?`,
        default: true,
      });
      if (!install) {
        this.error(
          `Dress upgrade requires lingerie "${uwId}".\n` +
            `Install it separately with: clawtique lingerie add ${uwId}`,
        );
      }

      let uw: LingerieJson;
      try {
        uw = await registry.getLingerieJson(uwId);
      } catch {
        this.error(`Lingerie "${uwId}" not found in the registry.`);
      }

      this.log(`\n  Installing lingerie: ${chalk.bold(uw.name)}`);
      await this.installLingerie(registry, uwId, uw, state);
      this.log(`  ${chalk.green('✓')} Lingerie "${uw.name}" installed.\n`);
    }

    // Check hard dress deps
    for (const [depId, depVersion] of Object.entries(dress.requires.dresses)) {
      if (!this.stateManager.isDressed(state, depId)) {
        this.error(
          `Missing required dress: "${depId}" (${depVersion})\n` +
            `Install it first: clawtique dress add ${depId}`,
        );
      }
    }

    // -----------------------------------------------------------------------
    // Phase: Collect schedules + params
    // -----------------------------------------------------------------------

    // Preserve existing schedules, prompt for new crons
    const cronSchedules: Record<string, CronScheduleChoice> = {};

    // Carry forward existing schedules for kept crons
    for (const cron of cronsKept) {
      const existing = entry.schedules?.[cron.id];
      if (existing) {
        cronSchedules[cron.id] = {
          time: existing.time,
          days: existing.days as Weekday[],
          channel: existing.channel,
        };
      } else {
        // Schedule not tracked — fall back to dress defaults
        const defaultTime = cron.defaults.time ?? '09:00';
        const defaultDays = cron.defaults.days ?? ALL_DAYS;
        let channel: string | undefined;
        if (cron.channel) channel = cron.channel;
        else if (dress.requires.lingerie.length === 1) channel = dress.requires.lingerie[0];
        cronSchedules[cron.id] = { time: defaultTime, days: defaultDays, channel };
      }
    }

    // Prompt for new crons
    if (cronsAdded.length > 0) {
      this.log(chalk.bold(`  Scheduling ${cronsAdded.length} new cron(s):\n`));

      for (const cron of cronsAdded) {
        const defaultTime = cron.defaults.time ?? '09:00';
        const defaultDays = cron.defaults.days ?? ALL_DAYS;

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

        let channel: string | undefined;
        if (cron.channel) {
          channel = cron.channel;
        } else if (dress.requires.lingerie.length === 1) {
          channel = dress.requires.lingerie[0];
        } else if (dress.requires.lingerie.length > 1) {
          channel = await select({
            message: `  Channel`,
            choices: dress.requires.lingerie.map((id) => ({ name: id, value: id })),
          });
        }

        cronSchedules[cron.id] = { time, days, channel };
        this.log('');
      }
    }

    // Build skill params: preserve existing, prompt for new
    const skillParams: Record<string, Record<string, unknown>> = {};

    for (const [skillId, skillDef] of Object.entries(dress.skills)) {
      const paramEntries = Object.entries(skillDef.params);
      if (paramEntries.length === 0) continue;

      const values: Record<string, unknown> = {};
      const existingSkillParams = currentParams[skillId] ?? {};
      let hasNewParam = false;

      for (const [paramName, _paramDef] of paramEntries) {
        const existingValue = existingSkillParams[paramName];
        if (existingValue !== undefined) {
          values[paramName] = existingValue;
        } else {
          hasNewParam = true;
        }
      }

      // Prompt only for new params
      if (hasNewParam) {
        const meta = skillMetaMap.get(skillId);
        this.log(`  ${chalk.bold(meta?.name ?? skillId)} — new params needed:`);

        for (const [paramName, paramDef] of paramEntries) {
          if (existingSkillParams[paramName] !== undefined) continue;

          this.log(
            `    ${chalk.cyan(paramName)} ${chalk.dim(`(${paramDef.type}, default: ${JSON.stringify(paramDef.default)})`)}`,
          );
          if (paramDef.type === 'number') {
            const raw = await input({
              message: `    ${paramDef.description}`,
              default: String(paramDef.default),
            });
            values[paramName] = Number(raw);
          } else if (paramDef.type === 'string[]') {
            const raw = await input({
              message: `    ${paramDef.description}`,
              default: (paramDef.default as string[]).join(', '),
            });
            values[paramName] = raw
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean);
          } else {
            const raw = await input({
              message: `    ${paramDef.description}`,
              default: String(paramDef.default),
            });
            values[paramName] = raw;
          }
        }
        this.log('');
      }

      skillParams[skillId] = values;
    }

    // -----------------------------------------------------------------------
    // Phase: Compile
    // -----------------------------------------------------------------------

    const compiled = compileDress({
      dress,
      skillContents,
      cronSchedules,
      skillParams,
      timezone: config.timezone,
    });

    if (flags['dry-run']) {
      this.log(chalk.yellow('Dry run — no changes applied.'));
      return;
    }

    if (!flags.yes) {
      const proceed = await confirm({ message: 'Apply upgrade?', default: true });
      if (!proceed) {
        this.log('Aborted.');
        return;
      }
    }

    // Verify openclaw health
    const health = await this.openclawDriver.health();
    if (!health.ok) {
      this.error(
        `OpenClaw is not reachable.\n\n` +
          `  ${health.message || 'Could not connect to openclaw CLI.'}\n\n` +
          `Make sure openclaw is installed and accessible, then try again.`,
      );
    }

    // -----------------------------------------------------------------------
    // Phase: Apply
    // -----------------------------------------------------------------------

    await this.stateManager.lock();
    const snapshot = await this.gitManager.snapshot();

    try {
      const appliedCrons: AppliedCron[] = [];
      const appliedFiles: string[] = [];
      const installedSkills: string[] = [...(entry.applied.installedSkills ?? [])];
      const installedPlugins: string[] = [...(entry.applied.installedPlugins ?? [])];
      let needsRestart = false;

      // Determine which plugins to install vs skip
      const pluginsToInstall: typeof pluginsAdded = [];
      for (const plugin of pluginsAdded) {
        if (await this.openclawDriver.pluginIsInstalled(plugin.id)) {
          // Already installed (e.g. by another dress/lingerie)
        } else {
          pluginsToInstall.push(plugin);
        }
      }

      // Collect shared needs from other dresses
      const othersNeed = this.collectOthersNeeds(state, dressId);

      const tasks = new Listr(
        [
          {
            title: 'Removing obsolete crons',
            skip: () => cronsRemoved.length === 0,
            task: async () => {
              for (const cron of cronsRemoved) {
                try {
                  await this.openclawDriver.cronRemove(cron);
                } catch {
                  /* may have been manually removed */
                }
              }
            },
          },
          {
            title: 'Removing obsolete plugins',
            skip: () => pluginsRemoved.length === 0,
            task: async () => {
              for (const pluginId of pluginsRemoved) {
                if (othersNeed.plugins.has(pluginId)) continue;
                try {
                  await this.openclawDriver.pluginUninstall(pluginId);
                } catch {
                  /* may have been manually removed */
                }
                const idx = installedPlugins.indexOf(pluginId);
                if (idx >= 0) installedPlugins.splice(idx, 1);
              }
              needsRestart = true;
            },
          },
          {
            title: 'Removing obsolete skills',
            skip: () => skillsRemoved.length === 0,
            task: async () => {
              for (const skill of skillsRemoved) {
                if (othersNeed.skills.has(skill)) continue;
                try {
                  await this.openclawDriver.skillRemove(skill);
                } catch {
                  /* may have been manually removed */
                }
                const idx = installedSkills.indexOf(skill);
                if (idx >= 0) installedSkills.splice(idx, 1);
              }
            },
          },
          {
            title: 'Installing new plugins',
            skip: () => pluginsToInstall.length === 0,
            task: async () => {
              for (const plugin of pluginsToInstall) {
                await this.openclawDriver.pluginInstall(plugin.spec);
                installedPlugins.push(plugin.id);
              }
            },
          },
          {
            title: 'Setting up new plugins',
            skip: () => pluginsToInstall.length === 0,
            task: async () => {
              for (const plugin of pluginsToInstall) {
                await this.setupPlugin(plugin);
              }
              needsRestart = true;
            },
          },
          {
            title: 'Restarting gateway',
            skip: () => !needsRestart,
            task: async () => {
              await this.openclawDriver.gatewayRestart();
              for (let i = 0; i < 10; i++) {
                await new Promise((r) => setTimeout(r, 2_000));
                const h = await this.openclawDriver.health();
                if (h.ok) return;
              }
              throw new Error('Gateway did not become healthy after restart');
            },
          },
          {
            title: 'Installing and updating skills',
            skip: () => compiled.bundledSkills.size === 0 && compiled.clawHubSkills.length === 0,
            task: async () => {
              // Overwrite all bundled skills with new compiled content
              for (const [skillName, content] of compiled.bundledSkills) {
                await this.openclawDriver.skillCopyBundled(skillName, content);
                if (!installedSkills.includes(skillName)) {
                  installedSkills.push(skillName);
                }
              }
              // Install new ClawHub skills
              for (const slug of compiled.clawHubSkills) {
                if (await this.openclawDriver.skillExists(slug)) {
                  // Already exists — skip (ClawHub skills are not recompiled)
                } else {
                  await this.openclawDriver.skillInstall(slug);
                  installedSkills.push(slug);
                }
              }
            },
          },
          {
            title: 'Setting up new workspace files',
            skip: () => workspaceAdded.length === 0,
            task: async () => {
              const workspaceDir = join(this.openclawPaths.dresses, dress.id);
              for (const filePath of workspaceAdded) {
                const fullPath = join(workspaceDir, filePath);
                if (existsSync(fullPath)) continue;
                const content = await registry.getWorkspaceFileContent(dress.id, filePath);
                await mkdir(join(fullPath, '..'), { recursive: true });
                await writeFile(fullPath, content);
              }
            },
          },
          {
            title: 'Updating crons',
            skip: () => compiled.crons.length === 0,
            task: async () => {
              // Remove all old crons that are being kept (they'll be re-added with same schedule)
              for (const cron of entry.applied.crons) {
                if (cronsRemoved.some((r) => r.qualifiedId === cron.qualifiedId)) continue;
                try {
                  await this.openclawDriver.cronRemove(cron);
                } catch {
                  /* may have been manually removed */
                }
              }
              // Add all crons from new version
              for (const cron of compiled.crons) {
                await this.openclawDriver.cronAdd(cron);
                appliedCrons.push({
                  qualifiedId: `${cron.dressId}:${cron.id}`,
                  displayName: `[${cron.dressId}] ${cron.name}`,
                  skill: cron.skill,
                  channel: cron.channel,
                });
              }
            },
          },
          {
            title: 'Regenerating DRESSCODE.md',
            task: async () => {
              const dressDir = join(this.openclawPaths.dresses, dress.id);
              await mkdir(dressDir, { recursive: true });
              const resolved = compiledToResolved(compiled);
              const dresscode = generateDresscode(resolved, compiled.skillTriggers);
              const dresscodePath = join(dressDir, 'DRESSCODE.md');
              await writeFile(dresscodePath, dresscode);
              appliedFiles.push(dresscodePath);
            },
          },
          {
            title: 'Updating heartbeat rules',
            skip: () => {
              const hbSkills = Object.entries(compiled.skillTriggers).filter(
                ([, t]) => t.type === 'heartbeat',
              );
              const oldHbSkills = entry.applied.heartbeatSkills ?? [];
              return hbSkills.length === 0 && oldHbSkills.length === 0;
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

              // Write new rules (if any)
              const hbEntries = Object.entries(compiled.skillTriggers)
                .filter(([, t]) => t.type === 'heartbeat')
                .map(
                  ([id, t]) =>
                    `**${id}** — ${(t as { description: string }).description}\n  → \`~/.openclaw/skills/${id}/SKILL.md\``,
                );

              if (hbEntries.length > 0) {
                let content = existsSync(heartbeatPath)
                  ? await readFile(heartbeatPath, 'utf-8')
                  : '';
                const rulesBlock = hbEntries.map((r) => `- ${r}`).join('\n');
                const section = `\n## ${dressId}\n${rulesBlock}\n`;
                const wrapped = wrapSection(dressId, section);
                content = `${content.trimEnd()}\n\n${wrapped}\n`;
                await writeFile(heartbeatPath, content);
              }
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

              const updatedEntry: DressEntry = {
                package: dress.id,
                version: dress.version,
                installedAt: new Date().toISOString(),
                params: Object.fromEntries(
                  Object.entries(skillParams).filter(([, v]) => Object.keys(v).length > 0),
                ),
                schedules: cronSchedules,
                applied: {
                  crons: appliedCrons,
                  skills: allSkills,
                  installedSkills,
                  plugins: compiled.plugins.map((p) => p.id),
                  installedPlugins,
                  memorySections: compiled.dailyMemorySection ? [compiled.dailyMemorySection] : [],
                  files: appliedFiles,
                  heartbeatSkills: Object.entries(compiled.skillTriggers)
                    .filter(([, t]) => t.type === 'heartbeat')
                    .map(([id]) => id),
                  userSkills: Object.entries(compiled.skillTriggers)
                    .filter(([, t]) => t.type === 'user')
                    .map(([id]) => id),
                  workspaceFiles: compiled.workspace.map((p) => `${dress.id}/${p}`),
                  lingerie: [...compiled.lingerie],
                  dependsOnDresses: Object.keys(dress.requires.dresses),
                },
              };
              state.dresses[dressId] = updatedEntry;
              await this.stateManager.save(state);
            },
          },
        ],
        { concurrent: false, rendererOptions: { collapseSubtasks: false } },
      );

      await tasks.run();

      // Git commit
      const allSkills = [...compiled.bundledSkills.keys(), ...compiled.clawHubSkills];
      const body = [
        `v${entry.version} → v${dress.version}`,
        skillsAdded.length > 0 ? `added skills: ${skillsAdded.join(', ')}` : '',
        skillsRemoved.length > 0 ? `removed skills: ${skillsRemoved.join(', ')}` : '',
        allSkills.length > 0 ? `skills: ${allSkills.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      await this.gitManager.commit('feat', dress.id, `dress upgrade v${dress.version}`, body);

      // Reset waclaw session
      const resetTask = new Listr(
        [
          {
            title: 'Resetting waclaw session',
            task: async () => {
              const sessions = await this.openclawDriver.sessionList();
              const waclawSession = sessions.find((s) => s.key.includes(':waclaw:'));
              if (!waclawSession) return;
              await this.openclawDriver.sessionReset(waclawSession.sessionId);
            },
          },
        ],
        { concurrent: false },
      );
      await resetTask.run();

      this.log(`\n${chalk.green('✓')} Upgraded ${chalk.bold(dress.name)} to v${dress.version}!`);
    } catch (err) {
      if (snapshot) {
        await this.gitManager.rollback(snapshot);
      }
      throw err;
    } finally {
      await this.stateManager.unlock();
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private collectOthersNeeds(
    state: {
      dresses: Record<string, DressEntry>;
      lingerie: Record<string, { applied: { plugins: string[] } }>;
    },
    excludeId: string,
  ): { plugins: Set<string>; skills: Set<string> } {
    const plugins = new Set<string>();
    const skills = new Set<string>();
    for (const [id, e] of Object.entries(state.dresses)) {
      if (id === excludeId) continue;
      for (const p of e.applied.plugins) plugins.add(p);
      for (const s of e.applied.skills) skills.add(s);
    }
    for (const e of Object.values(state.lingerie ?? {})) {
      for (const p of e.applied.plugins) plugins.add(p);
    }
    return { plugins, skills };
  }
}
