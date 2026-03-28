import { Flags } from '@oclif/core';
import chalk from 'chalk';
import { BaseCommand } from '../base.js';
import { createRegistryProvider } from '../lib/registry.js';

export default class Wardrobe extends BaseCommand {
  static override summary = 'List available dresses and their status';

  static override examples = ['<%= config.bin %> wardrobe', '<%= config.bin %> wardrobe --json'];

  static override flags = {
    ...BaseCommand.baseFlags,
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Wardrobe);
    await this.loadConfig();

    const registry = createRegistryProvider(process.cwd());
    const index = await registry.getIndex();
    const state = await this.stateManager.load();

    const wornIds = new Set(Object.keys(state.dresses));
    const wornLingerie = new Set(Object.keys(state.lingerie ?? {}));

    if (flags.json) {
      const data = {
        dresses: Object.fromEntries(
          Object.entries(index.dresses).map(([id, entry]) => [
            id,
            {
              ...entry,
              worn: wornIds.has(id),
              ...(wornIds.has(id) ? { installedVersion: state.dresses[id]!.version } : {}),
            },
          ]),
        ),
        lingerie: Object.fromEntries(
          Object.entries(index.lingerie).map(([id, entry]) => [
            id,
            {
              ...entry,
              worn: wornLingerie.has(id),
            },
          ]),
        ),
      };
      this.log(JSON.stringify(data, null, 2));
      return;
    }

    // Dresses
    this.log(chalk.bold('\nDresses:\n'));
    const dressEntries = Object.entries(index.dresses);
    if (dressEntries.length === 0) {
      this.log('  No dresses in registry.');
    } else {
      for (const [id, entry] of dressEntries) {
        const worn = wornIds.has(id);
        const icon = worn ? chalk.green('●') : chalk.dim('○');
        const label = worn ? chalk.green(entry.name) : entry.name;
        const version = chalk.dim(`v${entry.version}`);
        const status = worn ? chalk.green(' (worn)') : '';
        this.log(`  ${icon} ${label} ${version}${status}`);
        if (entry.description) {
          this.log(`    ${chalk.dim(entry.description)}`);
        }
        if (entry.requires.lingerie.length > 0) {
          const uwStatus = entry.requires.lingerie
            .map((uwId) => (wornLingerie.has(uwId) ? chalk.green(uwId) : chalk.yellow(uwId)))
            .join(', ');
          this.log(`    ${chalk.dim('requires:')} ${uwStatus}`);
        }
      }
    }

    // Lingerie
    this.log(chalk.bold('\nLingerie:\n'));
    const uwEntries = Object.entries(index.lingerie);
    if (uwEntries.length === 0) {
      this.log('  No lingerie in registry.');
    } else {
      for (const [id, entry] of uwEntries) {
        const worn = wornLingerie.has(id);
        const icon = worn ? chalk.green('●') : chalk.dim('○');
        const label = worn ? chalk.green(entry.name) : entry.name;
        const status = worn ? chalk.green(' (worn)') : '';
        this.log(`  ${icon} ${label}${status}`);
      }
    }

    this.log('');
  }
}
