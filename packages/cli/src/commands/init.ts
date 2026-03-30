import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { confirm, input } from '@inquirer/prompts';
import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import type { ClawtiqueConfig, StateFile } from '#core/index.ts';
import { ensureDressesReference } from '#core/index.ts';
import { GitManager } from '#lib/git.ts';
import { getClawtiquePaths, getOpenClawPaths } from '#lib/paths.ts';

export default class Init extends Command {
  static override summary = 'Initialize clawtique for an OpenClaw instance';

  static override examples = [
    '<%= config.bin %> init',
    '<%= config.bin %> init --openclaw-dir ~/.openclaw',
  ];

  static override flags = {
    'openclaw-dir': Flags.string({
      char: 'o',
      description: 'Path to the OpenClaw directory',
    }),
    'clawtique-dir': Flags.string({
      description: 'Path to clawtique directory (default: ~/.clawtique)',
      env: 'CLAWTIQUE_DIR',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Init);

    const paths = getClawtiquePaths(flags['clawtique-dir']);

    // Check if already initialized
    if (existsSync(paths.config)) {
      const overwrite = await confirm({
        message: 'Clawtique is already initialized. Re-initialize?',
        default: false,
      });
      if (!overwrite) {
        this.log('Aborted.');
        return;
      }
    }

    // Get openclaw directory
    let openclawDir = flags['openclaw-dir'];
    if (!openclawDir) {
      openclawDir = await input({
        message: 'Where is your OpenClaw directory?',
        default: join(process.env.HOME ?? '~', '.openclaw'),
      });
    }

    // Verify openclaw directory
    const ocPaths = getOpenClawPaths(openclawDir);
    if (!existsSync(ocPaths.config)) {
      this.warn(`No openclaw.json found at ${ocPaths.config}`);
      const proceed = await confirm({
        message: 'Continue anyway?',
        default: false,
      });
      if (!proceed) {
        this.log('Aborted.');
        return;
      }
    }

    // Get user name
    const userName = await input({
      message: "What's your name?",
    });

    // Create clawtique directory structure
    await mkdir(paths.root, { recursive: true });
    await mkdir(paths.dresses, { recursive: true });
    await mkdir(join(openclawDir, 'workspace', 'dresses'), { recursive: true });

    // Ensure AGENTS.md references DRESSES.md so dresses are discoverable
    await ensureDressesReference(join(openclawDir, 'workspace'));

    // Write config
    const config: ClawtiqueConfig = {
      openclawDir,
      timezone: 'UTC',
      version: '0.1.0',
      user: { name: userName },
    };
    await writeFile(paths.config, `${JSON.stringify(config, null, 2)}\n`);

    // Write initial state
    const state: StateFile = {
      version: 1,
      serial: 0,
      openclawDir,
      dresses: {},
      lingerie: {},
      personality: null,
    };
    await writeFile(paths.state, `${JSON.stringify(state, null, 2)}\n`);

    // Initialize git repo
    const git = new GitManager(paths.root);
    await git.init();
    await git.commit('feat', 'clawtique', 'initialize clawtique');

    this.log('');
    this.log(`${chalk.green('✓')} Initialized clawtique at ${chalk.cyan(paths.root)}`);
    this.log(`${chalk.green('✓')} OpenClaw directory: ${chalk.cyan(openclawDir)}`);
    this.log(`${chalk.green('✓')} Git repo initialized`);
    this.log('');
    this.log('Ready. Try:');
    this.log(`  ${chalk.cyan('clawtique dress add')} <id>`);
    this.log(`  ${chalk.cyan('clawtique status')}`);
  }
}
