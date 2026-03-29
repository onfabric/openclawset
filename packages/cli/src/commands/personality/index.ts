import chalk from 'chalk';
import { BaseCommand } from '#base.ts';

export default class Personality extends BaseCommand {
  static override summary = 'Show the active personality';

  static override examples = ['<%= config.bin %> personality'];

  static override flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    await this.parse(Personality);
    await this.loadConfig();

    const state = await this.stateManager.load();

    if (!state.personality) {
      this.log('\nNo personality active.');
      this.log(`Run ${chalk.cyan('clawtique personality set <id>')} to apply one.\n`);
      return;
    }

    const { id, version, installedAt } = state.personality;
    this.log(`\n  ${chalk.bold(id)} ${chalk.dim(`v${version}`)}`);
    this.log(`  ${chalk.dim(`Installed: ${installedAt}`)}\n`);
  }
}
