import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { BaseCommand } from '#base.ts';

export default class Doctor extends BaseCommand {
  static override summary = 'Verify all active dresses are healthy';

  static override examples = ['<%= config.bin %> doctor'];

  static override flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    await this.parse(Doctor);
    await this.loadConfig();

    const state = await this.stateManager.load();
    const entries = Object.entries(state.dresses);

    if (entries.length === 0) {
      this.log('\nNo dresses active — nothing to check.\n');
      return;
    }

    this.log(`\n${chalk.bold('Health Check')}\n`);

    let allHealthy = true;

    for (const [id, entry] of entries) {
      this.log(`  ${chalk.cyan(id)}:`);

      // Check applied files exist (DRESSCODE.md, etc.)
      for (const f of entry.applied.files) {
        if (existsSync(f)) {
          this.log(`    ${chalk.green('✓')} ${f}`);
        } else {
          this.log(`    ${chalk.red('✗')} Missing: ${f}`);
          allHealthy = false;
        }
      }

      // Check DRESSES.md mentions this dress
      if (existsSync(this.openclawPaths.dressesIndex)) {
        const { readFile } = await import('node:fs/promises');
        const index = await readFile(this.openclawPaths.dressesIndex, 'utf-8');
        if (index.includes(`## ${id}`)) {
          this.log(`    ${chalk.green('✓')} Listed in DRESSES.md`);
        } else {
          this.log(`    ${chalk.red('✗')} Missing from DRESSES.md`);
          allHealthy = false;
        }
      }

      // Check dress directory in clawtique
      const clawtiqueDressDir = join(this.clawtiquePaths.dresses, id);
      if (existsSync(clawtiqueDressDir)) {
        this.log(`    ${chalk.green('✓')} Dress definition at ${clawtiqueDressDir}`);
      } else {
        this.log(`    ${chalk.yellow('!')} No local dress definition (may need reinstall)`);
      }

      // Check skills exist on disk
      for (const skill of entry.applied.skills) {
        if (await this.openclawDriver.skillExists(skill)) {
          this.log(`    ${chalk.green('✓')} skill: ${skill}`);
        } else {
          this.log(`    ${chalk.red('✗')} Missing skill: ${skill}`);
          allHealthy = false;
        }
      }

      // Report memory sections
      if (entry.applied.memorySections.length > 0) {
        this.log(
          `    ${chalk.green('✓')} Memory sections: ${entry.applied.memorySections.join(', ')}`,
        );
      }

      this.log('');
    }

    // OpenClaw health + cron verification
    this.log(`  ${chalk.bold('OpenClaw:')}`);
    let openclawReachable = false;
    try {
      const health = await this.openclawDriver.health();
      if (health.ok) {
        this.log(`    ${chalk.green('✓')} ${health.message || 'Healthy'}`);
        openclawReachable = true;
      } else {
        this.log(`    ${chalk.red('✗')} ${health.message}`);
        allHealthy = false;
      }
    } catch {
      this.log(`    ${chalk.yellow('!')} Could not reach openclaw CLI`);
    }

    // Verify crons exist in OpenClaw
    if (openclawReachable) {
      const liveCrons = await this.openclawDriver.cronList();
      const liveCronNames = new Set(liveCrons.map((c) => c.name));

      for (const [id, entry] of entries) {
        for (const cron of entry.applied.crons) {
          if (liveCronNames.has(cron.displayName)) {
            this.log(`    ${chalk.green('✓')} cron: ${cron.displayName}`);
          } else {
            this.log(`    ${chalk.red('✗')} Missing cron: ${cron.displayName} (dress: ${id})`);
            allHealthy = false;
          }
        }
      }
    }

    this.log('');
    if (allHealthy) {
      this.log(chalk.green('All checks passed.'));
    } else {
      this.log(chalk.yellow('Some checks failed. Review the issues above.'));
    }
    this.log('');
  }
}
