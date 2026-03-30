import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { confirm, select } from '@inquirer/prompts';
import { Args, Flags } from '@oclif/core';
import chalk from 'chalk';
import { Listr } from 'listr2';
import { BaseCommand } from '#base.ts';
import { removeSection, type StateFile } from '#core/index.ts';

export default class DressRemove extends BaseCommand {
  static override summary = 'Deactivate a dress and remove its config (data persists)';

  static override examples = [
    '<%= config.bin %> dress remove fitness-coach',
    '<%= config.bin %> dress remove fitness-coach --dry-run',
  ];

  static override args = {
    id: Args.string({
      description: 'Dress ID to remove',
      required: false,
    }),
  };

  static override flags = {
    ...BaseCommand.baseFlags,
    'dry-run': Flags.boolean({
      description: 'Show what would change without applying',
      default: false,
    }),
    force: Flags.boolean({
      description: 'Skip dependency checks',
      default: false,
    }),
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip confirmation',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(DressRemove);
    await this.loadConfig();

    const state = await this.stateManager.load();

    let dressId = args.id;

    // If no ID, prompt from active dresses
    if (!dressId) {
      const activeIds = Object.keys(state.dresses);
      if (activeIds.length === 0) {
        this.error('No active dresses to remove.\nRun "clawtique dress" to check.');
      }
      dressId = await select({
        message: 'Choose a dress to remove',
        choices: activeIds.map((id) => ({
          name: `${id} ${chalk.dim(`v${state.dresses[id]!.version}`)}`,
          value: id,
        })),
      });
    }

    const entry = this.stateManager.getDressEntry(state, dressId);

    if (!entry) {
      this.error(
        `Dress "${dressId}" is not active.\nRun "clawtique dress" to see available dresses.`,
      );
    }

    // Check for dependants
    const dependants = this.findDependants(state, dressId);
    if (dependants.length > 0 && !flags.force) {
      this.log(chalk.yellow(`\nWarning: The following dresses depend on "${dressId}":`));
      for (const dep of dependants) {
        this.log(`  - ${dep}`);
      }
      this.log('');
      this.error(`Remove dependants first, or use --force.`);
    }

    // Determine what needs to be removed vs retained
    const othersNeed = this.collectOthersNeeds(state, dressId);

    const cronsToRemove = entry.applied.crons;
    // Only remove plugins that clawtique actually installed (not pre-existing ones)
    const installedPluginSet = new Set(entry.applied.installedPlugins ?? []);
    const pluginsToRemove = entry.applied.plugins.filter(
      (p) => installedPluginSet.has(p) && !othersNeed.plugins.has(p),
    );
    const pluginsRetained = entry.applied.plugins.filter(
      (p) => !installedPluginSet.has(p) || othersNeed.plugins.has(p),
    );
    // Only remove skills that clawtique actually installed (not pre-existing ones)
    const installedSkillSet = new Set(entry.applied.installedSkills);
    const skillsToRemove = entry.applied.skills.filter(
      (s) => installedSkillSet.has(s) && !othersNeed.skills.has(s),
    );
    const skillsRetained = entry.applied.skills.filter(
      (s) => !installedSkillSet.has(s) || othersNeed.skills.has(s),
    );

    // Show what will happen
    this.log(chalk.bold(`\nRemoving dress "${dressId}":\n`));

    for (const c of cronsToRemove) {
      this.log(`  ${chalk.red('-')} cron: ${c.displayName}`);
    }
    for (const s of skillsToRemove) {
      this.log(`  ${chalk.red('-')} skill: ${s}`);
    }
    for (const s of skillsRetained) {
      const reason = !installedSkillSet.has(s)
        ? 'not installed by clawtique'
        : 'used by another dress';
      this.log(`  ${chalk.dim('~')} skill: ${s} ${chalk.dim(`(retained — ${reason})`)}`);
    }
    for (const p of pluginsToRemove) {
      this.log(`  ${chalk.red('-')} plugin: ${p}`);
    }
    for (const p of pluginsRetained) {
      const reason = !installedPluginSet.has(p)
        ? 'not installed by clawtique'
        : 'used by another dress';
      this.log(`  ${chalk.dim('~')} plugin: ${p} ${chalk.dim(`(retained — ${reason})`)}`);
    }
    if ((entry.applied.heartbeatSkills ?? []).length > 0) {
      this.log(
        `  ${chalk.red('-')} heartbeat skills: ${entry.applied.heartbeatSkills!.join(', ')}`,
      );
    }
    if ((entry.applied.userSkills ?? []).length > 0) {
      this.log(`  ${chalk.red('-')} user skills: ${entry.applied.userSkills!.join(', ')}`);
    }
    if (entry.applied.memorySections.length > 0) {
      for (const s of entry.applied.memorySections) {
        this.log(
          `  ${chalk.dim('~')} memory section "${s}" ${chalk.dim('(content preserved, markers removed)')}`,
        );
      }
    }
    for (const f of entry.applied.files) {
      this.log(`  ${chalk.red('-')} file: ${f}`);
    }
    if ((entry.applied.workspaceFiles ?? []).length > 0) {
      for (const w of entry.applied.workspaceFiles!) {
        this.log(`  ${chalk.dim('~')} workspace: ${w} ${chalk.dim('(preserved — user data)')}`);
      }
    }
    this.log('');

    if (flags['dry-run']) {
      this.log(chalk.yellow('Dry run — no changes applied.'));
      return;
    }

    // Verify openclaw is reachable before making any changes
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

    const workspaceFiles = entry.applied.workspaceFiles ?? [];
    let deleteWorkspace = false;
    if (workspaceFiles.length > 0 && !flags.yes) {
      deleteWorkspace = await confirm({
        message: 'Delete workspace files? (user data will be lost)',
        default: false,
      });
    }

    await this.stateManager.lock();
    const snapshot = await this.gitManager.snapshot();

    try {
      const tasks = new Listr(
        [
          {
            title: 'Removing crons',
            skip: () => cronsToRemove.length === 0,
            task: async () => {
              for (const cron of cronsToRemove) {
                try {
                  await this.openclawDriver.cronRemove(cron);
                } catch {
                  // Cron may have been manually removed
                }
              }
            },
          },
          {
            title: 'Removing plugins',
            skip: () => pluginsToRemove.length === 0,
            task: async () => {
              for (const plugin of pluginsToRemove) {
                try {
                  await this.openclawDriver.pluginUninstall(plugin);
                } catch {
                  // Plugin may have been manually removed
                }
              }
            },
          },
          {
            title: 'Removing skills',
            skip: () => skillsToRemove.length === 0,
            task: async () => {
              for (const skill of skillsToRemove) {
                try {
                  await this.openclawDriver.skillRemove(skill);
                } catch {
                  // Skill may have been manually removed
                }
              }
            },
          },
          {
            title: 'Stripping heartbeat rules',
            skip: () => (entry.applied.heartbeatSkills ?? []).length === 0,
            task: async () => {
              await this.stripHeartbeatRules(dressId);
            },
          },
          {
            title: 'Removing dress files',
            skip: () => entry.applied.files.length === 0,
            task: async () => {
              const { rm } = await import('node:fs/promises');
              for (const f of entry.applied.files) {
                if (existsSync(f)) {
                  await rm(f, { recursive: true });
                }
              }
              // Clean up empty dress directory
              const dressDir = join(this.openclawPaths.dresses, dressId);
              if (existsSync(dressDir)) {
                try {
                  const items = await readdir(dressDir);
                  if (items.length === 0) await rm(dressDir, { recursive: true });
                } catch {
                  /* ignore */
                }
              }
            },
          },
          {
            title: 'Removing workspace files',
            skip: () => !deleteWorkspace || workspaceFiles.length === 0,
            task: async () => {
              const { rm } = await import('node:fs/promises');
              const workspaceDir = join(this.openclawPaths.root, 'workspace');
              for (const w of workspaceFiles) {
                const fullPath = join(workspaceDir, w);
                if (existsSync(fullPath)) {
                  await rm(fullPath, { recursive: true });
                }
              }
            },
          },
          {
            title: 'Restarting gateway',
            skip: () => pluginsToRemove.length === 0,
            task: async () => {
              await this.openclawDriver.gatewayRestart();
            },
          },
          {
            title: 'Updating DRESSES.md',
            task: async () => {
              await this.rebuildDressesIndex(state, dressId);
            },
          },
          {
            title: 'Saving state',
            task: async () => {
              delete state.dresses[dressId];
              await this.stateManager.save(state);
            },
          },
        ],
        { concurrent: false },
      );

      await tasks.run();

      const body = [
        cronsToRemove.length > 0
          ? `removed crons: ${cronsToRemove.map((c) => c.qualifiedId).join(', ')}`
          : '',
        skillsToRemove.length > 0 ? `removed skills: ${skillsToRemove.join(', ')}` : '',
        skillsRetained.length > 0 ? `retained skills: ${skillsRetained.join(', ')}` : '',
        pluginsToRemove.length > 0 ? `removed plugins: ${pluginsToRemove.join(', ')}` : '',
        pluginsRetained.length > 0 ? `retained plugins: ${pluginsRetained.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      await this.gitManager.commit('revert', dressId, 'dress remove', body);

      this.log(`\n${chalk.green('✓')} Removed dress "${dressId}". Data preserved.`);
    } catch (err) {
      if (snapshot) await this.gitManager.rollback(snapshot);
      throw err;
    } finally {
      await this.stateManager.unlock();
    }
  }

  private findDependants(_state: StateFile, _dressId: string): string[] {
    return [];
  }

  private collectOthersNeeds(
    state: StateFile,
    excludeId: string,
  ): { plugins: Set<string>; skills: Set<string> } {
    const plugins = new Set<string>();
    const skills = new Set<string>();
    for (const [id, entry] of Object.entries(state.dresses)) {
      if (id === excludeId) continue;
      for (const p of entry.applied.plugins) plugins.add(p);
      for (const s of entry.applied.skills) skills.add(s);
    }
    // Lingerie-managed plugins are never removed by dress remove
    for (const entry of Object.values(state.lingerie ?? {})) {
      for (const p of entry.applied.plugins) plugins.add(p);
    }
    return { plugins, skills };
  }

  private async stripHeartbeatRules(dressId: string): Promise<void> {
    const heartbeatPath = this.openclawPaths.heartbeat;
    if (!existsSync(heartbeatPath)) return;
    const content = await readFile(heartbeatPath, 'utf-8');
    if (!content.includes(`clawtique:${dressId}`)) return;
    const cleaned = removeSection(dressId, content);
    await writeFile(heartbeatPath, cleaned);
  }

  private async rebuildDressesIndex(state: StateFile, excludeId: string): Promise<void> {
    // Collect user skills from remaining dresses
    const allUserSkills: { skillId: string; dressId: string }[] = [];
    for (const [id, entry] of Object.entries(state.dresses)) {
      if (id === excludeId) continue;
      for (const skillId of entry.applied.userSkills ?? []) {
        allUserSkills.push({ skillId, dressId: id });
      }
    }

    const lines = ['# Active Dresses\n'];
    lines.push(
      'You MUST read each DRESSCODE.md listed below. They define your skills, schedules, daily memory sections, and workspace files.\n',
    );

    if (allUserSkills.length > 0) {
      lines.push('## User Skills');
      lines.push('');
      lines.push(
        "When the user's request matches one of these, you MUST read the linked skill file and follow its instructions before taking any action.",
      );
      lines.push('');
      for (const { skillId, dressId } of allUserSkills) {
        lines.push(`- **${skillId}** (${dressId})`);
        lines.push(`  → \`~/.openclaw/skills/${skillId}/SKILL.md\``);
      }
      lines.push('');
    }

    for (const [id] of Object.entries(state.dresses)) {
      if (id === excludeId) continue;
      lines.push(`## ${id}`);
      lines.push(`DRESSCODE: ~/.openclaw/workspace/dresses/${id}/DRESSCODE.md\n`);
    }

    const remainingDresses = Object.keys(state.dresses).filter((id) => id !== excludeId);
    if (remainingDresses.length === 0) {
      lines.push('No dresses active.\n');
    }

    await writeFile(this.openclawPaths.dressesIndex, lines.join('\n'));
  }
}
