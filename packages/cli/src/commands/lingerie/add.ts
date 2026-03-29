import { spawn } from 'node:child_process';
import { confirm, input, select } from '@inquirer/prompts';
import { Args, Flags } from '@oclif/core';
import chalk from 'chalk';
import { Listr } from 'listr2';
import { BaseCommand } from '#base.ts';
import type { LingerieJson, StateFile } from '#core/index.ts';
import { createRegistryProvider } from '#lib/registry.ts';

export default class LingerieAdd extends BaseCommand {
  static override summary = 'Install lingerie independently of a dress';

  static override examples = [
    '<%= config.bin %> lingerie add waclaw',
    '<%= config.bin %> lingerie add',
    '<%= config.bin %> lingerie add waclaw --dry-run',
  ];

  static override args = {
    id: Args.string({
      description: 'Lingerie ID to install',
      required: false,
    }),
  };

  static override flags = {
    ...BaseCommand.baseFlags,
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
    const { args, flags } = await this.parse(LingerieAdd);
    await this.loadConfig();

    const registry = createRegistryProvider(process.cwd(), this.clawtiquePaths.cache);
    const state = await this.stateManager.load();

    let lingerieId = args.id;

    // Interactive picker if no ID given
    if (!lingerieId) {
      const index = await registry.getIndex();
      const activeIds = new Set(Object.keys(state.lingerie ?? {}));
      const available = Object.entries(index.lingerie).filter(([id]) => !activeIds.has(id));

      if (available.length === 0) {
        this.error('No available lingerie. All lingerie may already be installed.');
      }

      lingerieId = await select({
        message: 'Choose lingerie to install',
        choices: available.map(([id, entry]) => ({
          name: `${entry.name} ${chalk.dim(`(${id})`)}`,
          value: id,
          description: entry.description || undefined,
        })),
      });
    }

    // Check if already installed
    if (state.lingerie?.[lingerieId]) {
      this.error(
        `Lingerie "${lingerieId}" is already installed.\nRun "clawtique lingerie" to see all lingerie.`,
      );
    }

    // Fetch definition
    let uw: LingerieJson;
    try {
      uw = await registry.getLingerieJson(lingerieId);
    } catch {
      this.error(`Lingerie "${lingerieId}" not found in the registry.`);
    }

    // Preview
    this.log(chalk.bold(`\nInstalling lingerie "${uw.name}":\n`));
    if (uw.description) {
      this.log(`  ${uw.description}\n`);
    }
    for (const plugin of uw.plugins) {
      const installed = await this.openclawDriver.pluginIsInstalled(plugin.id);
      if (installed) {
        this.log(`  ${chalk.dim('~')} plugin: ${plugin.id} (already installed)`);
      } else {
        this.log(`  ${chalk.green('+')} plugin: ${plugin.id}`);
      }
    }
    this.log('');

    if (flags['dry-run']) {
      this.log(chalk.yellow('Dry run — no changes applied.'));
      return;
    }

    // Verify openclaw is reachable
    const health = await this.openclawDriver.health();
    if (!health.ok) {
      this.error(
        `OpenClaw is not reachable.\n\n` +
          `  ${health.message || 'Could not connect to openclaw CLI.'}\n\n` +
          `Make sure openclaw is installed and accessible, then try again.`,
      );
    }

    if (!flags.yes) {
      const proceed = await confirm({ message: 'Proceed?', default: true });
      if (!proceed) {
        this.log('Aborted.');
        return;
      }
    }

    await this.stateManager.lock();
    const snapshot = await this.gitManager.snapshot();

    try {
      await this.installLingerie(lingerieId, uw, state);

      await this.gitManager.commit(
        'feat',
        lingerieId,
        'lingerie add',
        `plugins: ${uw.plugins.map((p) => p.id).join(', ')}`,
      );

      this.log(`\n${chalk.green('✓')} Lingerie "${uw.name}" installed.`);
      this.log(`  Run ${chalk.cyan('clawtique lingerie')} to see all lingerie.\n`);
    } catch (err) {
      if (snapshot) await this.gitManager.rollback(snapshot);
      throw err;
    } finally {
      await this.stateManager.unlock();
    }
  }

  private async installLingerie(
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
          this.error(`Lingerie plugin setup failed (exit code ${exitCode}).`);
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

    // Restart gateway if we installed plugins
    if (installedPlugins.length > 0) {
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
      },
    };
    await this.stateManager.save(state);
  }
}
