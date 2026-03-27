import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * All clawset paths derived from the base directory.
 */
export interface ClawsetPaths {
  /** Root clawset directory: ~/.clawset */
  root: string;
  /** Config file: ~/.clawset/config.json */
  config: string;
  /** State file: ~/.clawset/state.json */
  state: string;
  /** Installed dresses directory: ~/.clawset/dresses/ */
  dresses: string;
  /** Lock file: ~/.clawset/clawset.lock */
  lock: string;
}

export function getClawsetPaths(root?: string): ClawsetPaths {
  const base = root ?? join(homedir(), '.clawset');
  return {
    root: base,
    config: join(base, 'config.json'),
    state: join(base, 'state.json'),
    dresses: join(base, 'dresses'),
    lock: join(base, 'clawset.lock'),
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
  memory: string;
  heartbeat: string;
  dressesIndex: string;
}

export function getOpenClawPaths(root: string): OpenClawPaths {
  return {
    root,
    config: join(root, 'openclaw.json'),
    dresses: join(root, 'dresses'),
    skills: join(root, 'skills'),
    memory: join(root, 'memory'),
    heartbeat: join(root, 'HEARTBEAT.md'),
    dressesIndex: join(root, 'DRESSES.md'),
  };
}
