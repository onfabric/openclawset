import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { OpenClawDriver, CronListEntry, CronDef, AppliedCron } from '@clawset/core';
import type { ExecFn } from './exec-recorder.js';

const execFileAsync = promisify(execFile);

/**
 * Local OpenClaw driver — shells out to the `openclaw` CLI.
 *
 * Accepts an optional `execFn` override for testing (record/replay).
 */
export class LocalOpenClawDriver implements OpenClawDriver {
  private bin: string;
  private env: Record<string, string>;
  private execOverride?: ExecFn;
  private skillsDir?: string;

  constructor(options?: {
    bin?: string;
    pathPrefix?: string;
    execFn?: ExecFn;
    skillsDir?: string;
  }) {
    this.bin = options?.bin ?? 'openclaw';
    this.env = {};
    this.execOverride = options?.execFn;
    this.skillsDir = options?.skillsDir;
    if (options?.pathPrefix) {
      this.env['PATH'] = `${options.pathPrefix}:${process.env['PATH'] ?? ''}`;
    }
  }

  async exec(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (this.execOverride) return this.execOverride(args);
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
      const jobs: Record<string, unknown>[] = Array.isArray(data) ? data : (data.jobs ?? []);
      return jobs.map((entry) => ({
        id: String(entry['id'] ?? ''),
        name: String(entry['name'] ?? ''),
        schedule: typeof entry['schedule'] === 'object' && entry['schedule']
          ? String((entry['schedule'] as Record<string, unknown>)['expr'] ?? '')
          : String(entry['schedule'] ?? ''),
        enabled: Boolean(entry['enabled']),
        status: String(entry['status'] ?? 'unknown'),
      }));
    } catch {
      return [];
    }
  }

  async cronAdd(cron: CronDef & { dressId: string }): Promise<void> {
    const name = `[${cron.dressId}] ${cron.name}`;
    const message = `Follow the instructions in ~/.openclaw/skills/${cron.skill}/SKILL.md`;
    const { exitCode, stderr } = await this.exec([
      'cron', 'add',
      '--name', name,
      '--cron', cron.schedule,
      '--message', message,
      '--session', 'isolated',
      '--announce',
      '--channel', 'last',
      '--thinking', 'low',
      '--timeout-seconds', '240',
      '--exact',
    ]);
    if (exitCode !== 0) {
      throw new Error(`Failed to add cron "${name}": ${stderr}`);
    }
  }

  async cronRemove(cron: AppliedCron): Promise<void> {
    // openclaw cron rm requires the job UUID, so look it up by display name
    const { stdout } = await this.exec(['cron', 'list', '--json']);
    let id: string | undefined;
    try {
      const data = JSON.parse(stdout);
      const jobs: Record<string, unknown>[] = Array.isArray(data) ? data : (data.jobs ?? []);
      const job = jobs.find((j) => String(j['name'] ?? '') === cron.displayName);
      if (job) id = String(job['id']);
    } catch { /* ignore parse errors */ }
    if (!id) {
      throw new Error(`Cron "${cron.displayName}" (${cron.qualifiedId}) not found in openclaw`);
    }
    const { exitCode, stderr } = await this.exec(['cron', 'rm', id]);
    if (exitCode !== 0) {
      throw new Error(`Failed to remove cron "${cron.displayName}": ${stderr}`);
    }
  }

  async skillInstall(slug: string): Promise<void> {
    const { exitCode, stderr } = await this.exec(['skills', 'install', slug]);
    if (exitCode !== 0) {
      throw new Error(`Failed to install skill "${slug}": ${stderr}`);
    }
  }

  async skillRemove(name: string): Promise<void> {
    if (!this.skillsDir) {
      throw new Error('skillsDir not configured — cannot remove skills');
    }
    const skillDir = join(this.skillsDir, name);
    await rm(skillDir, { recursive: true, force: true });
  }

  async skillCopyBundled(name: string, content: string): Promise<void> {
    if (!this.skillsDir) {
      throw new Error('skillsDir not configured — cannot copy bundled skills');
    }
    const skillDir = join(this.skillsDir, name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), content);
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
