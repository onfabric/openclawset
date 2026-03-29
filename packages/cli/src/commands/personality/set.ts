import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { confirm, select } from '@inquirer/prompts';
import { Args, Flags } from '@oclif/core';
import chalk from 'chalk';
import { BaseCommand } from '#base.ts';
import type { PersonalityJson } from '#core/index.ts';
import { PERSONALITY_FILES } from '#core/index.ts';
import { createRegistryProvider } from '#lib/registry.ts';

const DEFAULT_PERSONALITY_ID = 'default';

export default class PersonalitySet extends BaseCommand {
  static override summary = 'Apply a personality to your openclaw agent';

  static override examples = [
    '<%= config.bin %> personality set clawdia',
    '<%= config.bin %> personality set default',
  ];

  static override args = {
    id: Args.string({
      description: 'Personality ID from the registry',
      required: false,
    }),
  };

  static override flags = {
    ...BaseCommand.baseFlags,
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip confirmation prompts',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(PersonalitySet);
    await this.loadConfig();

    const registry = createRegistryProvider(process.cwd(), this.clawtiquePaths.cache);
    const state = await this.stateManager.load();
    const workspaceDir = join(this.openclawPaths.root, 'workspace');

    // Pick a personality
    let personalityId = args.id;
    if (!personalityId) {
      const index = await registry.getIndex();
      const registryChoices = Object.entries(index.personalities).map(([id, entry]) => ({
        name: `${entry.name} ${chalk.dim(`(${id})`)}`,
        value: id,
        description: entry.description,
      }));
      const defaultChoice = {
        name: `Default ${chalk.dim('(default)')}`,
        value: DEFAULT_PERSONALITY_ID,
        description: 'Restore original personality files.',
      };

      personalityId = await select({
        message: 'Choose a personality',
        choices: [...registryChoices, defaultChoice],
      });
    }

    // Snapshot existing files before first personality install
    if (!state.personality) {
      await this.snapshotOriginals(workspaceDir);
    }

    // Resolve file contents — either from backup (default) or registry
    let name: string;
    let version: string;
    let description: string;
    let fileContents: Record<string, string>;

    if (personalityId === DEFAULT_PERSONALITY_ID) {
      name = 'Default';
      version = '1.0.0';
      description = 'Restore original personality files.';
      fileContents = await this.loadBackup();
    } else {
      let personality: PersonalityJson;
      try {
        personality = await registry.getPersonalityJson(personalityId);
      } catch {
        this.error(`Personality "${personalityId}" not found in the registry.`);
      }
      name = personality.name;
      version = personality.version;
      description = personality.description;
      fileContents = personality.files;
    }

    // Show what will happen
    const current = state.personality;
    if (current) {
      this.log(
        `\n  Switching from ${chalk.yellow(current.id)} to ${chalk.cyan(name)} ${chalk.dim(`v${version}`)}`,
      );
    } else {
      this.log(`\n  Applying ${chalk.cyan(name)} ${chalk.dim(`v${version}`)}`);
    }
    if (description) {
      this.log(`  ${chalk.dim(description)}`);
    }
    this.log('');

    this.log(chalk.bold('  Files to write:'));
    for (const file of PERSONALITY_FILES) {
      const content = fileContents[file] ?? '';
      const hasContent = content.length > 0;
      const status = hasContent ? chalk.green('+') : chalk.dim('~');
      const label = hasContent ? '' : chalk.dim(' (empty)');
      this.log(`    ${status} ~/.openclaw/workspace/${file}${label}`);
    }
    this.log('');

    if (!flags.yes) {
      const proceed = await confirm({ message: 'Apply personality?', default: true });
      if (!proceed) {
        this.log('Aborted.');
        return;
      }
    }

    // Apply
    await this.stateManager.lock();
    try {
      for (const file of PERSONALITY_FILES) {
        const content = fileContents[file] ?? '';
        await writeFile(join(workspaceDir, file), content);
      }

      state.personality = {
        id: personalityId,
        version,
        installedAt: new Date().toISOString(),
      };
      await this.stateManager.save(state);

      await this.gitManager.commit(
        'feat',
        personalityId,
        `personality v${version}`,
        `files: ${PERSONALITY_FILES.join(', ')}`,
      );

      this.log(`${chalk.green('✓')} Personality set to ${chalk.bold(name)}.`);
    } finally {
      await this.stateManager.unlock();
    }
  }

  /**
   * Snapshot existing personality files before the first personality install.
   */
  private async snapshotOriginals(workspaceDir: string): Promise<void> {
    const backupDir = this.clawtiquePaths.personalityBackup;
    if (existsSync(backupDir)) return; // already snapshotted

    await mkdir(backupDir, { recursive: true });
    for (const file of PERSONALITY_FILES) {
      const src = join(workspaceDir, file);
      const dest = join(backupDir, file);
      if (existsSync(src)) {
        const content = await readFile(src, 'utf-8');
        await writeFile(dest, content);
      } else {
        await writeFile(dest, '');
      }
    }
  }

  /**
   * Load file contents from the personality backup.
   */
  private async loadBackup(): Promise<Record<string, string>> {
    const backupDir = this.clawtiquePaths.personalityBackup;
    const result: Record<string, string> = {};
    for (const file of PERSONALITY_FILES) {
      const path = join(backupDir, file);
      if (existsSync(path)) {
        result[file] = await readFile(path, 'utf-8');
      } else {
        result[file] = '';
      }
    }
    return result;
  }
}
