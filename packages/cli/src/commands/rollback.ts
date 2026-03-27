import { Args, Flags } from '@oclif/core';
import chalk from 'chalk';
import { confirm } from '@inquirer/prompts';
import { BaseCommand } from '../base.js';

export default class Rollback extends BaseCommand {
  static summary = 'Undo the last dress/undress operation';

  static description = `Rolls back the last clawset operation by reverting the git state.
Note: This only reverts the clawset state file. You may need to manually
verify that OpenClaw crons/config match the rolled-back state.
Run "clawset doctor" after rollback to verify.`;

  static examples = [
    '<%= config.bin %> rollback',
  ];

  static flags = {
    ...BaseCommand.baseFlags,
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip confirmation',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Rollback);
    await this.loadConfig();

    const lastCommit = await this.gitManager.lastCommit();
    if (!lastCommit) {
      this.error('No history to roll back.');
    }

    this.log(`\n${chalk.bold('Last operation:')}`);
    this.log(`  ${lastCommit.message}\n`);

    if (!flags.yes) {
      const proceed = await confirm({
        message: 'Roll back this operation?',
        default: false,
      });
      if (!proceed) {
        this.log('Aborted.');
        return;
      }
    }

    await this.stateManager.lock();
    try {
      // Get the parent commit
      const entries = await this.gitManager.log(2);
      if (entries.length < 2) {
        this.error('Cannot roll back — this is the initial commit.');
      }

      // The full hash isn't stored in our log helper, but we can use HEAD~1
      const { simpleGit: sg } = await import('simple-git');
      const git = sg(this.clawsetPaths.root);
      const parentHash = await git.revparse(['HEAD~1']);

      await git.reset(['--hard', parentHash]);

      this.log(`${chalk.green('✓')} Rolled back to previous state.`);
      this.log(chalk.yellow('\nImportant: OpenClaw config may be out of sync.'));
      this.log(`Run ${chalk.cyan('clawset doctor')} to verify.`);
      this.log(`Run ${chalk.cyan('clawset diff')} to see what clawset expects.\n`);
    } finally {
      await this.stateManager.unlock();
    }
  }
}
