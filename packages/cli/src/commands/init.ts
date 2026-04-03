import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { confirm, input, search } from '@inquirer/prompts';
import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import type { ClawtiqueConfig, StateFile } from '#core/index.ts';
import { ensureDressesReference, INITIAL_DRESSES_MD } from '#core/index.ts';
import { GitManager } from '#lib/git.ts';
import { LocalOpenClawDriver } from '#lib/openclaw.ts';
import { getClawtiquePaths, getOpenClawPaths } from '#lib/paths.ts';

export default class Init extends Command {
  static override summary = 'Initialize clawtique for an OpenClaw instance';

  static override examples = [
    '<%= config.bin %> init',
    '<%= config.bin %> init --openclaw-dir ~/.openclaw',
  ];

  static override flags = {
    'openclaw-dir': Flags.string({
      char: 'o',
      description: 'Path to the OpenClaw directory',
    }),
    'clawtique-dir': Flags.string({
      description: 'Path to clawtique directory (default: ~/.clawtique)',
      env: 'CLAWTIQUE_DIR',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Init);

    const paths = getClawtiquePaths(flags['clawtique-dir']);

    // Check if already initialized
    if (existsSync(paths.config)) {
      const overwrite = await confirm({
        message: 'Clawtique is already initialized. Re-initialize?',
        default: false,
      });
      if (!overwrite) {
        this.log('Aborted.');
        return;
      }
    }

    // Get openclaw directory
    let openclawDir = flags['openclaw-dir'];
    if (!openclawDir) {
      openclawDir = await input({
        message: 'Where is your OpenClaw directory?',
        default: join(process.env.HOME ?? '~', '.openclaw'),
      });
    }

    // Verify openclaw directory
    const ocPaths = getOpenClawPaths(openclawDir);
    if (!existsSync(ocPaths.config)) {
      this.warn(`No openclaw.json found at ${ocPaths.config}`);
      const proceed = await confirm({
        message: 'Continue anyway?',
        default: false,
      });
      if (!proceed) {
        this.log('Aborted.');
        return;
      }
    }

    // Get user name
    const userName = await input({
      message: "What's your name?",
    });

    // Timezone
    const gmtOffset = (tz: string): string =>
      new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' })
        .formatToParts(new Date())
        .find((p) => p.type === 'timeZoneName')!.value;

    const sorted = Intl.supportedValuesOf('timeZone');
    const pivot = sorted.indexOf('Europe/London');
    const allTimezones = pivot > 0 ? [...sorted.slice(pivot), ...sorted.slice(0, pivot)] : sorted;

    const timezone = await search({
      message: 'Search for your timezone',
      source: (term) => {
        const q = (term ?? '').toLowerCase();
        if (!q) return allTimezones.map((v) => ({ name: `${v} (${gmtOffset(v)})`, value: v }));
        return allTimezones
          .filter((v) => v.toLowerCase().includes(q))
          .map((v) => ({ name: `${v} (${gmtOffset(v)})`, value: v }));
      },
    });
    this.log(`  ${chalk.dim(`Using ${timezone} (${gmtOffset(timezone)})`)}`);

    // Create directory structure (mkdir recursive is idempotent)
    await mkdir(paths.root, { recursive: true });
    await mkdir(paths.dresses, { recursive: true });
    const ocWorkspace = join(openclawDir, 'workspace');
    await mkdir(join(ocWorkspace, 'dresses'), { recursive: true });

    // Copy initial DRESSES.md template (only if not already present)
    const dressesIndexPath = join(ocWorkspace, 'DRESSES.md');
    if (!existsSync(dressesIndexPath)) {
      await writeFile(dressesIndexPath, INITIAL_DRESSES_MD);
    }

    // Ensure AGENTS.md references DRESSES.md (idempotent — skips if marker present)
    await ensureDressesReference(ocWorkspace);

    // Write a clean HEARTBEAT.md only on first init (replace the noisy template).
    // On re-init, preserve the existing heartbeat so dress-contributed items aren't lost.
    if (!existsSync(paths.config)) {
      await writeFile(
        ocPaths.heartbeat,
        [
          '# Heartbeat checklist',
          '',
          '- Occasionally (not every heartbeat), check what the user has been up to recently.',
          '  If you spot something interesting or relevant, check in with the user to remind',
          '  them that you are there to help.',
          '',
        ].join('\n'),
      );
    }

    // Ensure tools.profile is 'full' so all plugins/tools are available
    if (existsSync(ocPaths.config)) {
      const oc = new LocalOpenClawDriver();
      await oc.configSet('tools.profile', 'full');
      this.log(`  ${chalk.dim('Set tools.profile to "full" in openclaw.json')}`);

      // Set heartbeat interval to 1 hour (default is 30m)
      await oc.configSet('agents.defaults.heartbeat.every', '60m');
      this.log(`  ${chalk.dim('Set heartbeat interval to 60m')}`);
    }

    // Seed USER.md with name and timezone so the agent always knows them
    const userMdPath = join(ocWorkspace, 'USER.md');
    const nameLine = `- **Name:** ${userName}`;
    const tzLine = `- **Timezone:** ${timezone} (${gmtOffset(timezone)})`;
    if (existsSync(userMdPath)) {
      let existing = await readFile(userMdPath, 'utf-8');
      if (existing.includes('**Name:**')) {
        existing = existing.replace(/- \*\*Name:\*\* .*/g, nameLine);
      } else {
        existing = `${existing.trimEnd()}\n${nameLine}`;
      }
      if (existing.includes('**Timezone:**')) {
        existing = existing.replace(/- \*\*Timezone:\*\* .*/g, tzLine);
      } else {
        existing = `${existing.trimEnd()}\n${tzLine}`;
      }
      await writeFile(userMdPath, `${existing.trimEnd()}\n`);
    } else {
      await writeFile(userMdPath, `# User\n\n${nameLine}\n${tzLine}\n`);
    }

    // Write config
    const config: ClawtiqueConfig = {
      openclawDir,
      timezone,
      version: '0.1.0',
      user: { name: userName },
    };
    await writeFile(paths.config, `${JSON.stringify(config, null, 2)}\n`);

    // Write initial state (preserve existing entries on re-init)
    let state: StateFile = {
      version: 1,
      serial: 0,
      openclawDir,
      dresses: {},
      lingerie: {},
      personality: null,
    };
    if (existsSync(paths.state)) {
      const existing: StateFile = JSON.parse(await readFile(paths.state, 'utf-8'));
      state = {
        ...state,
        dresses: existing.dresses,
        lingerie: existing.lingerie,
        personality: existing.personality,
        serial: existing.serial,
      };
    }
    await writeFile(paths.state, `${JSON.stringify(state, null, 2)}\n`);

    // Initialize git repo (idempotent — skips if .git exists)
    const git = new GitManager(paths.root);
    await git.init();
    await git.commit('feat', 'clawtique', 'initialize clawtique');

    this.log('');
    this.log(`${chalk.green('✓')} Initialized clawtique at ${chalk.cyan(paths.root)}`);
    this.log(`${chalk.green('✓')} OpenClaw directory: ${chalk.cyan(openclawDir)}`);
    this.log(`${chalk.green('✓')} Git repo initialized`);
    this.log('');
    this.log('Ready. Next steps:');
    this.log(`  1. ${chalk.cyan('clawtique personality set')} <id>  — set up your personality`);
    this.log(`  2. ${chalk.cyan('clawtique lingerie add')} <id>     — add lingerie`);
    this.log(`  3. ${chalk.cyan('clawtique dress add')} <id>        — add a dress`);
  }
}
