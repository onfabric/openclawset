import { Flags } from '@oclif/core';
import chalk from 'chalk';
import { BaseCommand } from '#base.ts';
import { createRegistryProvider } from '#lib/registry.ts';

export default class PersonalityList extends BaseCommand {
  static override summary = 'List available personalities from the registry';

  static override examples = ['<%= config.bin %> personality'];

  static override flags = {
    ...BaseCommand.baseFlags,
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(PersonalityList);
    await this.loadConfig();

    const registry = createRegistryProvider(process.cwd(), this.clawtiquePaths.cache);
    const index = await registry.getIndex();
    const state = await this.stateManager.load();
    const activeId = state.personality?.id;

    const entries = Object.entries(index.personalities);

    if (flags.json) {
      const result = entries.map(([id, entry]) => ({
        id,
        ...entry,
        active: id === activeId,
      }));
      this.log(JSON.stringify(result, null, 2));
      return;
    }

    if (entries.length === 0 && !activeId) {
      this.log('\nNo personalities available in the registry.\n');
      return;
    }

    this.log(`\n${chalk.bold('Personalities')}\n`);

    for (const [id, entry] of entries) {
      const active = id === activeId;
      const version = active ? (state.personality?.version ?? entry.version) : entry.version;
      const status = active ? chalk.green(' (active)') : '';
      const marker = active ? chalk.green('●') : chalk.dim('○');

      this.log(`  ${marker} ${chalk.cyan(entry.name)} ${chalk.dim(`${id} v${version}`)}${status}`);
      if (entry.description) {
        this.log(`    ${chalk.dim(entry.description)}`);
      }
    }

    // Show default option
    const defaultActive = activeId === 'default' || !activeId;
    const defaultMarker = defaultActive ? chalk.green('●') : chalk.dim('○');
    const defaultStatus = defaultActive ? chalk.green(' (active)') : '';
    this.log(`  ${defaultMarker} ${chalk.cyan('Default')} ${chalk.dim('default')}${defaultStatus}`);
    this.log(`    ${chalk.dim('Restore original personality files.')}`);

    this.log('');
    this.log(chalk.dim(`  ${entries.length + 1} personalities | active: ${activeId ?? 'default'}`));
    this.log('');
  }
}
