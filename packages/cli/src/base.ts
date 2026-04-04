import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Command, Flags } from '@oclif/core';
import { collectLingerieConfig } from '#lib/lingerie-config.ts';
import { confirm as confirmPrompt, input, setInteractive } from '#lib/prompt.ts';
import chalk from 'chalk';
import { Listr } from 'listr2';
import type { ClawtiqueConfig, LingerieJson, PluginDef, StateFile } from '#core/index.ts';
import { injectToolsSection } from '#core/index.ts';
import { clawtiqueConfigSchema } from '#core/schemas/state.ts';
import { GitManager } from '#lib/git.ts';
import { LocalOpenClawDriver } from '#lib/openclaw.ts';
import {
  type ClawtiquePaths,
  getClawtiquePaths,
  getOpenClawPaths,
  type OpenClawPaths,
} from '#lib/paths.ts';
import type { RegistryProvider } from '#lib/registry.ts';
import { StateManager } from '#lib/state.ts';

export abstract class BaseCommand extends Command {
  static override baseFlags = {
    'clawtique-dir': Flags.string({
      description: 'Path to clawtique directory',
      env: 'CLAWTIQUE_DIR',
    }),
    interactive: Flags.boolean({
      char: 'i',
      description: 'Enable interactive prompts (required for pickers and config wizards)',
      default: false,
    }),
  };

  protected clawtiquePaths!: ClawtiquePaths;
  protected openclawPaths!: OpenClawPaths;
  protected stateManager!: StateManager;
  protected gitManager!: GitManager;
  protected openclawDriver!: LocalOpenClawDriver;

  protected async loadConfig(): Promise<ClawtiqueConfig> {
    const { flags } = await this.parse(this.constructor as typeof BaseCommand);
    setInteractive(flags.interactive);
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

  /**
   * Run setup for a plugin: display notes, run setupCommand or interactive
   * config schema prompts. Call this after `pluginInstall`.
   *
   * @param failOnSetupError — if true, `this.error()` on non-zero exit;
   *   if false, prompt user to confirm whether setup succeeded.
   */
  protected async setupPlugin(
    plugin: PluginDef,
    failOnSetupError = false,
    presetConfig?: Record<string, string>,
  ): Promise<void> {
    if (plugin.setupNotes.length > 0) {
      this.log('');
      for (const note of plugin.setupNotes) {
        this.log(`  ${chalk.cyan('→')} ${note}`);
      }
    }

    if (plugin.setupCommand) {
      this.log(`\n${chalk.bold(`Setting up ${plugin.id}...`)}\n`);
      const [cmd, ...cmdArgs] = plugin.setupCommand.split(' ');
      const exitCode = await new Promise<number>((resolve, reject) => {
        const child = spawn(cmd!, cmdArgs, { stdio: 'inherit' });
        child.on('close', (code: number) => resolve(code));
        child.on('error', reject);
      });
      if (exitCode !== 0) {
        if (failOnSetupError) {
          this.error(`Plugin setup "${plugin.setupCommand}" failed (exit code ${exitCode}).`);
        }
        const cont = await confirmPrompt({
          message: `Setup exited with code ${exitCode}. Did it complete successfully?`,
          default: true,
        });
        if (!cont) {
          throw new Error(`Plugin setup "${plugin.setupCommand}" failed (exit code ${exitCode})`);
        }
      }
    } else {
      const schema = await this.openclawDriver.pluginConfigSchema(plugin.id);
      if (schema && Object.keys(schema.properties).length > 0) {
        this.log(`\n${chalk.bold(`Configuring ${plugin.id}...`)}\n`);
        for (const [key, prop] of Object.entries(schema.properties)) {
          const isRequired = schema.required.includes(key);
          const label = prop.description || key;
          const suffix = isRequired ? '' : ' (optional)';

          let value: string;
          if (presetConfig && key in presetConfig) {
            value = presetConfig[key]!;
          } else {
            value = await input({ message: `${label}${suffix}:` });
          }

          if (value) {
            await this.openclawDriver.configSet(`${schema.configPrefix}.${key}`, value);
          } else if (isRequired) {
            this.error(`Required config "${key}" was not provided.`);
          }
        }
      }
    }
  }

  /**
   * Restart the OpenClaw gateway and wait for it to become healthy.
   * Never throws — warns the user to restart manually on failure.
   * @returns `true` if the gateway became healthy, `false` otherwise.
   */
  protected async restartGateway(): Promise<boolean> {
    try {
      await this.openclawDriver.gatewayRestart();
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 2_000));
        const h = await this.openclawDriver.health();
        if (h.ok) return true;
      }
    } catch {
      // fall through to warning
    }
    this.warn(
      'Gateway failed to restart. Run "openclaw gateway restart" manually to apply changes.',
    );
    return false;
  }

  /**
   * Reset the waclaw agent session so config/plugin changes are picked up.
   * Silently skips if no waclaw session exists.
   */
  protected async resetWaclawSession(): Promise<void> {
    const sessions = await this.openclawDriver.sessionList();
    const waclawSession = sessions.find((s) => s.key.includes(':waclaw:'));
    if (!waclawSession) return;
    await this.openclawDriver.sessionReset(waclawSession.sessionId);
  }

  /**
   * Verify that OpenClaw is reachable. Calls `this.error()` if not.
   */
  protected async ensureHealthy(): Promise<void> {
    const health = await this.openclawDriver.health();
    if (!health.ok) {
      this.error(
        `OpenClaw is not reachable.\n\n` +
          `  ${health.message || 'Could not connect to openclaw CLI.'}\n\n` +
          `Make sure openclaw is installed and accessible, then try again.`,
      );
    }
  }

  /**
   * Check if `--dry-run` is set and log a message if so.
   * @returns `true` if dry-run mode is active (caller should `return`).
   */
  protected isDryRun(flags: { 'dry-run'?: boolean }): boolean {
    if (flags['dry-run']) {
      this.log(chalk.yellow('Dry run — no changes applied.'));
      return true;
    }
    return false;
  }

  /**
   * Prompt user for confirmation unless `--yes` is set.
   * @returns `true` if the user aborted (caller should `return`).
   */
  protected async confirmOrAbort(
    flags: { yes?: boolean },
    message = 'Apply changes?',
    defaultValue = true,
  ): Promise<boolean> {
    if (!flags.yes) {
      const proceed = await confirmPrompt({ message, default: defaultValue });
      if (!proceed) {
        this.log('Aborted.');
        return true;
      }
    }
    return false;
  }

  /**
   * Run `fn` inside a state lock with a git snapshot for rollback.
   * On error, rolls back to the snapshot and re-throws.
   */
  protected async withAtomicOp(fn: () => Promise<void>): Promise<void> {
    await this.stateManager.lock();
    const snapshot = await this.gitManager.snapshot();

    try {
      await fn();
    } catch (err) {
      if (snapshot) await this.gitManager.rollback(snapshot);
      throw err;
    } finally {
      await this.stateManager.unlock();
    }
  }

  /**
   * Reset the waclaw session wrapped in a Listr task with a spinner.
   */
  protected async resetWaclawSessionTask(): Promise<void> {
    const task = new Listr(
      [{ title: 'Resetting waclaw session', task: async () => this.resetWaclawSession() }],
      { concurrent: false },
    );
    await task.run();
  }

  /**
   * Collect plugins and skills used by other dresses and lingerie,
   * excluding the specified dress. Used to avoid removing shared resources.
   */
  protected collectOthersNeeds(
    state: {
      dresses: Record<string, { applied: { plugins: string[]; skills: string[] } }>;
      lingerie: Record<string, { applied: { plugins: string[] } }>;
    },
    excludeId: string,
  ): { plugins: Set<string>; skills: Set<string> } {
    const plugins = new Set<string>();
    const skills = new Set<string>();
    for (const [id, entry] of Object.entries(state.dresses)) {
      if (id === excludeId) continue;
      for (const p of entry.applied.plugins) plugins.add(p);
      for (const s of entry.applied.skills) skills.add(s);
    }
    for (const entry of Object.values(state.lingerie ?? {})) {
      for (const p of entry.applied.plugins) plugins.add(p);
    }
    return { plugins, skills };
  }

  protected async installLingerie(
    registry: RegistryProvider,
    lingerieId: string,
    uw: LingerieJson,
    state: StateFile,
    presetConfig?: Record<string, string>,
  ): Promise<void> {
    const installedPlugins: string[] = [];

    for (const plugin of uw.plugins) {
      if (await this.openclawDriver.pluginIsInstalled(plugin.id)) {
        this.log(`  ${chalk.dim('~')} plugin: ${plugin.id} (already installed)`);
        continue;
      }

      this.log(`  ${chalk.green('+')} plugin: ${plugin.id}`);
      await this.openclawDriver.pluginInstall(plugin.spec);
      installedPlugins.push(plugin.id);

      await this.setupPlugin(plugin, true, presetConfig);
    }

    // Process configSetup — set static configs and collect param/property values
    const configKeys: string[] = [];
    if (uw.configSetup) {
      for (const cfg of uw.configSetup.configs) {
        await this.openclawDriver.configSet(cfg.key, String(cfg.value));
        configKeys.push(cfg.key);
      }

      const { configPrefix, params, properties } = uw.configSetup;
      const hasParams = Object.keys(params).length > 0;
      const hasProperties = Object.keys(properties).length > 0;

      if (configPrefix && (hasParams || hasProperties)) {
        if (!presetConfig) {
          this.log(`\n${chalk.bold(`Configuring ${uw.name}...`)}\n`);
        }

        const { configValues } = await collectLingerieConfig(params, properties, {
          preset: presetConfig,
          onError: (msg) => this.error(msg),
        });

        for (const [k, v] of Object.entries(configValues)) {
          const fullKey = `${configPrefix}.${k}`;
          await this.openclawDriver.configSet(fullKey, v);
          configKeys.push(fullKey);
        }
      }
    }

    // Install bundled skills
    const installedSkills: string[] = [];
    for (const skillName of uw.skills) {
      const content = await registry.getLingerieSkillContent(lingerieId, skillName);
      await this.openclawDriver.skillCopyBundled(skillName, content);
      installedSkills.push(skillName);
      this.log(`  ${chalk.green('+')} skill: ${skillName}`);
    }

    // Copy resource files
    const installedResources: string[] = [];
    if (uw.resources.length > 0) {
      const resourceDir = join(this.openclawPaths.dresses, lingerieId);
      for (const resourcePath of uw.resources) {
        const content = await registry.getLingerieFileContent(lingerieId, resourcePath);
        const dest = join(resourceDir, resourcePath);
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, content);
        installedResources.push(resourcePath);
      }
      this.log(`  ${chalk.green('+')} resources: ${installedResources.length} file(s)`);
    }

    // Inject tools section into TOOLS.md
    let toolsSectionInjected = false;
    if (uw.toolsSection) {
      const content = await registry.getLingerieFileContent(lingerieId, uw.toolsSection);
      await injectToolsSection(this.openclawPaths.workspace, lingerieId, content);
      toolsSectionInjected = true;
      this.log(`  ${chalk.green('+')} tools section`);
    }

    // Restart gateway & reset session if anything changed
    if (installedPlugins.length > 0 || configKeys.length > 0) {
      const postInstallTasks = new Listr(
        [
          { title: 'Restarting gateway', task: async () => this.restartGateway() },
          { title: 'Resetting waclaw session', task: async () => this.resetWaclawSession() },
        ],
        { concurrent: false },
      );
      await postInstallTasks.run();
    }

    // Save lingerie to state
    state.lingerie[lingerieId] = {
      package: lingerieId,
      version: uw.version,
      installedAt: new Date().toISOString(),
      applied: {
        plugins: uw.plugins.map((p) => p.id),
        installedPlugins,
        configKeys,
        skills: uw.skills,
        installedSkills,
        toolsSectionInjected,
        installedResources,
      },
    };
    await this.stateManager.save(state);
  }
}
