import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { confirm, input } from '@inquirer/prompts';
import { Command, Flags } from '@oclif/core';
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

  /**
   * Run setup for a plugin: display notes, run setupCommand or interactive
   * config schema prompts. Call this after `pluginInstall`.
   *
   * @param failOnSetupError — if true, `this.error()` on non-zero exit;
   *   if false, prompt user to confirm whether setup succeeded.
   */
  protected async setupPlugin(plugin: PluginDef, failOnSetupError = false): Promise<void> {
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
        const cont = await confirm({
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
          const value = await input({ message: `${label}${suffix}:` });
          if (value) {
            await this.openclawDriver.configSet(`${schema.configPrefix}.${key}`, value);
          } else if (isRequired) {
            this.error(`Required config "${key}" was not provided.`);
          }
        }
      }
    }
  }

  protected async installLingerie(
    registry: RegistryProvider,
    lingerieId: string,
    uw: LingerieJson,
    state: StateFile,
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

      await this.setupPlugin(plugin, true);
    }

    // Process configSetup — set static configs and prompt for properties
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
        this.log(`\n${chalk.bold(`Configuring ${uw.name}...`)}\n`);

        // Collect param answers (prompt-only inputs, not stored in config)
        const answers: Record<string, string> = {};
        for (const [id, param] of Object.entries(params)) {
          const suffix = param.required ? '' : ' (optional)';
          const value = await input({
            message: `  ${param.description}${suffix}:`,
            default: param.default,
          });

          if (!value && param.required) {
            this.error(`Required param "${id}" was not provided.`);
          }

          if (value) answers[id] = value;
        }

        // Collect property values (these become config keys)
        const obj: Record<string, string> = {};
        for (const [key, prop] of Object.entries(properties)) {
          const suffix = prop.required ? '' : ' (optional)';
          const value = await input({
            message: `  ${prop.description}${suffix}:`,
            default: prop.default,
          });

          if (!value && prop.required) {
            this.error(`Required config "${key}" was not provided.`);
          }

          if (!value) continue;

          if (prop.build) {
            // Build the final value by substituting {value} and {paramId}
            let built = prop.build.replace('{value}', value);
            for (const paramId of prop.params) {
              built = built.replace(`{${paramId}}`, answers[paramId] ?? '');
            }
            // Clean up empty query params
            built = built.replaceAll(/[&?]\w+=(?=&)/g, '');
            built = built.replaceAll(/[&?]\w+=$/g, '');
            built = built.replace('?&', '?');
            obj[key] = built;
          } else {
            obj[key] = value;
          }
        }

        for (const [k, v] of Object.entries(obj)) {
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

    // Inject tools section into TOOLS.md
    let toolsSectionInjected = false;
    if (uw.toolsSection) {
      const content = await registry.getLingerieFileContent(lingerieId, uw.toolsSection);
      await injectToolsSection(this.openclawPaths.workspace, lingerieId, content);
      toolsSectionInjected = true;
      this.log(`  ${chalk.green('+')} tools section`);
    }

    // Restart gateway if anything changed
    if (installedPlugins.length > 0 || configKeys.length > 0) {
      const restartTask = new Listr(
        [
          {
            title: 'Restarting gateway',
            task: async () => {
              await this.openclawDriver.gatewayRestart();
              for (let i = 0; i < 10; i++) {
                await new Promise((r) => setTimeout(r, 2_000));
                const h = await this.openclawDriver.health();
                if (h.ok) return;
              }
              throw new Error('Gateway did not become healthy after restart');
            },
          },
        ],
        { concurrent: false },
      );
      await restartTask.run();
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
      },
    };
    await this.stateManager.save(state);
  }
}
