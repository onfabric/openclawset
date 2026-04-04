import { Flags } from '@oclif/core';
import chalk from 'chalk';
import { BaseCommand } from '#base.ts';
import { select } from '#lib/prompt.ts';
import { createRegistryProvider } from '#lib/registry.ts';

export default class DressList extends BaseCommand {
  static override summary = 'List dresses and add or remove them interactively';

  static override examples = ['<%= config.bin %> dress'];

  static override flags = {
    ...BaseCommand.baseFlags,
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DressList);
    await this.loadConfig();

    const registry = createRegistryProvider(process.cwd(), this.clawtiquePaths.cache);
    const index = await registry.getIndex();
    const state = await this.stateManager.load();
    const activeIds = new Set(Object.keys(state.dresses));

    const entries = Object.entries(index.dresses);

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
      this.log('\nNo dresses available in the registry.\n');
      return;
    }

    const choices = entries.map(([id, entry]) => {
      const active = activeIds.has(id);
      const version = state.dresses[id]?.version ?? entry.version;
      const marker = active ? chalk.green('●') : chalk.dim('○');
      const action = active ? 'remove' : 'add';

      return {
        name: `${marker} ${entry.name} ${chalk.dim(`${id} v${version}`)}`,
        value: { action, id },
        description: entry.description || undefined,
      };
    });

    const { action, id } = await select({
      message: 'Dresses',
      choices,
    });

    await this.config.runCommand(`dress:${action}`, [id]);
  }
}
