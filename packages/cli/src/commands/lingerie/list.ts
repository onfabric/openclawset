import { Flags } from '@oclif/core';
import chalk from 'chalk';
import { BaseCommand } from '../../base.js';

export default class LingerieList extends BaseCommand {
  static override summary = 'List active lingerie';

  static override examples = ['<%= config.bin %> lingerie list'];

  static override flags = {
    ...BaseCommand.baseFlags,
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(LingerieList);
    await this.loadConfig();

    const state = await this.stateManager.load();
    const entries = Object.entries(state.lingerie ?? {});

    if (flags.json) {
      this.log(JSON.stringify(state.lingerie ?? {}, null, 2));
      return;
    }

    if (entries.length === 0) {
      this.log('\nNo lingerie active.');
      this.log(`Run ${chalk.cyan('clawtique lingerie add <specifier>')} to get started.\n`);
      return;
    }

    this.log(`\n${chalk.bold('Active Lingerie')}\n`);

    for (const [id, entry] of entries) {
      this.log(
        `  ${chalk.cyan(id)} ${chalk.dim(`v${entry.version}`)} ${chalk.dim(`(${entry.package})`)}`,
      );

      if (entry.applied.plugins.length > 0) {
        this.log(`    plugins: ${entry.applied.plugins.join(', ')}`);
      }

      // Find which dresses depend on this lingerie
      const dependants: string[] = [];
      for (const [dressId, dressEntry] of Object.entries(state.dresses)) {
        if ((dressEntry.applied.lingerie ?? []).includes(id)) {
          dependants.push(dressId);
        }
      }
      if (dependants.length > 0) {
        this.log(`    used by: ${dependants.join(', ')}`);
      }

      this.log('');
    }

    this.log(chalk.dim(`  ${entries.length} lingerie active`));
    this.log('');
  }
}
