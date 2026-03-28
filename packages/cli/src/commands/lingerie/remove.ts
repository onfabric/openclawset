import { confirm, select } from '@inquirer/prompts';
import { Args, Flags } from '@oclif/core';
import chalk from 'chalk';
import { Listr } from 'listr2';
import { BaseCommand } from '#base.ts';
import type { StateFile } from '#core/index.ts';

export default class LingerieRemove extends BaseCommand {
  static override summary = 'Remove shared lingerie (uninstalls plugins if no dress depends on it)';

  static override examples = [
    '<%= config.bin %> lingerie remove waclaw',
    '<%= config.bin %> lingerie remove waclaw --dry-run',
  ];

  static override args = {
    id: Args.string({
      description: 'Lingerie ID to remove',
      required: false,
    }),
  };

  static override flags = {
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
    const { args, flags } = await this.parse(LingerieRemove);
    await this.loadConfig();

    const state = await this.stateManager.load();
    const lingerieEntries = Object.entries(state.lingerie ?? {});

    let lingerieId = args.id;

    // Interactive picker if no ID given
    if (!lingerieId) {
      if (lingerieEntries.length === 0) {
        this.error('No active lingerie to remove.\nRun "clawtique lingerie list" to check.');
      }
      lingerieId = await select({
        message: 'Choose lingerie to remove',
        choices: lingerieEntries.map(([id, entry]) => ({
          name: `${id} ${chalk.dim(`v${entry.version}`)}`,
          value: id,
        })),
      });
    }

    const entry = state.lingerie?.[lingerieId];
    if (!entry) {
      this.error(
        `Lingerie "${lingerieId}" is not active.\nRun "clawtique lingerie list" to see active lingerie.`,
      );
    }

    // Check for dependant dresses
    const dependants = this.findDependantDresses(state, lingerieId);
    if (dependants.length > 0 && !flags.force) {
      this.log(
        chalk.yellow(`\nWarning: The following dresses depend on lingerie "${lingerieId}":`),
      );
      for (const dep of dependants) {
        this.log(`  - ${dep}`);
      }
      this.log('');
      this.error(`Undress dependants first, or use --force.`);
    }

    // Determine what to remove
    const installedPluginSet = new Set(entry.applied.installedPlugins ?? []);
    const pluginsToRemove = entry.applied.plugins.filter((p) => installedPluginSet.has(p));
    const pluginsRetained = entry.applied.plugins.filter((p) => !installedPluginSet.has(p));

    // Show what will happen
    this.log(chalk.bold(`\nRemoving lingerie "${lingerieId}":\n`));

    for (const p of pluginsToRemove) {
      this.log(`  ${chalk.red('-')} plugin: ${p}`);
    }
    for (const p of pluginsRetained) {
      this.log(
        `  ${chalk.dim('~')} plugin: ${p} ${chalk.dim('(not installed by clawtique — retained)')}`,
      );
    }
    this.log('');

    if (flags['dry-run']) {
      this.log(chalk.yellow('Dry run — no changes applied.'));
      return;
    }

    // Verify openclaw is reachable
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
      const tasks = new Listr(
        [
          {
            title: 'Removing plugins',
            skip: () => pluginsToRemove.length === 0,
            task: async () => {
              for (const plugin of pluginsToRemove) {
                try {
                  await this.openclawDriver.pluginUninstall(plugin);
                } catch {
                  // Plugin may have been manually removed
                }
              }
            },
          },
          {
            title: 'Restarting gateway',
            skip: () => pluginsToRemove.length === 0,
            task: async () => {
              await this.openclawDriver.gatewayRestart();
            },
          },
          {
            title: 'Saving state',
            task: async () => {
              delete state.lingerie[lingerieId];
              await this.stateManager.save(state);
            },
          },
        ],
        { concurrent: false },
      );

      await tasks.run();

      const body = [
        pluginsToRemove.length > 0 ? `removed plugins: ${pluginsToRemove.join(', ')}` : '',
        pluginsRetained.length > 0 ? `retained plugins: ${pluginsRetained.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      await this.gitManager.commit('revert', lingerieId, 'lingerie remove', body);

      this.log(`\n${chalk.green('✓')} Removed lingerie "${lingerieId}".`);
    } catch (err) {
      if (snapshot) await this.gitManager.rollback(snapshot);
      throw err;
    } finally {
      await this.stateManager.unlock();
    }
  }

  private findDependantDresses(state: StateFile, lingerieId: string): string[] {
    const dependants: string[] = [];
    for (const [dressId, entry] of Object.entries(state.dresses)) {
      if ((entry.applied.lingerie ?? []).includes(lingerieId)) {
        dependants.push(dressId);
      }
    }
    return dependants;
  }
}
