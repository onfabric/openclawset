import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { OpenClawDriver, CronListEntry, CronDef } from '@clawset/core';

const execFileAsync = promisify(execFile);

/**
 * Local OpenClaw driver — shells out to the `openclaw` CLI.
 */
export class LocalOpenClawDriver implements OpenClawDriver {
  private bin: string;
  private env: Record<string, string>;

  constructor(options?: { bin?: string; pathPrefix?: string }) {
    this.bin = options?.bin ?? 'openclaw';
    this.env = {};
    if (options?.pathPrefix) {
      this.env['PATH'] = `${options.pathPrefix}:${process.env['PATH'] ?? ''}`;
    }
  }

  async exec(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      const { stdout, stderr } = await execFileAsync(this.bin, args, {
        env: { ...process.env, ...this.env },
        timeout: 30_000,
      });
      return { stdout, stderr, exitCode: 0 };
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; code?: number };
      return {
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? String(err),
        exitCode: error.code ?? 1,
      };
    }
  }

  async cronList(): Promise<CronListEntry[]> {
    const { stdout, exitCode } = await this.exec(['cron', 'list', '--json']);
    if (exitCode !== 0) return [];
    try {
      const data = JSON.parse(stdout);
      if (Array.isArray(data)) {
        return data.map((entry: Record<string, unknown>) => ({
          name: String(entry['name'] ?? ''),
          schedule: String(entry['schedule'] ?? ''),
          enabled: Boolean(entry['enabled']),
          status: String(entry['status'] ?? 'unknown'),
        }));
      }
      return [];
    } catch {
      return [];
    }
  }

  async cronAdd(cron: CronDef & { dressId: string }): Promise<void> {
    const name = `[${cron.dressId}] ${cron.name}`;
    const { exitCode, stderr } = await this.exec([
      'cron', 'add',
      '--name', name,
      '--schedule', cron.schedule,
      '--prompt', cron.prompt,
    ]);
    if (exitCode !== 0) {
      throw new Error(`Failed to add cron "${name}": ${stderr}`);
    }
  }

  async cronRemove(name: string): Promise<void> {
    const { exitCode, stderr } = await this.exec(['cron', 'rm', '--name', name]);
    if (exitCode !== 0) {
      throw new Error(`Failed to remove cron "${name}": ${stderr}`);
    }
  }

  async configGet(key: string): Promise<unknown> {
    const { stdout, exitCode } = await this.exec(['config', 'get', key]);
    if (exitCode !== 0) return undefined;
    try {
      return JSON.parse(stdout);
    } catch {
      return stdout.trim();
    }
  }

  async health(): Promise<{ ok: boolean; message: string }> {
    const { exitCode, stdout, stderr } = await this.exec(['health']);
    return {
      ok: exitCode === 0,
      message: exitCode === 0 ? stdout.trim() : stderr.trim(),
    };
  }
}
