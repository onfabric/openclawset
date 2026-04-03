import { confirm, input, select } from '@inquirer/prompts';
import { Args, Flags } from '@oclif/core';
import chalk from 'chalk';
import { Listr } from 'listr2';
import { BaseCommand } from '#base.ts';
import type { LingerieJson } from '#core/index.ts';
import { createRegistryProvider } from '#lib/registry.ts';

export default class LingerieUpdate extends BaseCommand {
  static override summary = 'Update config for installed lingerie';

  static override description =
    'Re-configure an installed lingerie without removing it. ' +
    'Prompts for new values for each config property, showing current values as defaults. ' +
    'Restarts the gateway after applying changes.';

  static override examples = [
    '<%= config.bin %> lingerie update waclaw',
    '<%= config.bin %> lingerie update',
    '<%= config.bin %> lingerie update waclaw --dry-run',
  ];

  static override args = {
    id: Args.string({
      description: 'Lingerie ID to update',
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
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(LingerieUpdate);
    await this.loadConfig();

    const registry = createRegistryProvider(process.cwd(), this.clawtiquePaths.cache);
    const state = await this.stateManager.load();

    // Pick lingerie
    let lingerieId = args.id;
    if (!lingerieId) {
      const entries = Object.entries(state.lingerie ?? {});
      if (entries.length === 0) {
        this.error('No active lingerie to update.');
      }
      lingerieId = await select({
        message: 'Choose lingerie to update',
        choices: entries.map(([id, entry]) => ({
          name: `${id} ${chalk.dim(`v${entry.version}`)}`,
          value: id,
        })),
      });
    }

    const entry = state.lingerie?.[lingerieId];
    if (!entry) {
      this.error(`Lingerie "${lingerieId}" is not installed.`);
    }

    // Fetch definition from registry for configSetup schema
    let uw: LingerieJson;
    try {
      uw = await registry.getLingerieJson(lingerieId);
    } catch {
      this.error(`Lingerie "${lingerieId}" not found in the registry.`);
    }

    if (!uw.configSetup) {
      this.log(`\nLingerie "${lingerieId}" has no configurable properties.`);
      return;
    }

    const { configPrefix, params, properties } = uw.configSetup;

    const hasParams = Object.keys(params).length > 0;
    const hasProperties = Object.keys(properties).length > 0;

    if (!configPrefix || (!hasParams && !hasProperties)) {
      this.log(`\nLingerie "${lingerieId}" has no configurable properties.`);
      return;
    }

    // Read current config values
    const currentValues: Record<string, string> = {};
    for (const key of Object.keys(properties)) {
      const fullKey = `${configPrefix}.${key}`;
      const val = await this.openclawDriver.configGet(fullKey);
      if (val !== undefined && val !== '') {
        currentValues[key] = String(val);
      }
    }

    this.log(`\n${chalk.bold(`Updating ${uw.name} config...`)}\n`);

    // Collect param answers (prompt-only inputs used in build templates)
    const answers: Record<string, string> = {};
    for (const [id, param] of Object.entries(params)) {
      const suffix = param.required ? '' : ' (optional)';
      const value = await input({
        message: `  ${param.description}${suffix}:`,
        default: param.default,
      });
      if (!value && param.required) {
        this.error(`Required param "${id}" was not provided.`);
      }
      if (value) answers[id] = value;
    }

    // Collect new property values
    const newValues: Record<string, string> = {};
    for (const [key, prop] of Object.entries(properties)) {
      const suffix = prop.required ? '' : ' (optional)';
      const currentDefault = currentValues[key] ?? prop.default;
      const value = await input({
        message: `  ${prop.description}${suffix}:`,
        default: currentDefault,
      });
      if (!value && prop.required) {
        this.error(`Required config "${key}" was not provided.`);
      }
      if (!value) continue;

      if (prop.build) {
        let built = prop.build.replace('{value}', value);
        for (const paramId of prop.params) {
          built = built.replace(`{${paramId}}`, answers[paramId] ?? '');
        }
        // Clean up empty query params
        built = built.replaceAll(/[&?]\w+=(?=&)/g, '');
        built = built.replaceAll(/[&?]\w+=$/g, '');
        built = built.replace('?&', '?');
        newValues[key] = built;
      } else {
        newValues[key] = value;
      }
    }

    // Compute changes
    const changes: string[] = [];
    for (const [key, newVal] of Object.entries(newValues)) {
      const oldVal = currentValues[key];
      if (oldVal !== newVal) {
        changes.push(
          `  ${chalk.yellow('~')} ${configPrefix}.${key}: ${chalk.red(oldVal ?? '(unset)')} → ${chalk.green(newVal)}`,
        );
      }
    }

    if (changes.length === 0) {
      this.log('\nNo changes detected.\n');
      return;
    }

    this.log(chalk.bold('\nChanges:\n'));
    for (const c of changes) this.log(c);
    this.log('');

    if (flags['dry-run']) {
      this.log(chalk.yellow('Dry run — no changes applied.'));
      return;
    }

    // Verify openclaw health
    const health = await this.openclawDriver.health();
    if (!health.ok) {
      this.error(
        `OpenClaw is not reachable.\n\n` +
          `  ${health.message || 'Could not connect to openclaw CLI.'}\n\n` +
          `Make sure openclaw is installed and accessible, then try again.`,
      );
    }

    if (!flags.yes) {
      const proceed = await confirm({ message: 'Apply changes?', default: true });
      if (!proceed) {
        this.log('Aborted.');
        return;
      }
    }

    await this.stateManager.lock();
    const snapshot = await this.gitManager.snapshot();

    try {
      const configKeys = [...(entry.applied.configKeys ?? [])];

      const tasks = new Listr(
        [
          {
            title: 'Updating config',
            task: async () => {
              for (const [key, val] of Object.entries(newValues)) {
                const fullKey = `${configPrefix}.${key}`;
                await this.openclawDriver.configSet(fullKey, val);
                if (!configKeys.includes(fullKey)) {
                  configKeys.push(fullKey);
                }
              }
            },
          },
          { title: 'Restarting gateway', task: async () => this.restartGateway() },
          { title: 'Resetting waclaw session', task: async () => this.resetWaclawSession() },
          {
            title: 'Saving state',
            task: async () => {
              state.lingerie[lingerieId] = {
                ...entry,
                applied: {
                  ...entry.applied,
                  configKeys,
                },
              };
              await this.stateManager.save(state);
            },
          },
        ],
        { concurrent: false },
      );

      await tasks.run();

      await this.gitManager.commit(
        'refactor',
        lingerieId,
        `lingerie update ${changes.length} config(s)`,
      );

      this.log(`\n${chalk.green('✓')} Updated config for lingerie "${lingerieId}".`);
    } catch (err) {
      if (snapshot) await this.gitManager.rollback(snapshot);
      throw err;
    } finally {
      await this.stateManager.unlock();
    }
  }
}
