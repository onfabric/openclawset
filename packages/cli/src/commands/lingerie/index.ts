import { Flags } from '@oclif/core';
import chalk from 'chalk';
import { BaseCommand } from '#base.ts';
import { createRegistryProvider } from '#lib/registry.ts';

export default class LingerieList extends BaseCommand {
  static override summary = 'List available lingerie from the registry';

  static override examples = ['<%= config.bin %> lingerie'];

  static override flags = {
    ...BaseCommand.baseFlags,
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(LingerieList);
    await this.loadConfig();

    const registry = createRegistryProvider(process.cwd(), this.clawtiquePaths.cache);
    const index = await registry.getIndex();
    const state = await this.stateManager.load();
    const activeIds = new Set(Object.keys(state.lingerie ?? {}));

    const entries = Object.entries(index.lingerie);

    if (flags.json) {
      const result = entries.map(([id, entry]) => ({
        id,
        ...entry,
        active: activeIds.has(id),
      }));
      this.log(JSON.stringify(result, null, 2));
      return;
    }

    if (entries.length === 0) {
      this.log('\nNo lingerie available in the registry.\n');
      return;
    }

    this.log(`\n${chalk.bold('Lingerie')}\n`);

    for (const [id, entry] of entries) {
      const active = activeIds.has(id);
      const version = state.lingerie?.[id]?.version ?? entry.version;
      const status = active ? chalk.green(' (active)') : '';
      const marker = active ? chalk.green('●') : chalk.dim('○');

      this.log(`  ${marker} ${chalk.cyan(entry.name)} ${chalk.dim(`${id} v${version}`)}${status}`);
      if (entry.description) {
        this.log(`    ${chalk.dim(entry.description)}`);
      }

      // Show which dresses depend on this lingerie (if active)
      if (active) {
        const dependants: string[] = [];
        for (const [dressId, dressEntry] of Object.entries(state.dresses)) {
          if ((dressEntry.applied.lingerie ?? []).includes(id)) {
            dependants.push(dressId);
          }
        }
        if (dependants.length > 0) {
          this.log(`    ${chalk.dim(`used by: ${dependants.join(', ')}`)}`);
        }
      }
    }

    this.log('');
    this.log(chalk.dim(`  ${entries.length} lingerie | ${activeIds.size} active`));
    this.log('');
  }
}
