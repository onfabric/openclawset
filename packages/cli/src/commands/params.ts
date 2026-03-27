import { Args, Flags } from '@oclif/core';
import chalk from 'chalk';
import { BaseCommand } from '../base.js';
import { installDress, resolveDress } from '../lib/installer.js';

export default class Params extends BaseCommand {
  static summary = 'View or update params for an active dress';

  static examples = [
    '<%= config.bin %> params fitness-coach',
    '<%= config.bin %> params fitness-coach --set workoutTime=18:00',
  ];

  static args = {
    id: Args.string({
      description: 'Dress ID',
      required: true,
    }),
  };

  static flags = {
    ...BaseCommand.baseFlags,
    set: Flags.string({
      description: 'Set a param (key=value)',
      multiple: true,
    }),
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Params);
    await this.loadConfig();

    const state = await this.stateManager.load();
    const entry = this.stateManager.getDressEntry(state, args.id);

    if (!entry) {
      this.error(`Dress "${args.id}" is not active.`);
    }

    // View mode
    if (!flags.set || flags.set.length === 0) {
      if (flags.json) {
        this.log(JSON.stringify(entry.params, null, 2));
        return;
      }

      const paramEntries = Object.entries(entry.params);
      if (paramEntries.length === 0) {
        this.log(`\nDress "${args.id}" has no params.\n`);
        return;
      }

      this.log(`\n${chalk.bold(args.id)} params:\n`);
      for (const [key, value] of paramEntries) {
        this.log(`  ${key}: ${chalk.yellow(JSON.stringify(value))}`);
      }
      this.log('');
      return;
    }

    // Update mode
    const updates: Record<string, unknown> = {};
    for (const s of flags.set) {
      const eqIdx = s.indexOf('=');
      if (eqIdx === -1) {
        this.error(`Invalid param format: "${s}". Use key=value.`);
      }
      const key = s.slice(0, eqIdx);
      const rawValue = s.slice(eqIdx + 1);
      try {
        updates[key] = JSON.parse(rawValue);
      } catch {
        // Check if it looks like a comma-separated list
        if (rawValue.includes(',')) {
          updates[key] = rawValue.split(',').map((s) => s.trim());
        } else {
          updates[key] = rawValue;
        }
      }
    }

    const newParams = { ...entry.params, ...updates };

    // Show diff
    this.log(chalk.bold('\nParam changes:\n'));
    for (const [key, newVal] of Object.entries(updates)) {
      const oldVal = entry.params[key];
      this.log(
        `  ${chalk.yellow('~')} ${key}: ${chalk.red(JSON.stringify(oldVal))} → ${chalk.green(JSON.stringify(newVal))}`,
      );
    }
    this.log('');

    // Re-resolve dress to get updated crons
    // For now, try to re-load the dress from the stored package
    let needsCronUpdate = false;
    try {
      const { dress } = await installDress(
        entry.package,
        this.clawsetPaths.dresses,
      );

      const oldResolved = resolveDress(dress, entry.params);
      const newResolved = resolveDress(dress, newParams);

      // Show cron changes
      for (let i = 0; i < newResolved.crons.length; i++) {
        const oldCron = oldResolved.crons[i];
        const newCron = newResolved.crons[i];
        if (oldCron && newCron && oldCron.schedule !== newCron.schedule) {
          this.log(
            `  ${chalk.yellow('~')} cron ${newCron.name}: ${chalk.red(oldCron.schedule)} → ${chalk.green(newCron.schedule)}`,
          );
          needsCronUpdate = true;
        }
      }
      if (needsCronUpdate) this.log('');
    } catch {
      this.warn('Could not re-resolve dress to preview cron changes.');
    }

    // Apply
    await this.stateManager.lock();
    try {
      entry.params = newParams;
      state.dresses[args.id] = entry;
      await this.stateManager.save(state);

      const changedKeys = Object.keys(updates).join(', ');
      await this.gitManager.commit(
        'refactor',
        args.id,
        `update params: ${changedKeys}`,
      );

      this.log(`${chalk.green('✓')} Params updated.`);
      if (needsCronUpdate) {
        this.log(chalk.yellow('  Note: cron schedules changed. Run `clawset undress && clawset dress` to apply.'));
      }
    } finally {
      await this.stateManager.unlock();
    }
  }
}
