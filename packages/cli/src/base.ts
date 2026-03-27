import { Command, Flags } from '@oclif/core';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { ClawsetConfig } from '@clawset/core';
import { clawsetConfigSchema } from '@clawset/core';
import { getClawsetPaths, getOpenClawPaths, type ClawsetPaths, type OpenClawPaths } from './lib/paths.js';
import { StateManager } from './lib/state.js';
import { GitManager } from './lib/git.js';
import { LocalOpenClawDriver } from './lib/openclaw.js';

export abstract class BaseCommand extends Command {
  static baseFlags = {
    'clawset-dir': Flags.string({
      description: 'Path to clawset directory',
      env: 'CLAWSET_DIR',
    }),
  };

  protected clawsetPaths!: ClawsetPaths;
  protected openclawPaths!: OpenClawPaths;
  protected stateManager!: StateManager;
  protected gitManager!: GitManager;
  protected openclawDriver!: LocalOpenClawDriver;

  protected async loadConfig(): Promise<ClawsetConfig> {
    const { flags } = await this.parse(this.constructor as typeof BaseCommand);
    this.clawsetPaths = getClawsetPaths(flags['clawset-dir']);

    if (!existsSync(this.clawsetPaths.config)) {
      this.error(
        'Clawset is not initialized.\nRun: clawset init',
      );
    }

    const raw = await readFile(this.clawsetPaths.config, 'utf-8');
    const config = clawsetConfigSchema.parse(JSON.parse(raw));

    this.openclawPaths = getOpenClawPaths(config.openclawDir);
    this.stateManager = new StateManager(this.clawsetPaths);
    this.gitManager = new GitManager(this.clawsetPaths.root);
    this.openclawDriver = new LocalOpenClawDriver({
      skillsDir: this.openclawPaths.skills,
    });

    return config;
  }
}
