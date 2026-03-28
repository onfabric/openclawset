import { confirm } from '@inquirer/prompts';
import { Flags } from '@oclif/core';
import chalk from 'chalk';
import { BaseCommand } from '#base.ts';

export default class Rollback extends BaseCommand {
  static override summary = 'Undo the last dress/undress operation';

  static override description = `Rolls back the last clawtique operation by reverting the git state.
Note: This only reverts the clawtique state file. You may need to manually
verify that OpenClaw crons/config match the rolled-back state.
Run "clawtique doctor" after rollback to verify.`;

  static override examples = ['<%= config.bin %> rollback'];

  static override flags = {
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
      const git = sg(this.clawtiquePaths.root);
      const parentHash = await git.revparse(['HEAD~1']);

      await git.reset(['--hard', parentHash]);

      this.log(`${chalk.green('✓')} Rolled back to previous state.`);
      this.log(chalk.yellow('\nImportant: OpenClaw config may be out of sync.'));
      this.log(`Run ${chalk.cyan('clawtique doctor')} to verify.`);
      this.log(`Run ${chalk.cyan('clawtique diff')} to see what clawtique expects.\n`);
    } finally {
      await this.stateManager.unlock();
    }
  }
}
