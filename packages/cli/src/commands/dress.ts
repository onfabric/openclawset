import { Args, Flags } from '@oclif/core';
import { existsSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import { input, number, confirm, checkbox } from '@inquirer/prompts';
import { Listr } from 'listr2';
import {
  z,
  mergeDresses,
  diffState,
  buildMemoryScaffold,
  type ResolvedDress,
  type DressEntry,
  type StateFile,
  type ParamDef,
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
      // Re-resolve existing dresses from their stored params
      // For now, store the resolved version in the applied state
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

    // Show what will happen
    this.log(chalk.bold('Changes:'));
    if (diff.pluginsToAdd.length > 0) {
      for (const p of diff.pluginsToAdd) this.log(`  ${chalk.green('+')} plugin: ${p}`);
    }
    if (diff.skillsToAdd.length > 0) {
      for (const s of diff.skillsToAdd) this.log(`  ${chalk.green('+')} skill: ${s}`);
    }
    if (diff.cronsToAdd.length > 0) {
      for (const c of diff.cronsToAdd) {
        this.log(`  ${chalk.green('+')} cron: ${c.name} ${chalk.dim(`(${c.schedule})`)}`);
      }
    }
    if (resolved.memory.dailySections.length > 0) {
      for (const s of resolved.memory.dailySections) {
        this.log(`  ${chalk.green('+')} memory section: ${s}`);
      }
    }
    if (resolved.files.guide) {
      this.log(`  ${chalk.green('+')} guide: ~/.openclaw/dresses/${dressId}/GUIDE.md`);
    }
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
      const appliedCrons: string[] = [];
      const appliedFiles: string[] = [];

      const tasks = new Listr([
        {
          title: 'Adding crons',
          skip: () => diff.cronsToAdd.length === 0,
          task: async () => {
            for (const cron of diff.cronsToAdd) {
              await this.openclawDriver.cronAdd(cron);
              appliedCrons.push(`${cron.dressId}:${cron.id}`);
            }
          },
        },
        {
          title: 'Copying guide file',
          skip: () => !resolved.files.guide,
          task: async () => {
            const guideDest = join(this.openclawPaths.dresses, dressId, 'GUIDE.md');
            const guideSrc = join(this.clawsetPaths.dresses, dressId, 'GUIDE.md');
            if (existsSync(guideSrc)) {
              await mkdir(join(this.openclawPaths.dresses, dressId), { recursive: true });
              const { readFile: rf, copyFile } = await import('node:fs/promises');
              const content = await rf(guideSrc, 'utf-8');
              await writeFile(guideDest, content);
              appliedFiles.push(guideDest);
            }
          },
        },
        {
          title: 'Updating DRESSES.md',
          task: async () => {
            await this.updateDressesIndex(state, dressId, resolved);
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
                plugins: [...resolved.requires.plugins],
                memorySections: [...resolved.memory.dailySections],
                files: appliedFiles,
                heartbeatEntries: [...resolved.heartbeat],
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
        resolved.crons.length > 0 ? `crons: ${resolved.crons.map((c) => c.name).join(', ')}` : '',
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
      const { readFile: rf } = await import('node:fs/promises');
      const raw = await rf(flags['params-file'], 'utf-8');
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
        // Array param — use text input with comma separation
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
        plugins: entry.applied.plugins,
        skills: entry.applied.skills,
        dresses: {},
        optionalDresses: {},
      },
      secrets: {},
      crons: entry.applied.crons.map((qualifiedId) => {
        const cronId = qualifiedId.includes(':') ? qualifiedId.split(':')[1] : qualifiedId;
        return {
          id: cronId,
          name: cronId,
          schedule: '',
          prompt: '',
        };
      }),
      memory: {
        dailySections: entry.applied.memorySections,
        reads: [],
      },
      heartbeat: entry.applied.heartbeatEntries,
      files: { templates: [] },
    };
  }

  private async updateDressesIndex(
    state: StateFile,
    newDressId: string,
    newDress: ResolvedDress,
  ): Promise<void> {
    const lines = ['# Active Capabilities\n'];

    // Existing dresses
    for (const [id, entry] of Object.entries(state.dresses)) {
      lines.push(`## ${id}`);
      lines.push(`Guide: ~/.openclaw/dresses/${id}/GUIDE.md\n`);
    }

    // New dress
    lines.push(`## ${newDressId}`);
    lines.push(newDress.description || newDress.name);
    lines.push(`Guide: ~/.openclaw/dresses/${newDressId}/GUIDE.md\n`);

    await writeFile(this.openclawPaths.dressesIndex, lines.join('\n'));
  }
}
