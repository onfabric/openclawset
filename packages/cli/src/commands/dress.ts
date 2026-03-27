import { Args, Flags } from '@oclif/core';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import { spawn } from 'node:child_process';
import { input, number, confirm } from '@inquirer/prompts';
import { Listr } from 'listr2';
import {
  z,
  mergeDresses,
  diffState,
  generateDresscode,
  wrapSection,
  type ResolvedDress,
  type DressEntry,
  type StateFile,
  type ParamDef,
  type AppliedCron,
  type PluginDef,
} from '@clawset/core';
import { BaseCommand } from '../base.js';
import { installDress, resolveDress } from '../lib/installer.js';

export default class Dress extends BaseCommand {
  static summary = 'Install and activate a dress';

  static examples = [
    '<%= config.bin %> dress ./packages/dress-fitness-coach',
    '<%= config.bin %> dress @clawset/fitness-coach',
    '<%= config.bin %> dress ./my-dress --dry-run',
  ];

  static args = {
    specifier: Args.string({
      description: 'Dress package specifier (local path or package name)',
      required: true,
    }),
  };

  static flags = {
    ...BaseCommand.baseFlags,
    'dry-run': Flags.boolean({
      description: 'Show what would change without applying',
      default: false,
    }),
    'params-file': Flags.string({
      description: 'JSON file with param values',
    }),
    param: Flags.string({
      description: 'Set a param (key=value)',
      multiple: true,
    }),
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip confirmation prompts',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Dress);
    const config = await this.loadConfig();

    // Install the dress package
    this.log(`\nResolving ${chalk.cyan(args.specifier)}...`);
    const { dress, packageName } = await installDress(
      args.specifier,
      this.clawsetPaths.dresses,
    );

    const dressId = dress._input.id;
    const dressName = dress._input.name;
    const dressVersion = dress._input.version;

    this.log(`\n  ${chalk.bold(dressName)} ${chalk.dim(`v${dressVersion}`)}\n`);

    // Check if already dressed
    const state = await this.stateManager.load();
    if (this.stateManager.isDressed(state, dressId)) {
      this.error(`Already dressed in "${dressId}". Undress first: clawset undress ${dressId}`);
    }

    // Collect params
    const params = await this.collectParams(dress.paramDefs(), flags);

    // Resolve dress with params
    let resolved: ResolvedDress;
    try {
      resolved = resolveDress(dress, params);
    } catch (err) {
      this.error(`Invalid dress definition: ${err instanceof Error ? err.message : err}`);
    }

    // Check hard dependencies
    for (const [depId, depVersion] of Object.entries(resolved.requires.dresses)) {
      if (!this.stateManager.isDressed(state, depId)) {
        this.error(
          `Missing required dress: "${depId}" (${depVersion})\n` +
          `Install it first: clawset dress <${depId}-package>`,
        );
      }
    }

    // Check for soft dependencies
    for (const depId of Object.keys(resolved.requires.optionalDresses)) {
      if (!this.stateManager.isDressed(state, depId)) {
        this.warn(`Optional dress "${depId}" is not active — some features may be limited.`);
      }
    }

    // Merge all dresses including the new one
    const allDresses = new Map<string, ResolvedDress>();
    for (const [id, entry] of Object.entries(state.dresses)) {
      allDresses.set(id, this.reconstructResolved(id, entry));
    }
    allDresses.set(dressId, resolved);

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

    // Resolve bundled skill files (read content now for later copy)
    // The installer copies skill files to ~/.clawset/dresses/<id>/<skillName>.md
    const dressPackageDir = join(this.clawsetPaths.dresses, dressId);
    const bundledSkills = new Map<string, string>();
    for (const skillName of Object.keys(resolved.files.skills)) {
      const fullPath = join(dressPackageDir, `${skillName}.md`);
      if (existsSync(fullPath)) {
        bundledSkills.set(skillName, await readFile(fullPath, 'utf-8'));
      } else {
        this.error(`Bundled skill file not found: ${fullPath} (for skill "${skillName}")`);
      }
    }

    // Determine which skills are bundled vs need ClawHub install
    const clawHubSkills = resolved.requires.skills.filter((s) => !bundledSkills.has(s));

    // Check which plugins actually need installing (skip pre-existing ones)
    const pluginsToInstall: PluginDef[] = [];
    const pluginsPreExisting: PluginDef[] = [];
    for (const plugin of diff.pluginsToAdd) {
      if (await this.openclawDriver.pluginIsInstalled(plugin.id)) {
        pluginsPreExisting.push(plugin);
      } else {
        pluginsToInstall.push(plugin);
      }
    }

    // Show what will happen
    this.log(chalk.bold('Changes:'));
    for (const p of pluginsToInstall) {
      const setup = p.setupCommand ? 'requires setup' : '';
      this.log(`  ${chalk.green('+')} plugin: ${p.id} ${chalk.dim(`(${p.spec})`)}${setup ? ` ${chalk.dim(`[${setup}]`)}` : ''}`);
    }
    for (const p of pluginsPreExisting) {
      this.log(`  ${chalk.dim('~')} plugin: ${p.id} ${chalk.dim('(already installed — skipping)')}`);
    }
    if (diff.skillsToAdd.length > 0) {
      for (const s of diff.skillsToAdd) {
        const source = bundledSkills.has(s) ? 'bundled' : 'ClawHub';
        this.log(`  ${chalk.green('+')} skill: ${s} ${chalk.dim(`(${source})`)}`);
      }
    }
    if (diff.cronsToAdd.length > 0) {
      for (const c of diff.cronsToAdd) {
        this.log(`  ${chalk.green('+')} cron: ${c.name} ${chalk.dim(`(${c.schedule})`)} → skill: ${chalk.cyan(c.skill)}`);
      }
    }
    if (resolved.memory.dailySections.length > 0) {
      for (const s of resolved.memory.dailySections) {
        this.log(`  ${chalk.green('+')} memory section: ${s}`);
      }
    }
    if (resolved.heartbeat.length > 0) {
      this.log(`  ${chalk.green('+')} heartbeat: ${resolved.heartbeat.length} rule(s)`);
    }
    for (const wp of Object.keys(resolved.workspace)) {
      this.log(`  ${chalk.green('+')} workspace: ~/.openclaw/workspace/${wp}`);
    }
    this.log(`  ${chalk.green('+')} dresscode: ~/.openclaw/dresses/${dressId}/DRESSCODE.md`);
    this.log('');

    // Dry run exits here
    if (flags['dry-run']) {
      this.log(chalk.yellow('Dry run — no changes applied.'));
      return;
    }

    // Confirm
    if (!flags.yes) {
      const proceed = await confirm({ message: 'Apply changes?', default: true });
      if (!proceed) {
        this.log('Aborted.');
        return;
      }
    }

    // Verify openclaw is reachable before making any changes
    const health = await this.openclawDriver.health();
    if (!health.ok) {
      this.error(
        `OpenClaw is not reachable.\n\n` +
        `  ${health.message || 'Could not connect to openclaw CLI.'}\n\n` +
        `Make sure openclaw is installed and accessible, then try again.`,
      );
    }

    // Lock and apply
    await this.stateManager.lock();
    const snapshot = await this.gitManager.snapshot();

    try {
      const appliedCrons: AppliedCron[] = [];
      const appliedFiles: string[] = [];
      const installedSkills: string[] = [];
      const installedPlugins: string[] = [];

      // Phase 1: install plugins, run setup, restart gateway
      if (pluginsToInstall.length > 0) {
        const installTask = new Listr([{
          title: 'Installing plugins',
          task: async () => {
            for (const plugin of pluginsToInstall) {
              await this.openclawDriver.pluginInstall(plugin.spec);
              installedPlugins.push(plugin.id);
            }
          },
        }], { concurrent: false });
        await installTask.run();

        // Run interactive setup commands outside Listr so stdio works
        for (const plugin of pluginsToInstall) {
          if (!plugin.setupCommand) continue;
          this.log(`\n${chalk.bold(`Setting up ${plugin.id}...`)}`);
          if (plugin.setupNotes.length > 0) {
            this.log('');
            for (const note of plugin.setupNotes) {
              this.log(`  ${chalk.cyan('→')} ${note}`);
            }
          }
          this.log('');
          const [cmd, ...args] = plugin.setupCommand.split(' ');
          await new Promise<void>((resolve, reject) => {
            const child = spawn(cmd, args, { stdio: 'inherit' });
            child.on('close', (code: number) => {
              if (code === 0) resolve();
              else reject(new Error(`Plugin setup "${plugin.setupCommand}" exited with code ${code}`));
            });
            child.on('error', reject);
          });
        }

        // Restart gateway and wait for it to be healthy
        this.log('');
        const restartTask = new Listr([{
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
        }], { concurrent: false });
        await restartTask.run();
      }

      // Phase 2: skills, crons, config files
      const tasks = new Listr([
        {
          title: 'Installing skills',
          skip: () => resolved.requires.skills.length === 0,
          task: async () => {
            // Copy bundled skills
            for (const [skillName, content] of bundledSkills) {
              if (await this.openclawDriver.skillExists(skillName)) {
                this.warn(`Skill "${skillName}" already exists — skipping (won't overwrite)`);
              } else {
                await this.openclawDriver.skillCopyBundled(skillName, content);
                installedSkills.push(skillName);
              }
            }
            // Install ClawHub skills
            for (const slug of clawHubSkills) {
              if (await this.openclawDriver.skillExists(slug)) {
                this.warn(`Skill "${slug}" already exists — skipping (won't overwrite)`);
              } else {
                await this.openclawDriver.skillInstall(slug);
                installedSkills.push(slug);
              }
            }
          },
        },
        {
          title: 'Setting up workspace files',
          skip: () => Object.keys(resolved.workspace).length === 0,
          task: async () => {
            const workspaceDir = join(this.openclawPaths.root, 'workspace');
            for (const [filePath, initialContent] of Object.entries(resolved.workspace)) {
              const fullPath = join(workspaceDir, filePath);
              if (existsSync(fullPath)) continue; // don't overwrite existing files
              await mkdir(join(fullPath, '..'), { recursive: true });
              await writeFile(fullPath, initialContent);
            }
          },
        },
        {
          title: 'Adding crons',
          skip: () => diff.cronsToAdd.length === 0,
          task: async () => {
            for (const cron of diff.cronsToAdd) {
              await this.openclawDriver.cronAdd(cron);
              appliedCrons.push({
                qualifiedId: `${cron.dressId}:${cron.id}`,
                displayName: `[${cron.dressId}] ${cron.name}`,
                skill: cron.skill,
              });
            }
          },
        },
        {
          title: 'Writing DRESSCODE.md',
          task: async () => {
            const dressDir = join(this.openclawPaths.dresses, dressId);
            await mkdir(dressDir, { recursive: true });
            const dresscode = generateDresscode(resolved);
            const dresscodePath = join(dressDir, 'DRESSCODE.md');
            await writeFile(dresscodePath, dresscode);
            appliedFiles.push(dresscodePath);
          },
        },
        {
          title: 'Writing heartbeat rules',
          skip: () => resolved.heartbeat.length === 0,
          task: async () => {
            await this.appendHeartbeatRules(dressId, resolved.heartbeat);
          },
        },
        {
          title: 'Updating DRESSES.md',
          task: async () => {
            await this.updateDressesIndex(state, dressId, resolved);
          },
        },
        {
          title: 'Injecting DRESSES.md into AGENTS.md',
          skip: () => this.agentsHasClawsetHook(),
          task: async () => {
            await this.injectAgentsHook();
          },
        },
        {
          title: 'Saving state',
          task: async () => {
            const entry: DressEntry = {
              package: packageName,
              version: dressVersion,
              installedAt: new Date().toISOString(),
              params,
              applied: {
                crons: appliedCrons,
                skills: [...resolved.requires.skills],
                installedSkills,
                plugins: resolved.requires.plugins.map((p) => p.id),
                installedPlugins,
                memorySections: [...resolved.memory.dailySections],
                files: appliedFiles,
                heartbeatEntries: [...resolved.heartbeat],
                workspaceFiles: Object.keys(resolved.workspace),
              },
            };
            state.dresses[dressId] = entry;
            await this.stateManager.save(state);
          },
        },
      ], { concurrent: false, rendererOptions: { collapseSubtasks: false } });

      await tasks.run();

      // Git commit
      const paramSummary = Object.entries(params)
        .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
        .join('\n');
      const body = [
        resolved.requires.skills.length > 0 ? `skills: ${resolved.requires.skills.join(', ')}` : '',
        resolved.crons.length > 0 ? `crons: ${resolved.crons.map((c) => `${c.name} → ${c.skill}`).join(', ')}` : '',
        resolved.memory.dailySections.length > 0 ? `memory: ${resolved.memory.dailySections.join(', ')}` : '',
        paramSummary ? `\nparams:\n${paramSummary}` : '',
      ].filter(Boolean).join('\n');

      await this.gitManager.commit('feat', dressId, `dress v${dressVersion}`, body);

      this.log(`\n${chalk.green('✓')} Dressed in ${chalk.bold(dressName)}!`);
    } catch (err) {
      // Rollback on failure
      if (snapshot) {
        await this.gitManager.rollback(snapshot);
      }
      throw err;
    } finally {
      await this.stateManager.unlock();
    }
  }

  private async collectParams(
    paramDefs: Record<string, ParamDef>,
    flags: { 'params-file'?: string; param?: string[] },
  ): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = {};
    const entries = Object.entries(paramDefs);

    if (entries.length === 0) return params;

    // Load from file if provided
    if (flags['params-file']) {
      const raw = await readFile(flags['params-file'], 'utf-8');
      Object.assign(params, JSON.parse(raw));
    }

    // Apply --param flags
    for (const p of flags.param ?? []) {
      const eqIdx = p.indexOf('=');
      if (eqIdx === -1) continue;
      const key = p.slice(0, eqIdx);
      const value = p.slice(eqIdx + 1);
      try {
        params[key] = JSON.parse(value);
      } catch {
        params[key] = value;
      }
    }

    // Interactive prompt for missing params
    for (const [key, def] of entries) {
      if (params[key] !== undefined) continue;

      if (!process.stdout.isTTY) {
        params[key] = def.default;
        continue;
      }

      const schema = def.schema as z.ZodTypeAny;

      if (schema instanceof z.ZodArray) {
        const raw = await input({
          message: def.description,
          default: Array.isArray(def.default) ? (def.default as string[]).join(', ') : String(def.default),
        });
        params[key] = raw.split(',').map((s: string) => s.trim()).filter(Boolean);
      } else if (schema instanceof z.ZodNumber) {
        const val = await number({
          message: def.description,
          default: def.default as number,
        });
        params[key] = val;
      } else {
        const val = await input({
          message: def.description,
          default: String(def.default),
        });
        params[key] = val;
      }
    }

    // Validate all params against their schemas
    for (const [key, def] of entries) {
      const result = (def.schema as z.ZodTypeAny).safeParse(params[key]);
      if (!result.success) {
        this.error(`Invalid value for param "${key}": ${result.error.issues[0]?.message}`);
      }
      params[key] = result.data;
    }

    return params;
  }


  /**
   * Reconstruct a ResolvedDress from stored state for merge calculations.
   */
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
      },
      secrets: {},
      crons: entry.applied.crons.map((c) => {
        const cronId = c.qualifiedId.includes(':') ? c.qualifiedId.split(':')[1] : c.qualifiedId;
        return {
          id: cronId,
          name: c.displayName.replace(/^\[.*?\]\s*/, ''),
          schedule: '',
          skill: c.skill ?? '',
        };
      }),
      memory: {
        dailySections: entry.applied.memorySections,
        reads: [],
      },
      heartbeat: entry.applied.heartbeatEntries,
      files: { skills: {}, templates: [] },
      workspace: {},
    };
  }

  private async updateDressesIndex(
    state: StateFile,
    newDressId: string,
    newDress: ResolvedDress,
  ): Promise<void> {
    const lines = ['# Active Dresses\n'];
    lines.push('Read each DRESSCODE.md for details on skills, crons, and memory conventions.\n');

    // Existing dresses
    for (const [id] of Object.entries(state.dresses)) {
      lines.push(`## ${id}`);
      lines.push(`DRESSCODE: ~/.openclaw/dresses/${id}/DRESSCODE.md\n`);
    }

    // New dress
    lines.push(`## ${newDressId}`);
    lines.push(newDress.description || newDress.name);
    lines.push(`DRESSCODE: ~/.openclaw/dresses/${newDressId}/DRESSCODE.md\n`);

    await writeFile(this.openclawPaths.dressesIndex, lines.join('\n'));
  }

  private async appendHeartbeatRules(dressId: string, rules: string[]): Promise<void> {
    const heartbeatPath = this.openclawPaths.heartbeat;
    let content = '';
    if (existsSync(heartbeatPath)) {
      content = await readFile(heartbeatPath, 'utf-8');
    }

    // Don't duplicate if already present
    if (content.includes(`clawset:${dressId}:start`)) return;

    const rulesBlock = rules.map((r) => `- ${r}`).join('\n');
    const section = `\n## ${dressId}\n${rulesBlock}\n`;
    const wrapped = wrapSection(dressId, section);

    content = content.trimEnd() + '\n\n' + wrapped + '\n';
    await writeFile(heartbeatPath, content);
  }

  private agentsHasClawsetHook(): boolean {
    const agentsPath = join(this.openclawPaths.root, 'workspace', 'AGENTS.md');
    if (!existsSync(agentsPath)) return false;
    const content = readFileSync(agentsPath, 'utf-8');
    return content.includes('DRESSES.md');
  }

  private async injectAgentsHook(): Promise<void> {
    const agentsPath = join(this.openclawPaths.root, 'workspace', 'AGENTS.md');
    if (!existsSync(agentsPath)) return;

    let content = await readFile(agentsPath, 'utf-8');
    if (content.includes('DRESSES.md')) return;

    // Insert after the Session Startup numbered list
    const hook = '\n5. If `DRESSES.md` exists in the openclaw root, read it — it lists active dress configurations and where to find their DRESSCODEs.\n';

    // Try to insert after line 4 ("If in MAIN SESSION...")
    const mainSessionLine = '4. **If in MAIN SESSION**';
    const idx = content.indexOf(mainSessionLine);
    if (idx !== -1) {
      const lineEnd = content.indexOf('\n', idx);
      if (lineEnd !== -1) {
        content = content.slice(0, lineEnd + 1) + hook + content.slice(lineEnd + 1);
      }
    } else {
      // Fallback: append after "## Session Startup" section
      const sectionIdx = content.indexOf('## Session Startup');
      if (sectionIdx !== -1) {
        const nextSection = content.indexOf('\n## ', sectionIdx + 1);
        const insertAt = nextSection !== -1 ? nextSection : content.length;
        content = content.slice(0, insertAt) + hook + '\n' + content.slice(insertAt);
      }
    }

    await writeFile(agentsPath, content);
  }
}
