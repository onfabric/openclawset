import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { ClawtiqueConfig } from '@clawtique/core';
import { clawtiqueConfigSchema } from '@clawtique/core';
import { Command, Flags } from '@oclif/core';
import { GitManager } from './lib/git.js';
import { LocalOpenClawDriver } from './lib/openclaw.js';
import {
  type ClawtiquePaths,
  getClawtiquePaths,
  getOpenClawPaths,
  type OpenClawPaths,
} from './lib/paths.js';
import { StateManager } from './lib/state.js';

export abstract class BaseCommand extends Command {
  static override baseFlags = {
    'clawtique-dir': Flags.string({
      description: 'Path to clawtique directory',
      env: 'CLAWTIQUE_DIR',
    }),
  };

  protected clawtiquePaths!: ClawtiquePaths;
  protected openclawPaths!: OpenClawPaths;
  protected stateManager!: StateManager;
  protected gitManager!: GitManager;
  protected openclawDriver!: LocalOpenClawDriver;

  protected async loadConfig(): Promise<ClawtiqueConfig> {
    const { flags } = await this.parse(this.constructor as typeof BaseCommand);
    this.clawtiquePaths = getClawtiquePaths(flags['clawtique-dir']);

    if (!existsSync(this.clawtiquePaths.config)) {
      this.error('Clawtique is not initialized.\nRun: clawtique init');
    }

    const raw = await readFile(this.clawtiquePaths.config, 'utf-8');
    const config = clawtiqueConfigSchema.parse(JSON.parse(raw));

    this.openclawPaths = getOpenClawPaths(config.openclawDir);
    this.stateManager = new StateManager(this.clawtiquePaths);
    this.gitManager = new GitManager(this.clawtiquePaths.root);
    this.openclawDriver = new LocalOpenClawDriver({
      skillsDir: this.openclawPaths.skills,
    });

    return config;
  }
}
