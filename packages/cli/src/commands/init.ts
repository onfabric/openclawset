import { Command, Flags } from '@oclif/core';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import type { ClawsetConfig, StateFile } from '@clawset/core';
import { getClawsetPaths, getOpenClawPaths } from '../lib/paths.js';
import { GitManager } from '../lib/git.js';

export default class Init extends Command {
  static summary = 'Initialize clawset for an OpenClaw instance';

  static examples = [
    '<%= config.bin %> init',
    '<%= config.bin %> init --openclaw-dir ~/.openclaw',
  ];

  static flags = {
    'openclaw-dir': Flags.string({
      char: 'o',
      description: 'Path to the OpenClaw directory',
    }),
    'clawset-dir': Flags.string({
      description: 'Path to clawset directory (default: ~/.clawset)',
      env: 'CLAWSET_DIR',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Init);

    const paths = getClawsetPaths(flags['clawset-dir']);

    // Check if already initialized
    if (existsSync(paths.config)) {
      const overwrite = await confirm({
        message: 'Clawset is already initialized. Re-initialize?',
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
        default: join(process.env['HOME'] ?? '~', '.openclaw'),
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

    // Create clawset directory structure
    await mkdir(paths.root, { recursive: true });
    await mkdir(paths.dresses, { recursive: true });
    await mkdir(join(openclawDir, 'dresses'), { recursive: true });

    // Write config
    const config: ClawsetConfig = {
      openclawDir,
      version: '0.1.0',
    };
    await writeFile(paths.config, JSON.stringify(config, null, 2) + '\n');

    // Write initial state
    const state: StateFile = {
      version: 1,
      serial: 0,
      openclawDir,
      dresses: {},
    };
    await writeFile(paths.state, JSON.stringify(state, null, 2) + '\n');

    // Initialize git repo
    const git = new GitManager(paths.root);
    await git.init();
    await git.commit('feat', 'clawset', 'initialize clawset');

    this.log('');
    this.log(chalk.green('✓') + ' Initialized clawset at ' + chalk.cyan(paths.root));
    this.log(chalk.green('✓') + ' OpenClaw directory: ' + chalk.cyan(openclawDir));
    this.log(chalk.green('✓') + ' Git repo initialized');
    this.log('');
    this.log('Ready. Try:');
    this.log(`  ${chalk.cyan('clawset dress')} ./path/to/dress`);
    this.log(`  ${chalk.cyan('clawset status')}`);
  }
}
