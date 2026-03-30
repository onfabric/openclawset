import { spawn } from 'node:child_process';
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
  diffState,
  generateDresscode,
  mergeDresses,
  type PluginDef,
  type ResolvedDress,
  type StateFile,
  wrapSection,
} from '#core/index.ts';
import {
  type CompiledDress,
  type CronScheduleChoice,
  compileDress,
  parseSkillMeta,
  type SkillMeta,
  validateDress,
} from '#lib/compile.ts';
import { createRegistryProvider, type RegistryProvider } from '#lib/registry.ts';

const ALL_DAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export default class DressAdd extends BaseCommand {
  static override summary = 'Install and activate a dress';

  static override examples = [
    '<%= config.bin %> dress add fitness-coach',
    '<%= config.bin %> dress add tech-bro-digest --dry-run',
  ];

  static override args = {
    id: Args.string({
      description: 'Dress ID from the registry',
      required: false,
    }),
  };

  static override flags = {
    ...BaseCommand.baseFlags,
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
    const { args, flags } = await this.parse(DressAdd);
    const config = await this.loadConfig();

    const registry = createRegistryProvider(process.cwd(), this.clawtiquePaths.cache);
    const state = await this.stateManager.load();

    // Pick a dress
    let dressId = args.id;
    if (!dressId) {
      const index = await registry.getIndex();
      const activeIds = new Set(Object.keys(state.dresses));
      const available = Object.entries(index.dresses).filter(([id]) => !activeIds.has(id));

      if (available.length === 0) {
        this.error('No available dresses. All dresses may already be active.');
      }

      dressId = await select({
        message: 'Choose a dress to wear',
        choices: available.map(([id, entry]) => ({
          name: `${entry.name} ${chalk.dim(`(${id})`)}`,
          value: id,
          description: entry.description,
        })),
      });
    }

    // Fetch dress definition + skills
    this.log(`\nResolving ${chalk.cyan(dressId)}...`);

    let dress: DressJson;
    try {
      dress = await registry.getDressJson(dressId);
    } catch {
      this.error(`Dress "${dressId}" not found in the registry.`);
    }

    this.log(`\n  ${chalk.bold(dress.name)} ${chalk.dim(`v${dress.version}`)}`);
    if (dress.description) {
      this.log(`  ${chalk.dim(dress.description)}`);
    }
    this.log('');

    // Check if already dressed
    if (this.stateManager.isDressed(state, dress.id)) {
      this.error(
        `Already dressed in "${dress.id}". Remove first: clawtique dress remove ${dress.id}`,
      );
    }

    // Fetch bundled skill contents
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

    // Validate dress definition
    const validation = validateDress(dress, skillContents);
    if (validation.errors.length > 0) {
      for (const err of validation.errors) {
        this.log(`  ${chalk.red('✗')} ${err}`);
      }
      this.error('Dress definition has errors.');
    }
    for (const warn of validation.warnings) {
      this.warn(warn);
    }

    // Build skill metadata map from frontmatter
    const skillMetaMap = new Map<string, SkillMeta>();
    for (const [skillId, skillDef] of Object.entries(dress.skills)) {
      if (skillDef.source === 'clawhub') continue;
      const content = skillContents.get(skillId);
      if (content) {
        const meta = parseSkillMeta(content);
        if (meta) skillMetaMap.set(skillId, meta);
      }
    }

    // Dress breakdown — group skills by trigger type
    const skillEntries = Object.entries(dress.skills);
    const cronSkills = skillEntries.filter(([, s]) => s.trigger.type === 'cron');
    const userSkills = skillEntries.filter(([, s]) => s.trigger.type === 'user');
    const heartbeatSkills = skillEntries.filter(([, s]) => s.trigger.type === 'heartbeat');

    if (cronSkills.length > 0) {
      this.log(chalk.bold('  Cron Skills:'));
      for (const [id, skillDef] of cronSkills) {
        const meta = skillMetaMap.get(id);
        const displayName = meta?.name ?? id;
        const cron = dress.crons.find(
          (c) => c.id === (skillDef.trigger as { cronId: string }).cronId,
        );
        const time = cron?.defaults.time ?? '—';
        const days = cron?.defaults.days ? cron.defaults.days.join(', ') : 'every day';
        this.log(`    ${chalk.cyan(displayName)} ${chalk.dim(`(${time}, ${days})`)}`);
      }
      this.log('');
    }

    if (userSkills.length > 0) {
      this.log(chalk.bold('  User Skills:'));
      for (const [id, skillDef] of userSkills) {
        const meta = skillMetaMap.get(id);
        const displayName = meta?.name ?? id;
        const desc = (skillDef.trigger as { description: string }).description;
        this.log(`    ${chalk.cyan(displayName)} — ${chalk.dim(desc)}`);
      }
      this.log('');
    }

    if (heartbeatSkills.length > 0) {
      this.log(chalk.bold('  Heartbeat Skills:'));
      for (const [id, skillDef] of heartbeatSkills) {
        const meta = skillMetaMap.get(id);
        const displayName = meta?.name ?? id;
        const desc = (skillDef.trigger as { description: string }).description;
        this.log(`    ${chalk.cyan(displayName)} — ${chalk.dim(desc)}`);
      }
      this.log('');
    }

    const extras: string[] = [];
    if (dress.memory.dailySections.length > 0) {
      extras.push(`Memory: ${dress.memory.dailySections.join(', ')}`);
    }
    if (dress.workspace.length > 0) {
      extras.push(`Workspace: ${dress.workspace.length} file(s)`);
    }
    if (dress.requires.plugins.length > 0) {
      extras.push(`Plugins: ${dress.requires.plugins.map((p) => p.id).join(', ')}`);
    }
    if (dress.requires.lingerie.length > 0) {
      extras.push(`Requires: ${dress.requires.lingerie.join(', ')}`);
    }
    if (extras.length > 0) {
      for (const extra of extras) {
        this.log(`  ${chalk.dim(extra)}`);
      }
      this.log('');
    }

    // -----------------------------------------------------------------------
    // Phase: Dependencies
    // -----------------------------------------------------------------------

    // Check lingerie
    for (const uwId of dress.requires.lingerie) {
      if (!state.lingerie?.[uwId]) {
        const install = await confirm({
          message: `Dress "${dress.name}" requires lingerie "${uwId}". Install it now?`,
          default: true,
        });
        if (!install) {
          this.log("  You wouldn't go out without lingerie, would you?");
          this.error(
            `Dress "${dress.name}" requires lingerie "${uwId}".\n` +
              `Install it separately with: clawtique lingerie add ${uwId}`,
          );
        }
        await this.installLingerie(registry, uwId, state);
      }
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

    // Check optional dress deps
    for (const depId of Object.keys(dress.requires.optionalDresses)) {
      if (!this.stateManager.isDressed(state, depId)) {
        this.warn(`Optional dress "${depId}" is not active — some features may be limited.`);
      }
    }

    // -----------------------------------------------------------------------
    // Phase: Prompts — collect schedule + skill params
    // -----------------------------------------------------------------------

    // Timezone (once, saved to config)
    let timezone = config.timezone ?? 'UTC';
    if (!config.timezone || config.timezone === 'UTC') {
      const tz = await input({
        message: 'Your timezone (IANA format)',
        default: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      });
      timezone = tz;
      // Save timezone to config for future dresses
      const configData = JSON.parse(await readFile(this.clawtiquePaths.config, 'utf-8'));
      configData.timezone = timezone;
      await writeFile(this.clawtiquePaths.config, `${JSON.stringify(configData, null, 2)}\n`);
    }

    // Cron schedules
    const cronSchedules: Record<string, CronScheduleChoice> = {};
    if (dress.crons.length > 0) {
      this.log(chalk.bold(`  Scheduling ${dress.crons.length} cron(s):\n`));
    }

    for (const cron of dress.crons) {
      const defaultTime = cron.defaults.time ?? '09:00';
      const defaultDays = cron.defaults.days ?? ALL_DAYS;

      // Find the skill bound to this cron via trigger
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

      // Channel — auto-select if only one lingerie, prompt if multiple
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

    // Skill params
    const skillParams: Record<string, Record<string, unknown>> = {};
    for (const [skillId, skillDef] of Object.entries(dress.skills)) {
      const paramEntries = Object.entries(skillDef.params);
      if (paramEntries.length === 0) continue;

      const meta = skillMetaMap.get(skillId);
      const trigger = skillDef.trigger;
      const relatedCron =
        trigger.type === 'cron' ? dress.crons.find((c) => c.id === trigger.cronId) : undefined;
      const cronInfo = relatedCron ? ` ${chalk.dim(`(used by: ${relatedCron.name})`)}` : '';
      this.log(`  ${chalk.bold(meta?.name ?? skillId)}${cronInfo}`);
      if (meta?.description) {
        this.log(`  ${chalk.dim(meta.description)}`);
      }
      this.log('');

      const values: Record<string, unknown> = {};

      for (const [paramName, paramDef] of paramEntries) {
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

      skillParams[skillId] = values;
      this.log('');
    }

    // -----------------------------------------------------------------------
    // Phase: Compile
    // -----------------------------------------------------------------------

    const compiled = compileDress({
      dress,
      skillContents,
      cronSchedules,
      skillParams,
      timezone,
    });

    // -----------------------------------------------------------------------
    // Phase: Merge + conflict check
    // -----------------------------------------------------------------------

    const allDresses = new Map<string, ResolvedDress>();
    for (const [id, entry] of Object.entries(state.dresses)) {
      allDresses.set(id, this.reconstructResolved(id, entry));
    }
    allDresses.set(dress.id, this.compiledToResolved(compiled));

    const { state: desired, conflicts } = mergeDresses(allDresses);

    if (conflicts.length > 0) {
      this.log(chalk.red('\nConflicts detected:\n'));
      for (const conflict of conflicts) {
        this.log(`  ${chalk.red('✗')} ${conflict.message}`);
      }
      this.log('');
      this.error('Cannot dress — resolve conflicts first.');
    }

    // Compute diff
    const current = this.stateManager.currentApplied(state);
    const diff = diffState(current, desired);

    // Check which plugins need installing
    const pluginsToInstall: PluginDef[] = [];
    const pluginsPreExisting: PluginDef[] = [];
    for (const plugin of diff.pluginsToAdd) {
      if (await this.openclawDriver.pluginIsInstalled(plugin.id)) {
        pluginsPreExisting.push(plugin);
      } else {
        pluginsToInstall.push(plugin);
      }
    }

    // -----------------------------------------------------------------------
    // Phase: Preview
    // -----------------------------------------------------------------------

    this.log(chalk.bold('Changes:'));
    for (const p of pluginsToInstall) {
      const setup = p.setupCommand ? 'requires setup' : '';
      this.log(
        `  ${chalk.green('+')} plugin: ${p.id} ${chalk.dim(`(${p.spec})`)}${setup ? ` ${chalk.dim(`[${setup}]`)}` : ''}`,
      );
    }
    for (const p of pluginsPreExisting) {
      this.log(`  ${chalk.dim('~')} plugin: ${p.id} ${chalk.dim('(already installed)')}`);
    }
    for (const s of diff.skillsToAdd) {
      const source = compiled.bundledSkills.has(s) ? 'bundled' : 'ClawHub';
      this.log(`  ${chalk.green('+')} skill: ${s} ${chalk.dim(`(${source})`)}`);
    }
    for (const c of compiled.crons) {
      this.log(
        `  ${chalk.green('+')} cron: ${c.name} ${chalk.dim(`(${c.schedule})`)} → skill: ${chalk.cyan(c.skill)}`,
      );
    }
    for (const s of compiled.memory.dailySections) {
      this.log(`  ${chalk.green('+')} memory section: ${s}`);
    }
    const hbSkills = Object.entries(compiled.skillTriggers).filter(
      ([, t]) => t.type === 'heartbeat',
    );
    const usrSkills = Object.entries(compiled.skillTriggers).filter(([, t]) => t.type === 'user');
    for (const [id, trigger] of hbSkills) {
      this.log(
        `  ${chalk.green('+')} heartbeat skill: ${id} — ${chalk.dim((trigger as { description: string }).description)}`,
      );
    }
    for (const [id, trigger] of usrSkills) {
      this.log(
        `  ${chalk.green('+')} user skill: ${id} — ${chalk.dim((trigger as { description: string }).description)}`,
      );
    }
    for (const wp of compiled.workspace) {
      this.log(`  ${chalk.green('+')} workspace: ~/.openclaw/workspace/${wp}`);
    }
    this.log(
      `  ${chalk.green('+')} dresscode: ~/.openclaw/workspace/dresses/${dress.id}/DRESSCODE.md`,
    );
    this.log('');

    if (flags['dry-run']) {
      this.log(chalk.yellow('Dry run — no changes applied.'));
      return;
    }

    if (!flags.yes) {
      const proceed = await confirm({ message: 'Apply changes?', default: true });
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
      const installedSkills: string[] = [];
      const installedPlugins: string[] = [];

      // Install plugins
      if (pluginsToInstall.length > 0) {
        const installTask = new Listr(
          [
            {
              title: 'Installing plugins',
              task: async () => {
                for (const plugin of pluginsToInstall) {
                  await this.openclawDriver.pluginInstall(plugin.spec);
                  installedPlugins.push(plugin.id);
                }
              },
            },
          ],
          { concurrent: false },
        );
        await installTask.run();

        // Run plugin setup
        for (const plugin of pluginsToInstall) {
          if (plugin.setupNotes.length > 0) {
            this.log('');
            for (const note of plugin.setupNotes) {
              this.log(`  ${chalk.cyan('→')} ${note}`);
            }
          }

          if (plugin.setupCommand) {
            this.log(`\n${chalk.bold(`Setting up ${plugin.id}...`)}`);
            this.log('');
            const [cmd, ...cmdArgs] = plugin.setupCommand.split(' ');
            const exitCode = await new Promise<number>((resolve, reject) => {
              const child = spawn(cmd!, cmdArgs, { stdio: 'inherit' });
              child.on('close', (code: number) => resolve(code));
              child.on('error', reject);
            });
            if (exitCode !== 0) {
              const cont = await confirm({
                message: `Setup exited with code ${exitCode}. Did it complete successfully?`,
                default: true,
              });
              if (!cont) {
                throw new Error(
                  `Plugin setup "${plugin.setupCommand}" failed (exit code ${exitCode})`,
                );
              }
            }
          } else {
            const schema = await this.openclawDriver.pluginConfigSchema(plugin.id);
            if (schema && Object.keys(schema.properties).length > 0) {
              this.log(`\n${chalk.bold(`Configuring ${plugin.id}...`)}\n`);
              for (const [key, prop] of Object.entries(schema.properties)) {
                const isRequired = schema.required.includes(key);
                const label = prop.description || key;
                const suffix = isRequired ? '' : ' (optional)';
                const value = await input({ message: `${label}${suffix}:` });
                if (value) {
                  await this.openclawDriver.configSet(`${schema.configPrefix}.${key}`, value);
                } else if (isRequired) {
                  this.error(`Required config "${key}" was not provided.`);
                }
              }
            }
          }
        }

        // Restart gateway
        this.log('');
        const restartTask = new Listr(
          [
            {
              title: 'Restarting gateway',
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
          ],
          { concurrent: false },
        );
        await restartTask.run();
      }

      // Skills, crons, config files
      const tasks = new Listr(
        [
          {
            title: 'Installing skills',
            skip: () => compiled.bundledSkills.size === 0 && compiled.clawHubSkills.length === 0,
            task: async () => {
              for (const [skillName, content] of compiled.bundledSkills) {
                if (await this.openclawDriver.skillExists(skillName)) {
                  this.warn(`Skill "${skillName}" already exists — skipping`);
                } else {
                  await this.openclawDriver.skillCopyBundled(skillName, content);
                  installedSkills.push(skillName);
                }
              }
              for (const slug of compiled.clawHubSkills) {
                if (await this.openclawDriver.skillExists(slug)) {
                  this.warn(`Skill "${slug}" already exists — skipping`);
                } else {
                  await this.openclawDriver.skillInstall(slug);
                  installedSkills.push(slug);
                }
              }
            },
          },
          {
            title: 'Setting up workspace files',
            skip: () => compiled.workspace.length === 0,
            task: async () => {
              const workspaceDir = join(this.openclawPaths.root, 'workspace');
              for (const filePath of compiled.workspace) {
                const fullPath = join(workspaceDir, filePath);
                if (existsSync(fullPath)) continue;
                const content = await registry.getWorkspaceFileContent(dress.id, filePath);
                await mkdir(join(fullPath, '..'), { recursive: true });
                await writeFile(fullPath, content);
              }
            },
          },
          {
            title: 'Adding crons',
            skip: () => compiled.crons.length === 0,
            task: async () => {
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
            title: 'Writing DRESSCODE.md',
            task: async () => {
              const dressDir = join(this.openclawPaths.dresses, dress.id);
              await mkdir(dressDir, { recursive: true });
              const resolved = this.compiledToResolved(compiled);
              const dresscode = generateDresscode(resolved, compiled.skillTriggers);
              const dresscodePath = join(dressDir, 'DRESSCODE.md');
              await writeFile(dresscodePath, dresscode);
              appliedFiles.push(dresscodePath);
            },
          },
          {
            title: 'Writing heartbeat rules',
            skip: () => Object.values(compiled.skillTriggers).every((t) => t.type !== 'heartbeat'),
            task: async () => {
              const hbEntries = Object.entries(compiled.skillTriggers)
                .filter(([, t]) => t.type === 'heartbeat')
                .map(
                  ([id, t]) =>
                    `**${id}** — ${(t as { description: string }).description}\n  → \`~/.openclaw/skills/${id}/SKILL.md\``,
                );
              await this.appendHeartbeatRules(dress.id, hbEntries);
            },
          },
          {
            title: 'Updating DRESSES.md',
            task: async () => {
              await this.updateDressesIndex(state, dress.id, compiled);
            },
          },
          {
            title: 'Saving state',
            task: async () => {
              const allSkills = [...compiled.bundledSkills.keys(), ...compiled.clawHubSkills];
              const entry: DressEntry = {
                package: dress.id,
                version: dress.version,
                installedAt: new Date().toISOString(),
                params: Object.fromEntries(
                  Object.entries(skillParams).filter(([, v]) => Object.keys(v).length > 0),
                ),
                applied: {
                  crons: appliedCrons,
                  skills: allSkills,
                  installedSkills,
                  plugins: compiled.plugins.map((p) => p.id),
                  installedPlugins,
                  memorySections: [...compiled.memory.dailySections],
                  files: appliedFiles,
                  heartbeatSkills: Object.entries(compiled.skillTriggers)
                    .filter(([, t]) => t.type === 'heartbeat')
                    .map(([id]) => id),
                  userSkills: Object.entries(compiled.skillTriggers)
                    .filter(([, t]) => t.type === 'user')
                    .map(([id]) => id),
                  workspaceFiles: [...compiled.workspace],
                  lingerie: [...compiled.lingerie],
                },
              };
              state.dresses[dress.id] = entry;
              await this.stateManager.save(state);
            },
          },
        ],
        { concurrent: false, rendererOptions: { collapseSubtasks: false } },
      );

      await tasks.run();

      // Git commit
      const body = [
        allSkills().length > 0 ? `skills: ${allSkills().join(', ')}` : '',
        compiled.crons.length > 0
          ? `crons: ${compiled.crons.map((c) => `${c.name} → ${c.skill}`).join(', ')}`
          : '',
        compiled.memory.dailySections.length > 0
          ? `memory: ${compiled.memory.dailySections.join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      await this.gitManager.commit('feat', dress.id, `dress v${dress.version}`, body);

      this.log(`\n${chalk.green('✓')} Dressed in ${chalk.bold(dress.name)}!`);

      function allSkills() {
        return [...compiled.bundledSkills.keys(), ...compiled.clawHubSkills];
      }
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

  private async installLingerie(
    registry: RegistryProvider,
    lingerieId: string,
    state: StateFile,
  ): Promise<void> {
    let uw: LingerieJson;
    try {
      uw = await registry.getLingerieJson(lingerieId);
    } catch {
      this.error(`Lingerie "${lingerieId}" not found in the registry.`);
    }

    this.log(`\n  Installing lingerie: ${chalk.bold(uw.name)}`);

    const installedPlugins: string[] = [];

    for (const plugin of uw.plugins) {
      if (await this.openclawDriver.pluginIsInstalled(plugin.id)) {
        this.log(`  ${chalk.dim('~')} plugin: ${plugin.id} (already installed)`);
        continue;
      }

      this.log(`  ${chalk.green('+')} plugin: ${plugin.id}`);
      await this.openclawDriver.pluginInstall(plugin.spec);
      installedPlugins.push(plugin.id);

      if (plugin.setupNotes.length > 0) {
        this.log('');
        for (const note of plugin.setupNotes) {
          this.log(`  ${chalk.cyan('→')} ${note}`);
        }
      }

      if (plugin.setupCommand) {
        this.log(`\n${chalk.bold(`Setting up ${plugin.id}...`)}\n`);
        const [cmd, ...cmdArgs] = plugin.setupCommand.split(' ');
        const exitCode = await new Promise<number>((resolve, reject) => {
          const child = spawn(cmd!, cmdArgs, { stdio: 'inherit' });
          child.on('close', (code: number) => resolve(code));
          child.on('error', reject);
        });
        if (exitCode !== 0) {
          this.error(`Lingerie plugin setup failed (exit code ${exitCode}).`);
        }
      } else {
        const schema = await this.openclawDriver.pluginConfigSchema(plugin.id);
        if (schema && Object.keys(schema.properties).length > 0) {
          this.log(`\n${chalk.bold(`Configuring ${plugin.id}...`)}\n`);
          for (const [key, prop] of Object.entries(schema.properties)) {
            const isRequired = schema.required.includes(key);
            const label = prop.description || key;
            const suffix = isRequired ? '' : ' (optional)';
            const value = await input({ message: `${label}${suffix}:` });
            if (value) {
              await this.openclawDriver.configSet(`${schema.configPrefix}.${key}`, value);
            } else if (isRequired) {
              this.error(`Required config "${key}" was not provided.`);
            }
          }
        }
      }
    }

    // Restart gateway if we installed plugins
    if (installedPlugins.length > 0) {
      const restartTask = new Listr(
        [
          {
            title: 'Restarting gateway',
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
        ],
        { concurrent: false },
      );
      await restartTask.run();
    }

    // Save lingerie to state
    state.lingerie[lingerieId] = {
      package: lingerieId,
      version: uw.version,
      installedAt: new Date().toISOString(),
      applied: {
        plugins: uw.plugins.map((p) => p.id),
        installedPlugins,
      },
    };
    await this.stateManager.save(state);
    this.log(`  ${chalk.green('✓')} Lingerie "${uw.name}" installed.\n`);
  }

  private compiledToResolved(compiled: CompiledDress): ResolvedDress {
    const allSkills = [...compiled.bundledSkills.keys(), ...compiled.clawHubSkills];
    return {
      id: compiled.id,
      name: compiled.name,
      version: compiled.version,
      description: compiled.description,
      requires: {
        plugins: compiled.plugins,
        skills: allSkills,
        dresses: {},
        optionalDresses: {},
        lingerie: compiled.lingerie,
      },
      secrets: compiled.secrets,
      crons: compiled.crons.map((c) => ({
        id: c.id,
        name: c.name,
        schedule: c.schedule,
        skill: c.skill,
        channel: c.channel === 'last' ? undefined : c.channel,
      })),
      memory: compiled.memory,
      files: { skills: {}, templates: [] },
      workspace: compiled.workspace,
    };
  }

  private reconstructResolved(id: string, entry: DressEntry): ResolvedDress {
    return {
      id,
      name: id,
      version: entry.version,
      description: '',
      requires: {
        plugins: entry.applied.plugins.map((p) => ({ id: p, spec: p, setupNotes: [] })),
        skills: entry.applied.skills,
        dresses: {},
        optionalDresses: {},
        lingerie: entry.applied.lingerie ?? [],
      },
      secrets: {},
      crons: entry.applied.crons.map((c) => {
        const cronId = c.qualifiedId.includes(':') ? c.qualifiedId.split(':')[1] : c.qualifiedId;
        return {
          id: cronId!,
          name: c.displayName.replace(/^\[.*?\]\s*/, ''),
          schedule: '',
          skill: c.skill ?? '',
        };
      }),
      memory: {
        dailySections: entry.applied.memorySections,
        reads: [],
      },
      files: { skills: {}, templates: [] },
      workspace: [],
    };
  }

  private async updateDressesIndex(
    state: StateFile,
    newDressId: string,
    compiled: CompiledDress,
  ): Promise<void> {
    // Collect all user skills for the routing table
    const allUserSkills: { skillId: string; dressId: string; description: string }[] = [];

    // From existing dresses — we only have skill IDs, read descriptions from DRESSCODE.md
    // For now, just list them; the DRESSCODE.md has the full details
    for (const [id, entry] of Object.entries(state.dresses)) {
      for (const skillId of entry.applied.userSkills ?? []) {
        allUserSkills.push({ skillId, dressId: id, description: '' });
      }
    }

    // From the newly compiled dress ��� we have full trigger info
    for (const [skillId, trigger] of Object.entries(compiled.skillTriggers)) {
      if (trigger.type === 'user') {
        allUserSkills.push({ skillId, dressId: newDressId, description: trigger.description });
      }
    }

    const lines = ['# Active Dresses\n'];
    lines.push('Read each DRESSCODE.md for details on skills, crons, and memory conventions.\n');

    // User skill routing table
    if (allUserSkills.length > 0) {
      lines.push('## User Skills');
      lines.push('');
      lines.push(
        "When the user's request matches one of these, you MUST read the linked skill file and follow its instructions before taking any action.",
      );
      lines.push('');
      for (const { skillId, dressId, description } of allUserSkills) {
        const desc = description ? ` — ${description}` : '';
        lines.push(`- **${skillId}** (${dressId})${desc}`);
        lines.push(`  → \`~/.openclaw/skills/${skillId}/SKILL.md\``);
      }
      lines.push('');
    }

    for (const [id] of Object.entries(state.dresses)) {
      lines.push(`## ${id}`);
      lines.push(`DRESSCODE: ~/.openclaw/workspace/dresses/${id}/DRESSCODE.md\n`);
    }

    lines.push(`## ${newDressId}`);
    lines.push(compiled.description || compiled.name);
    lines.push(`DRESSCODE: ~/.openclaw/workspace/dresses/${newDressId}/DRESSCODE.md\n`);

    await writeFile(this.openclawPaths.dressesIndex, lines.join('\n'));
  }

  private async appendHeartbeatRules(dressId: string, rules: string[]): Promise<void> {
    const heartbeatPath = this.openclawPaths.heartbeat;
    let content = '';
    if (existsSync(heartbeatPath)) {
      content = await readFile(heartbeatPath, 'utf-8');
    }

    if (content.includes(`clawtique:${dressId}:start`)) return;

    const rulesBlock = rules.map((r) => `- ${r}`).join('\n');
    const section = `\n## ${dressId}\n${rulesBlock}\n`;
    const wrapped = wrapSection(dressId, section);

    content = `${content.trimEnd()}\n\n${wrapped}\n`;
    await writeFile(heartbeatPath, content);
  }
}
