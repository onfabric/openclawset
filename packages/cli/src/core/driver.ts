import type { AppliedCron, CronDef } from '#core/schema.ts';

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
  skillExists(name: string): Promise<boolean>;
  skillInstall(slug: string): Promise<void>;
  skillRemove(name: string): Promise<void>;
  skillCopyBundled(name: string, content: string): Promise<void>;

  // Plugin management
  pluginInstall(spec: string): Promise<void>;
  pluginUninstall(id: string): Promise<void>;
  pluginIsInstalled(id: string): Promise<boolean>;
  pluginConfigSchema(id: string): Promise<PluginConfigSchema | undefined>;

  // Config management
  configGet(key: string): Promise<unknown>;
  configSet(key: string, value: string): Promise<void>;

  // Gateway
  gatewayRestart(): Promise<void>;

  // Session management
  sessionList(): Promise<SessionListEntry[]>;
  sessionReset(sessionId: string): Promise<void>;

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

export interface SessionListEntry {
  key: string;
  sessionId: string;
  updatedAt: number;
  agentId: string;
  kind: string;
}

export interface PluginConfigSchema {
  kind: string;
  configPrefix: string; // e.g. 'channels.waclaw' or 'plugins.entries.openclaw-fabric.config'
  properties: Record<string, { type: string; description: string }>;
  required: string[];
}
