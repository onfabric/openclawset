import { confirm, select } from '@inquirer/prompts';
import { Args, Flags } from '@oclif/core';
import chalk from 'chalk';
import { Listr } from 'listr2';
import { BaseCommand } from '#base.ts';
import type { LingerieJson } from '#core/index.ts';
import { createRegistryProvider } from '#lib/registry.ts';

export default class LingerieUpgrade extends BaseCommand {
  static override summary = 'Upgrade lingerie to the latest registry version';

  static override examples = [
    '<%= config.bin %> lingerie upgrade waclaw',
    '<%= config.bin %> lingerie upgrade --check',
    '<%= config.bin %> lingerie upgrade waclaw --dry-run',
  ];

  static override args = {
    id: Args.string({
      description: 'Lingerie ID to upgrade',
      required: false,
    }),
  };

  static override flags = {
    ...BaseCommand.baseFlags,
    check: Flags.boolean({
      description: 'Just check for available upgrades without applying',
      default: false,
    }),
    'dry-run': Flags.boolean({
      description: 'Show what would change without applying',
      default: false,
    }),
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip confirmation prompts',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(LingerieUpgrade);
    await this.loadConfig();

    const registry = createRegistryProvider(process.cwd(), this.clawtiquePaths.cache);
    const state = await this.stateManager.load();

    // Pick lingerie
    let lingerieId = args.id;
    if (!lingerieId) {
      const entries = Object.entries(state.lingerie ?? {});
      if (entries.length === 0) {
        this.error('No active lingerie to upgrade.');
      }
      lingerieId = await select({
        message: 'Choose lingerie to upgrade',
        choices: entries.map(([id, entry]) => ({
          name: `${id} ${chalk.dim(`v${entry.version}`)}`,
          value: id,
        })),
      });
    }

    const entry = state.lingerie?.[lingerieId];
    if (!entry) {
      this.error(`Lingerie "${lingerieId}" is not installed.`);
    }

    // Fetch latest from registry
    let latest: LingerieJson;
    try {
      latest = await registry.getLingerieJson(lingerieId);
    } catch {
      this.error(`Lingerie "${lingerieId}" not found in the registry.`);
    }

    // Compare versions
    if (entry.version === latest.version) {
      this.log(
        `\n${chalk.green('✓')} Lingerie "${lingerieId}" is already at the latest version (v${entry.version}).`,
      );
      return;
    }

    this.log(
      `\n  ${chalk.bold(latest.name)} ${chalk.dim(`v${entry.version}`)} → ${chalk.green(`v${latest.version}`)}`,
    );
    if (latest.description) {
      this.log(`  ${chalk.dim(latest.description)}`);
    }
    this.log('');

    // -----------------------------------------------------------------------
    // Compute diff
    // -----------------------------------------------------------------------

    const oldPluginIds = new Set(entry.applied.plugins);
    const newPluginIds = new Set(latest.plugins.map((p) => p.id));
    const pluginsToAdd = latest.plugins.filter((p) => !oldPluginIds.has(p.id));
    const pluginsToRemove = (entry.applied.installedPlugins ?? []).filter(
      (p) => !newPluginIds.has(p),
    );

    const oldSkillIds = new Set(entry.applied.skills);
    const newSkillIds = new Set(latest.skills);
    const skillsToAdd = latest.skills.filter((s) => !oldSkillIds.has(s));
    const skillsToRemove = (entry.applied.installedSkills ?? []).filter((s) => !newSkillIds.has(s));
    const skillsToUpdate = latest.skills.filter((s) => oldSkillIds.has(s));

    const oldConfigKeys = new Set(entry.applied.configKeys ?? []);
    const newStaticConfigs = (latest.configSetup?.configs ?? []).filter(
      (cfg) => !oldConfigKeys.has(cfg.key),
    );
    const hasNewConfigPrefix =
      latest.configSetup?.configPrefix != null &&
      !oldConfigKeys.has(latest.configSetup.configPrefix);

    // Show diff
    const hasChanges =
      pluginsToAdd.length > 0 ||
      pluginsToRemove.length > 0 ||
      skillsToAdd.length > 0 ||
      skillsToRemove.length > 0 ||
      skillsToUpdate.length > 0 ||
      newStaticConfigs.length > 0 ||
      hasNewConfigPrefix;

    if (hasChanges) {
      this.log(chalk.bold('Changes:'));
    } else {
      this.log(chalk.dim('  No structural changes (version bump only).'));
    }

    for (const p of pluginsToAdd) {
      this.log(`  ${chalk.green('+')} plugin: ${p.id} ${chalk.dim(`(${p.spec})`)}`);
    }
    for (const p of pluginsToRemove) {
      this.log(`  ${chalk.red('-')} plugin: ${p}`);
    }
    for (const s of skillsToAdd) {
      this.log(`  ${chalk.green('+')} skill: ${s}`);
    }
    for (const s of skillsToRemove) {
      this.log(`  ${chalk.red('-')} skill: ${s}`);
    }
    for (const s of skillsToUpdate) {
      this.log(`  ${chalk.yellow('~')} skill: ${s} ${chalk.dim('(content updated)')}`);
    }
    for (const cfg of newStaticConfigs) {
      this.log(`  ${chalk.green('+')} config: ${cfg.key}`);
    }
    if (hasNewConfigPrefix) {
      this.log(
        `  ${chalk.green('+')} config: ${latest.configSetup!.configPrefix} ${chalk.dim('(requires setup)')}`,
      );
    }
    this.log('');

    if (flags.check) {
      return;
    }

    if (flags['dry-run']) {
      this.log(chalk.yellow('Dry run — no changes applied.'));
      return;
    }

    // Verify openclaw health
    const health = await this.openclawDriver.health();
    if (!health.ok) {
      this.error(
        `OpenClaw is not reachable.\n\n` +
          `  ${health.message || 'Could not connect to openclaw CLI.'}\n\n` +
          `Make sure openclaw is installed and accessible, then try again.`,
      );
    }

    if (!flags.yes) {
      const proceed = await confirm({ message: 'Apply upgrade?', default: true });
      if (!proceed) {
        this.log('Aborted.');
        return;
      }
    }

    // -----------------------------------------------------------------------
    // Apply
    // -----------------------------------------------------------------------

    await this.stateManager.lock();
    const snapshot = await this.gitManager.snapshot();

    try {
      const installedPlugins = [...(entry.applied.installedPlugins ?? [])];
      const installedSkills = [...(entry.applied.installedSkills ?? [])];
      const configKeys = [...(entry.applied.configKeys ?? [])];
      let needsRestart = false;

      const tasks = new Listr(
        [
          {
            title: 'Removing obsolete plugins',
            skip: () => pluginsToRemove.length === 0,
            task: async () => {
              for (const pluginId of pluginsToRemove) {
                try {
                  await this.openclawDriver.pluginUninstall(pluginId);
                } catch {
                  /* may have been manually removed */
                }
                const idx = installedPlugins.indexOf(pluginId);
                if (idx >= 0) installedPlugins.splice(idx, 1);
              }
              needsRestart = true;
            },
          },
          {
            title: 'Installing new plugins',
            skip: () => pluginsToAdd.length === 0,
            task: async () => {
              for (const plugin of pluginsToAdd) {
                if (await this.openclawDriver.pluginIsInstalled(plugin.id)) {
                  this.log(`  ${chalk.dim('~')} plugin: ${plugin.id} (already installed)`);
                  continue;
                }
                await this.openclawDriver.pluginInstall(plugin.spec);
                installedPlugins.push(plugin.id);
                await this.setupPlugin(plugin, true);
              }
              needsRestart = true;
            },
          },
          {
            title: 'Removing obsolete skills',
            skip: () => skillsToRemove.length === 0,
            task: async () => {
              for (const skill of skillsToRemove) {
                try {
                  await this.openclawDriver.skillRemove(skill);
                } catch {
                  /* may have been manually removed */
                }
                const idx = installedSkills.indexOf(skill);
                if (idx >= 0) installedSkills.splice(idx, 1);
              }
            },
          },
          {
            title: 'Updating skills',
            skip: () => skillsToUpdate.length === 0 && skillsToAdd.length === 0,
            task: async () => {
              for (const skillName of [...skillsToUpdate, ...skillsToAdd]) {
                const content = await registry.getLingerieSkillContent(lingerieId, skillName);
                await this.openclawDriver.skillCopyBundled(skillName, content);
                if (!installedSkills.includes(skillName)) {
                  installedSkills.push(skillName);
                }
              }
            },
          },
          {
            title: 'Updating config',
            skip: () => newStaticConfigs.length === 0 && !hasNewConfigPrefix,
            task: async () => {
              // Set new static configs
              for (const cfg of newStaticConfigs) {
                await this.openclawDriver.configSet(cfg.key, String(cfg.value));
                configKeys.push(cfg.key);
              }

              // Run interactive config setup if configPrefix is new
              if (hasNewConfigPrefix && latest.configSetup) {
                await this.runLingerieConfigSetup(latest);
                configKeys.push(latest.configSetup.configPrefix!);
              }

              needsRestart = true;
            },
          },
          {
            title: 'Restarting gateway',
            skip: () => !needsRestart,
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
          {
            title: 'Saving state',
            task: async () => {
              state.lingerie[lingerieId] = {
                package: lingerieId,
                version: latest.version,
                installedAt: new Date().toISOString(),
                applied: {
                  plugins: latest.plugins.map((p) => p.id),
                  installedPlugins,
                  configKeys,
                  skills: latest.skills,
                  installedSkills,
                },
              };
              await this.stateManager.save(state);
            },
          },
        ],
        { concurrent: false },
      );

      await tasks.run();

      await this.gitManager.commit(
        'feat',
        lingerieId,
        `lingerie upgrade v${entry.version} → v${latest.version}`,
      );

      this.log(`\n${chalk.green('✓')} Upgraded lingerie "${lingerieId}" to v${latest.version}.`);
    } catch (err) {
      if (snapshot) await this.gitManager.rollback(snapshot);
      throw err;
    } finally {
      await this.stateManager.unlock();
    }
  }

  /**
   * Run interactive configSetup prompts for new lingerie config.
   * Reuses the same prompting logic as BaseCommand.installLingerie.
   */
  private async runLingerieConfigSetup(uw: LingerieJson): Promise<void> {
    if (!uw.configSetup) return;

    const { input } = await import('@inquirer/prompts');
    const { configPrefix, params, properties } = uw.configSetup;
    if (!configPrefix) return;

    const hasParams = Object.keys(params).length > 0;
    const hasProperties = Object.keys(properties).length > 0;
    if (!hasParams && !hasProperties) return;

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
        let built = prop.build.replace('{value}', value);
        for (const paramId of prop.params) {
          built = built.replace(`{${paramId}}`, answers[paramId] ?? '');
        }
        built = built.replaceAll(/[&?]\w+=(?=&)/g, '');
        built = built.replaceAll(/[&?]\w+=$/g, '');
        built = built.replace('?&', '?');
        obj[key] = built;
      } else {
        obj[key] = value;
      }
    }

    await this.openclawDriver.configSet(configPrefix, JSON.stringify(obj));
  }
}
