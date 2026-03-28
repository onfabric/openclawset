import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Command, Flags } from '@oclif/core';
import type { ClawtiqueConfig } from '#core/index.ts';
import { clawtiqueConfigSchema } from '#core/schemas/state.ts';
import { GitManager } from '#lib/git.ts';
import { LocalOpenClawDriver } from '#lib/openclaw.ts';
import {
  type ClawtiquePaths,
  getClawtiquePaths,
  getOpenClawPaths,
  type OpenClawPaths,
} from '#lib/paths.ts';
import { StateManager } from '#lib/state.ts';

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
