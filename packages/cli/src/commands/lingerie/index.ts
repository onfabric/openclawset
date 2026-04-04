import { Flags } from '@oclif/core';
import chalk from 'chalk';
import { BaseCommand } from '#base.ts';
import { select } from '#lib/prompt.ts';
import { createRegistryProvider } from '#lib/registry.ts';

export default class LingerieList extends BaseCommand {
  static override summary = 'List lingerie and add or remove them interactively';

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

    const choices = entries.map(([id, entry]) => {
      const active = activeIds.has(id);
      const version = state.lingerie?.[id]?.version ?? entry.version;
      const marker = active ? chalk.green('●') : chalk.dim('○');
      const action = active ? 'remove' : 'add';

      let description = entry.description || undefined;

      // Append dependant info for active lingerie
      if (active) {
        const dependants: string[] = [];
        for (const [dressId, dressEntry] of Object.entries(state.dresses)) {
          if ((dressEntry.applied.lingerie ?? []).includes(id)) {
            dependants.push(dressId);
          }
        }
        if (dependants.length > 0) {
          const suffix = `used by: ${dependants.join(', ')}`;
          description = description ? `${description} — ${suffix}` : suffix;
        }
      }

      return {
        name: `${marker} ${entry.name} ${chalk.dim(`${id} v${version}`)}`,
        value: { action, id },
        description,
      };
    });

    const { action, id } = await select({
      message: 'Lingerie',
      choices,
    });

    await this.config.runCommand(`lingerie:${action}`, [id]);
  }
}
