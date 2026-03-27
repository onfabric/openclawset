import { Args, Flags } from '@oclif/core';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { Listr } from 'listr2';
import { stripMarkers, type StateFile } from '@clawset/core';
import { BaseCommand } from '../base.js';

export default class Undress extends BaseCommand {
  static summary = 'Deactivate a dress and remove its config (data persists)';

  static examples = [
    '<%= config.bin %> undress fitness-coach',
    '<%= config.bin %> undress fitness-coach --dry-run',
  ];

  static args = {
    id: Args.string({
      description: 'Dress ID to remove',
      required: true,
    }),
  };

  static flags = {
    ...BaseCommand.baseFlags,
    'dry-run': Flags.boolean({
      description: 'Show what would change without applying',
      default: false,
    }),
    force: Flags.boolean({
      description: 'Skip dependency checks',
      default: false,
    }),
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip confirmation',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Undress);
    await this.loadConfig();

    const state = await this.stateManager.load();
    const entry = this.stateManager.getDressEntry(state, args.id);

    if (!entry) {
      this.error(`Dress "${args.id}" is not active.\nRun "clawset status" to see active dresses.`);
    }

    // Check for dependants
    const dependants = this.findDependants(state, args.id);
    if (dependants.length > 0 && !flags.force) {
      this.log(chalk.yellow(`\nWarning: The following dresses depend on "${args.id}":`));
      for (const dep of dependants) {
        this.log(`  - ${dep}`);
      }
      this.log('');
      this.error(`Undress dependants first, or use --force.`);
    }

    // Determine what needs to be removed vs retained
    const othersNeed = this.collectOthersNeeds(state, args.id);

    const cronsToRemove = entry.applied.crons;
    const pluginsToRemove = entry.applied.plugins.filter((p) => !othersNeed.plugins.has(p));
    const skillsToRemove = entry.applied.skills.filter((s) => !othersNeed.skills.has(s));
    const pluginsRetained = entry.applied.plugins.filter((p) => othersNeed.plugins.has(p));

    // Show what will happen
    this.log(chalk.bold(`\nUndressing "${args.id}":\n`));

    for (const c of cronsToRemove) {
      this.log(`  ${chalk.red('-')} cron: ${c}`);
    }
    for (const s of skillsToRemove) {
      this.log(`  ${chalk.red('-')} skill: ${s}`);
    }
    for (const p of pluginsToRemove) {
      this.log(`  ${chalk.red('-')} plugin: ${p}`);
    }
    for (const p of pluginsRetained) {
      this.log(`  ${chalk.dim('~')} plugin: ${p} ${chalk.dim('(retained — used by another dress)')}`);
    }
    if (entry.applied.memorySections.length > 0) {
      for (const s of entry.applied.memorySections) {
        this.log(`  ${chalk.dim('~')} memory section "${s}" ${chalk.dim('(content preserved, markers removed)')}`);
      }
    }
    for (const f of entry.applied.files) {
      this.log(`  ${chalk.red('-')} file: ${f}`);
    }
    this.log('');

    if (flags['dry-run']) {
      this.log(chalk.yellow('Dry run — no changes applied.'));
      return;
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

    if (!flags.yes) {
      const proceed = await confirm({ message: 'Proceed?', default: true });
      if (!proceed) {
        this.log('Aborted.');
        return;
      }
    }

    await this.stateManager.lock();
    const snapshot = await this.gitManager.snapshot();

    try {
      const tasks = new Listr([
        {
          title: 'Removing crons',
          skip: () => cronsToRemove.length === 0,
          task: async () => {
            for (const qualifiedId of cronsToRemove) {
              const cronId = qualifiedId.includes(':') ? qualifiedId.split(':')[1] : qualifiedId;
              const cronName = `[${args.id}] ${cronId}`;
              try {
                await this.openclawDriver.cronRemove(cronName);
              } catch {
                // Cron may have been manually removed
              }
            }
          },
        },
        {
          title: 'Stripping memory markers',
          skip: () => entry.applied.memorySections.length === 0,
          task: async () => {
            await this.stripMemoryMarkers(args.id);
          },
        },
        {
          title: 'Removing dress files',
          skip: () => entry.applied.files.length === 0,
          task: async () => {
            const { rm } = await import('node:fs/promises');
            for (const f of entry.applied.files) {
              if (existsSync(f)) {
                await rm(f, { recursive: true });
              }
            }
            // Clean up empty dress directory
            const dressDir = join(this.openclawPaths.dresses, args.id);
            if (existsSync(dressDir)) {
              try {
                const items = await readdir(dressDir);
                if (items.length === 0) await rm(dressDir, { recursive: true });
              } catch { /* ignore */ }
            }
          },
        },
        {
          title: 'Updating DRESSES.md',
          task: async () => {
            await this.rebuildDressesIndex(state, args.id);
          },
        },
        {
          title: 'Saving state',
          task: async () => {
            delete state.dresses[args.id];
            await this.stateManager.save(state);
          },
        },
      ], { concurrent: false });

      await tasks.run();

      const body = [
        cronsToRemove.length > 0 ? `removed crons: ${cronsToRemove.join(', ')}` : '',
        pluginsToRemove.length > 0 ? `removed plugins: ${pluginsToRemove.join(', ')}` : '',
        pluginsRetained.length > 0 ? `retained plugins: ${pluginsRetained.join(', ')}` : '',
        skillsToRemove.length > 0 ? `removed skills: ${skillsToRemove.join(', ')}` : '',
      ].filter(Boolean).join('\n');

      await this.gitManager.commit('revert', args.id, 'undress', body);

      this.log(`\n${chalk.green('✓')} Undressed "${args.id}". Data preserved.`);
    } catch (err) {
      if (snapshot) await this.gitManager.rollback(snapshot);
      throw err;
    } finally {
      await this.stateManager.unlock();
    }
  }

  private findDependants(state: StateFile, dressId: string): string[] {
    // For now, we don't store dependency info in state entries.
    // This would be enhanced when dress-to-dress dependencies are tracked.
    return [];
  }

  private collectOthersNeeds(
    state: StateFile,
    excludeId: string,
  ): { plugins: Set<string>; skills: Set<string> } {
    const plugins = new Set<string>();
    const skills = new Set<string>();
    for (const [id, entry] of Object.entries(state.dresses)) {
      if (id === excludeId) continue;
      for (const p of entry.applied.plugins) plugins.add(p);
      for (const s of entry.applied.skills) skills.add(s);
    }
    return { plugins, skills };
  }

  private async stripMemoryMarkers(dressId: string): Promise<void> {
    if (!existsSync(this.openclawPaths.memory)) return;
    const files = await readdir(this.openclawPaths.memory);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const filePath = join(this.openclawPaths.memory, file);
      const content = await readFile(filePath, 'utf-8');
      if (content.includes(`clawset:${dressId}`)) {
        const cleaned = stripMarkers(dressId, content);
        await writeFile(filePath, cleaned);
      }
    }
  }

  private async rebuildDressesIndex(state: StateFile, excludeId: string): Promise<void> {
    const lines = ['# Active Capabilities\n'];
    for (const [id, entry] of Object.entries(state.dresses)) {
      if (id === excludeId) continue;
      lines.push(`## ${id}`);
      lines.push(`Guide: ~/.openclaw/dresses/${id}/GUIDE.md\n`);
    }

    if (lines.length === 1) {
      lines.push('No dresses active.\n');
    }

    await writeFile(this.openclawPaths.dressesIndex, lines.join('\n'));
  }
}
