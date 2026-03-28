import { Flags } from '@oclif/core';
import chalk from 'chalk';
import { BaseCommand } from '../base.js';

export default class Diff extends BaseCommand {
  static override summary = 'Show what clawtique has applied vs the current OpenClaw state';

  static override examples = ['<%= config.bin %> diff'];

  static override flags = {
    ...BaseCommand.baseFlags,
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Diff);
    await this.loadConfig();

    const state = await this.stateManager.load();
    const applied = this.stateManager.currentApplied(state);

    if (flags.json) {
      this.log(
        JSON.stringify(
          {
            crons: [...applied.crons],
            plugins: [...applied.plugins],
            skills: [...applied.skills],
          },
          null,
          2,
        ),
      );
      return;
    }

    this.log(`\n${chalk.bold('Applied by Clawtique')}\n`);

    if (applied.crons.size > 0) {
      this.log(chalk.bold('  Crons:'));
      for (const c of applied.crons) {
        const [dressId, cronId] = c.includes(':') ? c.split(':') : ['?', c];
        this.log(`    ${chalk.cyan(dressId)} → ${cronId}`);
      }
    }

    if (applied.plugins.size > 0) {
      this.log(chalk.bold('  Plugins:'));
      for (const p of applied.plugins) {
        this.log(`    ${p}`);
      }
    }

    if (applied.skills.size > 0) {
      this.log(chalk.bold('  Skills:'));
      for (const s of applied.skills) {
        this.log(`    ${s}`);
      }
    }

    if (applied.crons.size === 0 && applied.plugins.size === 0 && applied.skills.size === 0) {
      this.log('  Nothing applied yet.');
    }

    // Memory sections
    const allSections: Array<{ dress: string; section: string }> = [];
    for (const [id, entry] of Object.entries(state.dresses)) {
      for (const s of entry.applied.memorySections) {
        allSections.push({ dress: id, section: s });
      }
    }

    if (allSections.length > 0) {
      this.log(chalk.bold('  Memory Sections:'));
      for (const { dress, section } of allSections) {
        this.log(`    ${chalk.cyan(dress)} → ## ${section}`);
      }
    }

    this.log('');
  }
}
