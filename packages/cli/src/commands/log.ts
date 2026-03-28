import { Flags } from '@oclif/core';
import chalk from 'chalk';
import { BaseCommand } from '../base.js';

export default class Log extends BaseCommand {
  static override summary = 'Show the history of dress/undress operations';

  static override examples = ['<%= config.bin %> log', '<%= config.bin %> log --count 50'];

  static override flags = {
    ...BaseCommand.baseFlags,
    count: Flags.integer({
      char: 'n',
      description: 'Number of entries to show',
      default: 20,
    }),
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Log);
    await this.loadConfig();

    const entries = await this.gitManager.log(flags.count);

    if (flags.json) {
      this.log(JSON.stringify(entries, null, 2));
      return;
    }

    if (entries.length === 0) {
      this.log('\nNo history yet.\n');
      return;
    }

    this.log(`\n${chalk.bold('Clawtique History')}\n`);

    for (const entry of entries) {
      const { hash, date, message } = entry;

      // Color-code by conventional commit type
      let icon: string;
      if (message.startsWith('feat(')) {
        icon = chalk.green('+');
      } else if (message.startsWith('revert(')) {
        icon = chalk.red('-');
      } else if (message.startsWith('refactor(')) {
        icon = chalk.yellow('~');
      } else if (message.startsWith('fix(')) {
        icon = chalk.blue('*');
      } else {
        icon = chalk.dim('·');
      }

      const dateStr = new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      this.log(`  ${icon} ${chalk.dim(hash)} ${message} ${chalk.dim(dateStr)}`);
    }

    this.log('');
  }
}
