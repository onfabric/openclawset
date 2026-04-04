import { Args, Flags } from '@oclif/core';
import chalk from 'chalk';
import { BaseCommand } from '#base.ts';
import DressUpdate from '#commands/dress/update.ts';
import type { DressJson } from '#core/index.ts';
import { parseSkillMeta, type SkillMeta } from '#lib/compile.ts';
import { createRegistryProvider, type RegistryProvider } from '#lib/registry.ts';

export default class DressParams extends BaseCommand {
  static override summary = 'View or update params for an active dress';

  static override examples = [
    '<%= config.bin %> dress params journaling-companion',
    '<%= config.bin %> dress params tech-bro-digest --set tech-bro-digest.sources="Hacker News, Reddit"',
  ];

  static override args = {
    id: Args.string({
      description: 'Dress ID',
      required: true,
    }),
  };

  static override flags = {
    ...BaseCommand.baseFlags,
    set: Flags.string({
      description: 'Set a param (skill.key=value)',
      multiple: true,
    }),
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(DressParams);
    await this.loadConfig();

    const state = await this.stateManager.load();
    const entry = this.stateManager.getDressEntry(state, args.id);

    if (!entry) {
      this.error(`Dress "${args.id}" is not active.`);
    }

    // View mode
    if (!flags.set || flags.set.length === 0) {
      if (flags.json) {
        this.log(JSON.stringify(entry.params, null, 2));
        return;
      }

      const paramEntries = Object.entries(entry.params);
      if (paramEntries.length === 0) {
        this.log(`\nDress "${args.id}" has no params.\n`);
        return;
      }

      // Try to fetch dress + skill metadata for richer display
      let dress: DressJson | undefined;
      let registry: RegistryProvider | undefined;
      const skillMetaMap = new Map<string, SkillMeta>();
      try {
        registry = createRegistryProvider(process.cwd(), this.clawtiquePaths.cache);
        dress = await registry.getDressJson(args.id);
        for (const [skillId, skillDef] of Object.entries(dress.skills)) {
          if (skillDef.source === 'clawhub') continue;
          try {
            const content = await registry.getSkillContent(args.id, skillId);
            const meta = parseSkillMeta(content);
            if (meta) skillMetaMap.set(skillId, meta);
          } catch {
            // skip if skill content unavailable
          }
        }
      } catch {
        // Fall back to raw display if registry unavailable
      }

      this.log(`\n${chalk.bold(args.id)} params:\n`);
      for (const [skillId, skillParams] of paramEntries) {
        const paramValues = Object.entries(skillParams as Record<string, unknown>);
        if (paramValues.length === 0) continue;
        const meta = skillMetaMap.get(skillId);
        if (meta) {
          this.log(`  ${chalk.bold(meta.name)} ${chalk.dim(`(${skillId})`)}`);
          this.log(`  ${chalk.dim(meta.description)}`);
        } else {
          this.log(`  ${chalk.dim(skillId)}:`);
        }
        const skillDef = dress?.skills[skillId];
        for (const [key, value] of paramValues) {
          const paramDef = skillDef?.params[key];
          const paramInfo = paramDef
            ? ` ${chalk.dim(`(${paramDef.type}, default: ${JSON.stringify(paramDef.default)})`)}`
            : '';
          this.log(`    ${key}: ${chalk.yellow(JSON.stringify(value))}${paramInfo}`);
          if (paramDef?.description) {
            this.log(`      ${chalk.dim(paramDef.description)}`);
          }
        }
        this.log('');
      }
      return;
    }

    // Update mode — convert --set syntax to JSON and delegate to dress update
    const updates: Record<string, Record<string, unknown>> = {};
    for (const s of flags.set) {
      const eqIdx = s.indexOf('=');
      if (eqIdx === -1) {
        this.error(`Invalid param format: "${s}". Use skill.key=value.`);
      }
      const fullKey = s.slice(0, eqIdx);
      const rawValue = s.slice(eqIdx + 1);
      const dotIdx = fullKey.indexOf('.');
      if (dotIdx === -1) {
        this.error(
          `Invalid param key: "${fullKey}". Use skill.key format (e.g. tech-bro-digest.sources).`,
        );
      }
      const skillId = fullKey.slice(0, dotIdx);
      const paramKey = fullKey.slice(dotIdx + 1);

      let value: unknown;
      try {
        value = JSON.parse(rawValue);
      } catch {
        if (rawValue.includes(',')) {
          value = rawValue.split(',').map((s) => s.trim());
        } else {
          value = rawValue;
        }
      }

      if (!updates[skillId]) updates[skillId] = {};
      updates[skillId][paramKey] = value;
    }

    this.log(
      chalk.dim(
        `\nDelegating to: clawtique dress update ${args.id} --params '${JSON.stringify(updates)}' --yes\n`,
      ),
    );

    await DressUpdate.run([args.id, '--params', JSON.stringify(updates), '--yes']);
  }
}
