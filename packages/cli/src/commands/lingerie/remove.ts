import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Args, Flags } from '@oclif/core';
import chalk from 'chalk';
import { Listr } from 'listr2';
import { BaseCommand } from '#base.ts';
import type { StateFile } from '#core/index.ts';
import { removeToolsSection } from '#core/index.ts';
import { select } from '#lib/prompt.ts';

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
        this.error('No active lingerie to remove.\nRun "clawtique lingerie" to check.');
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
        `Lingerie "${lingerieId}" is not active.\nRun "clawtique lingerie" to see active lingerie.`,
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
    const skillsToRemove = entry.applied.installedSkills ?? [];
    const resourcesToRemove = entry.applied.installedResources ?? [];
    const hasToolsSection = entry.applied.toolsSectionInjected ?? false;

    // Derive top-level config roots from the stored keys (e.g. "browser.enabled" → "browser")
    // and delete those instead of individual leaf keys, so the entire config tree is wiped.
    const storedKeys = entry.applied.configKeys ?? [];
    const configKeys = [...new Set(storedKeys.map((k) => k.split('.')[0]))];

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
    for (const s of skillsToRemove) {
      this.log(`  ${chalk.red('-')} skill: ${s}`);
    }
    if (resourcesToRemove.length > 0) {
      this.log(`  ${chalk.red('-')} resources: ${resourcesToRemove.length} file(s)`);
    }
    for (const k of configKeys) {
      this.log(`  ${chalk.red('-')} config: ${k}`);
    }
    if (hasToolsSection) {
      this.log(`  ${chalk.red('-')} tools section`);
    }
    this.log('');

    if (this.isDryRun(flags)) return;
    await this.ensureHealthy();
    if (await this.confirmOrAbort(flags, 'Proceed?')) return;

    await this.withAtomicOp(async () => {
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
            title: 'Removing skills',
            skip: () => skillsToRemove.length === 0,
            task: async () => {
              for (const skill of skillsToRemove) {
                try {
                  await this.openclawDriver.skillRemove(skill);
                } catch {
                  // Skill may have been manually removed
                }
              }
            },
          },
          {
            title: 'Removing resources',
            skip: () => resourcesToRemove.length === 0,
            task: async () => {
              const resourceDir = join(this.openclawPaths.dresses, lingerieId);
              await rm(resourceDir, { recursive: true, force: true });
            },
          },
          {
            title: 'Removing config keys',
            skip: () => configKeys.length === 0,
            task: async () => {
              for (const key of configKeys) {
                try {
                  if (key) {
                    await this.openclawDriver.configDelete(key);
                  }
                } catch {
                  // Config key may have been manually removed
                }
              }
            },
          },
          {
            title: 'Removing tools section',
            skip: () => !hasToolsSection,
            task: async () => {
              await removeToolsSection(this.openclawPaths.workspace, lingerieId);
            },
          },
          {
            title: 'Restarting gateway',
            skip: () => pluginsToRemove.length === 0 && configKeys.length === 0,
            task: async () => this.restartGateway(),
          },
          {
            title: 'Resetting waclaw session',
            task: async () => this.resetWaclawSession(),
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
        configKeys.length > 0 ? `removed config keys: ${configKeys.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      await this.gitManager.commit('revert', lingerieId, 'lingerie remove', body);

      this.log(`\n${chalk.green('✓')} Removed lingerie "${lingerieId}".`);
    });
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
