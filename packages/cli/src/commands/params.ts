import { Args, Flags } from '@oclif/core';
import chalk from 'chalk';
import { BaseCommand } from '../base.js';

export default class Params extends BaseCommand {
  static override summary = 'View or update params for an active dress';

  static override examples = [
    '<%= config.bin %> params fitness-coach',
    '<%= config.bin %> params tech-bro-digest --set tech-bro-digest.sources="Hacker News, Reddit"',
  ];

  static override args = {
    id: Args.string({
      description: 'Dress ID',
      required: true,
    }),
  };

  static override flags = {
    ...BaseCommand.baseFlags,
    set: Flags.string({
      description: 'Set a param (skill.key=value)',
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
      for (const [skillId, skillParams] of paramEntries) {
        const paramValues = Object.entries(skillParams as Record<string, unknown>);
        if (paramValues.length === 0) continue;
        this.log(`  ${chalk.dim(skillId)}:`);
        for (const [key, value] of paramValues) {
          this.log(`    ${key}: ${chalk.yellow(JSON.stringify(value))}`);
        }
      }
      this.log('');
      return;
    }

    // Update mode — params are namespaced by skill: "skill.paramName=value"
    const updates: Record<string, Record<string, unknown>> = {};
    for (const s of flags.set) {
      const eqIdx = s.indexOf('=');
      if (eqIdx === -1) {
        this.error(`Invalid param format: "${s}". Use skill.key=value.`);
      }
      const fullKey = s.slice(0, eqIdx);
      const rawValue = s.slice(eqIdx + 1);
      const dotIdx = fullKey.indexOf('.');
      if (dotIdx === -1) {
        this.error(
          `Invalid param key: "${fullKey}". Use skill.key format (e.g. tech-bro-digest.sources).`,
        );
      }
      const skillId = fullKey.slice(0, dotIdx);
      const paramKey = fullKey.slice(dotIdx + 1);

      let value: unknown;
      try {
        value = JSON.parse(rawValue);
      } catch {
        if (rawValue.includes(',')) {
          value = rawValue.split(',').map((s) => s.trim());
        } else {
          value = rawValue;
        }
      }

      if (!updates[skillId]) updates[skillId] = {};
      updates[skillId][paramKey] = value;
    }

    // Show diff
    this.log(chalk.bold('\nParam changes:\n'));
    for (const [skillId, skillUpdates] of Object.entries(updates)) {
      for (const [key, newVal] of Object.entries(skillUpdates)) {
        const oldParams = (entry.params[skillId] ?? {}) as Record<string, unknown>;
        const oldVal = oldParams[key];
        this.log(
          `  ${chalk.yellow('~')} ${skillId}.${key}: ${chalk.red(JSON.stringify(oldVal))} → ${chalk.green(JSON.stringify(newVal))}`,
        );
      }
    }
    this.log('');

    this.warn(
      'Param changes are saved to state but skills are not re-compiled.\n' +
        '  To apply, run: clawtique undress ' +
        args.id +
        ' && clawtique dress ' +
        args.id,
    );

    // Apply
    await this.stateManager.lock();
    try {
      for (const [skillId, skillUpdates] of Object.entries(updates)) {
        const existing = (entry.params[skillId] ?? {}) as Record<string, unknown>;
        entry.params[skillId] = { ...existing, ...skillUpdates };
      }
      state.dresses[args.id] = entry;
      await this.stateManager.save(state);

      const changedKeys = Object.entries(updates)
        .flatMap(([s, p]) => Object.keys(p).map((k) => `${s}.${k}`))
        .join(', ');
      await this.gitManager.commit('refactor', args.id, `update params: ${changedKeys}`);

      this.log(`${chalk.green('✓')} Params updated.`);
    } finally {
      await this.stateManager.unlock();
    }
  }
}
