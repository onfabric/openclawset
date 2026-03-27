import type { CronDef, AppliedCron } from './schema.js';

/**
 * Interface for interacting with an OpenClaw instance.
 *
 * The local driver shells out to the `openclaw` CLI directly.
 * A future SSH driver would wrap commands in SSH execution.
 */
export interface OpenClawDriver {
  // Cron management
  cronList(): Promise<CronListEntry[]>;
  cronAdd(cron: CronDef & { dressId: string }): Promise<void>;
  cronRemove(cron: AppliedCron): Promise<void>;

  // Skill management
  skillInstall(slug: string): Promise<void>;
  skillRemove(name: string): Promise<void>;
  skillCopyBundled(name: string, content: string): Promise<void>;

  // Config reading
  configGet(key: string): Promise<unknown>;

  // Health checks
  health(): Promise<{ ok: boolean; message: string }>;

  // Raw command execution (escape hatch)
  exec(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export interface CronListEntry {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  status: string;
}
