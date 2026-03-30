import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * All clawtique paths derived from the base directory.
 */
export interface ClawtiquePaths {
  /** Root clawtique directory: ~/.clawtique */
  root: string;
  /** Config file: ~/.clawtique/config.json */
  config: string;
  /** State file: ~/.clawtique/state.json */
  state: string;
  /** Installed dresses directory: ~/.clawtique/dresses/ */
  dresses: string;
  /** Lock file: ~/.clawtique/clawtique.lock */
  lock: string;
  /** Cache directory for fetched registry data: ~/.clawtique/cache/ */
  cache: string;
  /** Backup of original personality files: ~/.clawtique/personality-backup/ */
  personalityBackup: string;
}

export function getClawtiquePaths(root?: string): ClawtiquePaths {
  const base = root ?? join(homedir(), '.clawtique');
  return {
    root: base,
    config: join(base, 'config.json'),
    state: join(base, 'state.json'),
    dresses: join(base, 'dresses'),
    lock: join(base, 'clawtique.lock'),
    cache: join(base, 'cache'),
    personalityBackup: join(base, 'personality-backup'),
  };
}

/**
 * Paths within an openclaw installation.
 */
export interface OpenClawPaths {
  root: string;
  config: string;
  dresses: string;
  skills: string;
  heartbeat: string;
  dressesIndex: string;
}

export function getOpenClawPaths(root: string): OpenClawPaths {
  return {
    root,
    config: join(root, 'openclaw.json'),
    dresses: join(root, 'workspace', 'dresses'),
    skills: join(root, 'workspace', 'skills'),
    heartbeat: join(root, 'workspace', 'HEARTBEAT.md'),
    dressesIndex: join(root, 'workspace', 'DRESSES.md'),
  };
}
