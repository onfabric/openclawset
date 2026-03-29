import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import lockfile from 'proper-lockfile';
import writeFileAtomic from 'write-file-atomic';
import type { DressEntry, StateFile } from '#core/index.ts';
import { stateFileSchema } from '#core/index.ts';
import type { ClawtiquePaths } from '#lib/paths.ts';

const EMPTY_STATE: StateFile = {
  version: 1,
  serial: 0,
  openclawDir: '',
  dresses: {},
  lingerie: {},
  personality: null,
};

export class StateManager {
  private paths: ClawtiquePaths;
  private release: (() => Promise<void>) | null = null;

  constructor(paths: ClawtiquePaths) {
    this.paths = paths;
  }

  async load(): Promise<StateFile> {
    if (!existsSync(this.paths.state)) {
      return { ...EMPTY_STATE };
    }
    const raw = await readFile(this.paths.state, 'utf-8');
    return stateFileSchema.parse(JSON.parse(raw));
  }

  async save(state: StateFile): Promise<void> {
    await mkdir(dirname(this.paths.state), { recursive: true });
    const next: StateFile = { ...state, serial: state.serial + 1 };
    await writeFileAtomic(this.paths.state, `${JSON.stringify(next, null, 2)}\n`);
  }

  async lock(): Promise<void> {
    await mkdir(dirname(this.paths.lock), { recursive: true });
    // Lock the state file (or directory if it doesn't exist yet)
    const lockTarget = existsSync(this.paths.state) ? this.paths.state : this.paths.root;
    try {
      this.release = await lockfile.lock(lockTarget, {
        stale: 15_000,
        retries: { retries: 5, minTimeout: 200, maxTimeout: 2000 },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Could not acquire lock — another clawtique process may be running.\n${message}`,
      );
    }
  }

  async unlock(): Promise<void> {
    if (this.release) {
      await this.release();
      this.release = null;
    }
  }

  /**
   * Collect the current set of applied crons, plugins, and skills
   * across all active dresses.
   */
  currentApplied(state: StateFile): {
    crons: Set<string>;
    plugins: Set<string>;
    skills: Set<string>;
  } {
    const crons = new Set<string>();
    const plugins = new Set<string>();
    const skills = new Set<string>();

    for (const entry of Object.values(state.dresses)) {
      for (const c of entry.applied.crons) crons.add(c.qualifiedId);
      for (const p of entry.applied.plugins) plugins.add(p);
      for (const s of entry.applied.skills) skills.add(s);
    }

    // Include lingerie-managed plugins
    for (const entry of Object.values(state.lingerie ?? {})) {
      for (const p of entry.applied.plugins) plugins.add(p);
    }

    return { crons, plugins, skills };
  }

  getDressEntry(state: StateFile, dressId: string): DressEntry | undefined {
    return state.dresses[dressId];
  }

  isDressed(state: StateFile, dressId: string): boolean {
    return dressId in state.dresses;
  }
}
