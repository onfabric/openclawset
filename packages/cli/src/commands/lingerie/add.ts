import { Args, Flags } from '@oclif/core';
import chalk from 'chalk';
import { BaseCommand } from '#base.ts';
import type { LingerieJson } from '#core/index.ts';
import { select } from '#lib/prompt.ts';
import { createRegistryProvider } from '#lib/registry.ts';

export default class LingerieAdd extends BaseCommand {
  static override summary = 'Install lingerie independently of a dress';

  static override examples = [
    '<%= config.bin %> lingerie add waclaw',
    '<%= config.bin %> lingerie add',
    '<%= config.bin %> lingerie add waclaw --dry-run',
  ];

  static override args = {
    id: Args.string({
      description: 'Lingerie ID to install',
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
    config: Flags.string({
      description: 'Config values as JSON: {"paramOrPropertyId": "value"}',
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(LingerieAdd);
    await this.loadConfig();

    const registry = createRegistryProvider(process.cwd(), this.clawtiquePaths.cache);
    const state = await this.stateManager.load();

    let lingerieId = args.id;

    // Interactive picker if no ID given
    if (!lingerieId) {
      const index = await registry.getIndex();
      const activeIds = new Set(Object.keys(state.lingerie ?? {}));
      const available = Object.entries(index.lingerie).filter(([id]) => !activeIds.has(id));

      if (available.length === 0) {
        this.error('No available lingerie. All lingerie may already be installed.');
      }

      lingerieId = await select({
        message: 'Choose lingerie to install',
        choices: available.map(([id, entry]) => ({
          name: `${entry.name} ${chalk.dim(`(${id})`)}`,
          value: id,
          description: entry.description || undefined,
        })),
      });
    }

    // Check if already installed
    if (state.lingerie?.[lingerieId]) {
      this.error(
        `Lingerie "${lingerieId}" is already installed.\nRun "clawtique lingerie" to see all lingerie.`,
      );
    }

    // Fetch definition
    let uw: LingerieJson;
    try {
      uw = await registry.getLingerieJson(lingerieId);
    } catch {
      this.error(`Lingerie "${lingerieId}" not found in the registry.`);
    }

    // Preview
    this.log(chalk.bold(`\nInstalling lingerie "${uw.name}":\n`));
    if (uw.description) {
      this.log(`  ${uw.description}\n`);
    }
    for (const plugin of uw.plugins) {
      const installed = await this.openclawDriver.pluginIsInstalled(plugin.id);
      if (installed) {
        this.log(`  ${chalk.dim('~')} plugin: ${plugin.id} (already installed)`);
      } else {
        this.log(`  ${chalk.green('+')} plugin: ${plugin.id}`);
      }
    }
    for (const skill of uw.skills) {
      this.log(`  ${chalk.green('+')} skill: ${skill}`);
    }
    if (uw.configSetup) {
      for (const cfg of uw.configSetup.configs) {
        this.log(`  ${chalk.green('+')} config: ${cfg.key}`);
      }
      if (uw.configSetup.configPrefix) {
        this.log(`  ${chalk.green('+')} config: ${uw.configSetup.configPrefix}`);
      }
    }
    if (uw.toolsSection) {
      this.log(`  ${chalk.green('+')} tools section`);
    }
    this.log('');

    if (this.isDryRun(flags)) return;
    await this.ensureHealthy();
    if (await this.confirmOrAbort(flags, 'Proceed?')) return;

    await this.withAtomicOp(async () => {
      const presetConfig = flags.config
        ? (JSON.parse(flags.config) as Record<string, string>)
        : undefined;
      await this.installLingerie(registry, lingerieId!, uw, state, presetConfig);

      const commitParts: string[] = [];
      if (uw.plugins.length > 0) {
        commitParts.push(`plugins: ${uw.plugins.map((p) => p.id).join(', ')}`);
      }
      if (uw.configSetup?.configs.length) {
        commitParts.push(`config keys: ${uw.configSetup.configs.map((c) => c.key).join(', ')}`);
      }
      await this.gitManager.commit(
        'feat',
        lingerieId,
        'lingerie add',
        commitParts.join('\n') || lingerieId,
      );

      this.log(`\n${chalk.green('✓')} Lingerie "${uw.name}" installed.`);
      this.log(`  Run ${chalk.cyan('clawtique lingerie')} to see all lingerie.\n`);
    });
  }
}
