import { Flags } from '@oclif/core';
import chalk from 'chalk';
import { BaseCommand } from '../base.js';

export default class Status extends BaseCommand {
  static summary = 'Show active dresses and their components';

  static examples = ['<%= config.bin %> status'];

  static flags = {
    ...BaseCommand.baseFlags,
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Status);
    await this.loadConfig();

    const state = await this.stateManager.load();
    const entries = Object.entries(state.dresses);

    if (flags.json) {
      this.log(JSON.stringify(state, null, 2));
      return;
    }

    if (entries.length === 0) {
      this.log('\nNo dresses active.');
      this.log(`Run ${chalk.cyan('clawset dress <specifier>')} to get started.\n`);
      return;
    }

    this.log(`\n${chalk.bold('Active Dresses')}\n`);

    for (const [id, entry] of entries) {
      this.log(
        `  ${chalk.cyan(id)} ${chalk.dim(`v${entry.version}`)} ` +
        chalk.dim(`(${entry.package})`),
      );

      if (entry.applied.crons.length > 0) {
        this.log(`    crons: ${entry.applied.crons.map((c) => c.split(':').pop()).join(', ')}`);
      }
      if (entry.applied.skills.length > 0) {
        this.log(`    skills: ${entry.applied.skills.join(', ')}`);
      }
      if (entry.applied.plugins.length > 0) {
        this.log(`    plugins: ${entry.applied.plugins.join(', ')}`);
      }
      if (entry.applied.memorySections.length > 0) {
        this.log(`    memory: ${entry.applied.memorySections.join(', ')}`);
      }

      const paramEntries = Object.entries(entry.params);
      if (paramEntries.length > 0) {
        this.log(`    params:`);
        for (const [key, value] of paramEntries) {
          this.log(`      ${key}: ${chalk.yellow(JSON.stringify(value))}`);
        }
      }

      this.log('');
    }

    this.log(chalk.dim(`  ${entries.length} dress${entries.length === 1 ? '' : 'es'} active | serial: ${state.serial}`));
    this.log('');
  }
}
