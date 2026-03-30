import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type {
  AppliedCron,
  CronDef,
  CronListEntry,
  OpenClawDriver,
  PluginConfigSchema,
  SessionListEntry,
} from '#core/index.ts';
import type { ExecFn } from '#lib/exec-recorder.ts';

const execFileAsync = promisify(execFile);

type PluginInfo = {
  plugin?: {
    kind?: string;
    configJsonSchema?: {
      properties?: Record<string, { type: string; description: string }>;
      required?: string[];
    };
  };
};

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
      this.env.PATH = `${options.pathPrefix}:${process.env.PATH ?? ''}`;
    }
  }

  async exec(
    args: string[],
    options?: { timeout?: number },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (this.execOverride) return this.execOverride(args);
    try {
      const { stdout, stderr } = await execFileAsync(this.bin, args, {
        env: { ...process.env, ...this.env },
        timeout: options?.timeout ?? 30_000,
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
        id: String(entry.id ?? ''),
        name: String(entry.name ?? ''),
        schedule:
          typeof entry.schedule === 'object' && entry.schedule
            ? String((entry.schedule as Record<string, unknown>).expr ?? '')
            : String(entry.schedule ?? ''),
        enabled: Boolean(entry.enabled),
        status: String(entry.status ?? 'unknown'),
      }));
    } catch {
      return [];
    }
  }

  async cronAdd(cron: CronDef & { dressId: string }): Promise<void> {
    const name = `[${cron.dressId}] ${cron.name}`;
    const message = `Use the ${cron.skill} skill. Run \`openclaw skills info ${cron.skill}\` if you need to locate its SKILL.md.`;
    const { exitCode, stderr } = await this.exec([
      'cron',
      'add',
      '--name',
      name,
      '--cron',
      cron.schedule,
      '--message',
      message,
      '--session',
      'isolated',
      '--announce',
      '--channel',
      cron.channel ?? 'last',
      '--thinking',
      'low',
      '--timeout-seconds',
      '240',
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
      const job = jobs.find((j) => String(j.name ?? '') === cron.displayName);
      if (job) id = String(job.id);
    } catch {
      /* ignore parse errors */
    }
    if (!id) {
      throw new Error(`Cron "${cron.displayName}" (${cron.qualifiedId}) not found in openclaw`);
    }
    const { exitCode, stderr } = await this.exec(['cron', 'rm', id]);
    if (exitCode !== 0) {
      throw new Error(`Failed to remove cron "${cron.displayName}": ${stderr}`);
    }
  }

  async skillExists(name: string): Promise<boolean> {
    const { stdout, exitCode } = await this.exec(['skills', 'info', name, '--json']);
    if (exitCode !== 0) return false;
    try {
      const info = JSON.parse(stdout);
      return !info.error;
    } catch {
      return false;
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

  async pluginInstall(spec: string): Promise<void> {
    const { exitCode, stderr } = await this.exec(['plugins', 'install', spec], {
      timeout: 120_000,
    });
    if (exitCode !== 0) {
      throw new Error(`Failed to install plugin "${spec}": ${stderr}`);
    }
  }

  async pluginUninstall(id: string): Promise<void> {
    const { exitCode, stderr } = await this.exec(['plugins', 'uninstall', id, '--force']);
    if (exitCode !== 0) {
      throw new Error(`Failed to uninstall plugin "${id}": ${stderr}`);
    }
  }

  private parseJsonOutput(raw: string): unknown | undefined {
    const start = raw.indexOf('{');
    if (start === -1) return undefined;
    try {
      return JSON.parse(raw.slice(start));
    } catch {
      return undefined;
    }
  }

  async pluginIsInstalled(id: string): Promise<boolean> {
    const { stdout, exitCode } = await this.exec(['plugins', 'inspect', id, '--json']);
    if (exitCode !== 0) return false;
    const info = this.parseJsonOutput(stdout) as Record<string, unknown> | undefined;
    if (!info) return false;
    return !!info.plugin && !!info.install && !info.error;
  }

  async pluginConfigSchema(id: string): Promise<PluginConfigSchema | undefined> {
    const { stdout, exitCode } = await this.exec(['plugins', 'inspect', id, '--json']);
    if (exitCode !== 0) return undefined;
    const info = this.parseJsonOutput(stdout) as PluginInfo | undefined;
    if (!info) return undefined;

    const schema = info.plugin?.configJsonSchema;
    if (!schema?.properties) return undefined;

    const kind = info.plugin?.kind ?? 'plugin';
    const configPrefix = kind === 'channel' ? `channels.${id}` : `plugins.entries.${id}.config`;

    return {
      kind,
      configPrefix,
      properties: schema.properties,
      required: schema.required ?? [],
    };
  }

  async configSet(key: string, value: string): Promise<void> {
    const { exitCode, stderr } = await this.exec(['config', 'set', key, value]);
    if (exitCode !== 0) {
      throw new Error(`Failed to set config "${key}": ${stderr}`);
    }
  }

  async gatewayRestart(): Promise<void> {
    const { exitCode, stderr } = await this.exec(['gateway', 'restart']);
    if (exitCode !== 0) {
      throw new Error(`Failed to restart gateway: ${stderr}`);
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

  async sessionList(): Promise<SessionListEntry[]> {
    const { stdout, exitCode } = await this.exec(['sessions', '--json']);
    if (exitCode !== 0) return [];
    try {
      const data = JSON.parse(stdout);
      const sessions: Record<string, unknown>[] = Array.isArray(data)
        ? data
        : (data.sessions ?? []);
      return sessions.map((s) => ({
        key: String(s.key ?? ''),
        sessionId: String(s.sessionId ?? ''),
        updatedAt: Number(s.updatedAt ?? 0),
        agentId: String(s.agentId ?? ''),
        kind: String(s.kind ?? ''),
      }));
    } catch {
      return [];
    }
  }

  async sessionReset(sessionId: string): Promise<void> {
    const { exitCode, stderr } = await this.exec(
      ['agent', '--message', '/reset', '--session-id', sessionId, '--json'],
      { timeout: 60_000 },
    );
    if (exitCode !== 0) {
      throw new Error(`Failed to reset session "${sessionId}": ${stderr}`);
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
