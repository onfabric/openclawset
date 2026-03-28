import { Flags } from '@oclif/core';
import chalk from 'chalk';
import { BaseCommand } from '../base.js';

export default class Status extends BaseCommand {
  static override summary = 'Show active dresses and their components';

  static override examples = ['<%= config.bin %> status'];

  static override flags = {
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

    // Show lingerie first
    const uwEntries = Object.entries(state.lingerie ?? {});
    if (uwEntries.length > 0) {
      this.log(`\n${chalk.bold('Lingerie')}\n`);
      for (const [id, uwEntry] of uwEntries) {
        this.log(
          `  ${chalk.magenta(id)} ${chalk.dim(`v${uwEntry.version}`)} ` +
            chalk.dim(`(${uwEntry.package})`),
        );
        if (uwEntry.applied.plugins.length > 0) {
          this.log(`    plugins: ${uwEntry.applied.plugins.join(', ')}`);
        }
        this.log('');
      }
    }

    if (entries.length === 0 && uwEntries.length === 0) {
      this.log('\nNo dresses or lingerie active.');
      this.log(`Run ${chalk.cyan('clawtique dress <specifier>')} to get started.\n`);
      return;
    }

    if (entries.length === 0) {
      this.log('\nNo dresses active.');
      this.log(`Run ${chalk.cyan('clawtique dress <specifier>')} to get started.\n`);
      return;
    }

    this.log(`\n${chalk.bold('Active Dresses')}\n`);

    for (const [id, entry] of entries) {
      this.log(
        `  ${chalk.cyan(id)} ${chalk.dim(`v${entry.version}`)} ${chalk.dim(`(${entry.package})`)}`,
      );

      if (entry.applied.crons.length > 0) {
        this.log(
          `    crons: ${entry.applied.crons
            .map((c) => {
              const ch = c.channel ? ` ${chalk.dim(`→ ${c.channel}`)}` : '';
              return c.displayName + ch;
            })
            .join(', ')}`,
        );
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

    const uwCount = uwEntries.length > 0 ? ` | ${uwEntries.length} lingerie` : '';
    this.log(
      chalk.dim(
        `  ${entries.length} dress${entries.length === 1 ? '' : 'es'} active${uwCount} | serial: ${state.serial}`,
      ),
    );
    this.log('');
  }
}
