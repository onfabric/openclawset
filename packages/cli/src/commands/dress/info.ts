import { Args } from '@oclif/core';
import { BaseCommand } from '#base.ts';
import { createRegistryProvider } from '#lib/registry.ts';

export default class DressInfo extends BaseCommand {
  static override summary = 'Show dress definition as JSON (for automation)';

  static override description =
    'Fetches the full dress definition from the registry and outputs it as JSON. ' +
    'Use this to discover what --schedules and --params to pass to `dress add`.';

  static override examples = ['<%= config.bin %> dress info fitness-coach'];

  static override args = {
    id: Args.string({
      description: 'Dress ID from the registry',
      required: true,
    }),
  };

  static override flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(DressInfo);
    await this.loadConfig();

    const registry = createRegistryProvider(process.cwd(), this.clawtiquePaths.cache);

    let dress;
    try {
      dress = await registry.getDressJson(args.id);
    } catch {
      this.error(`Dress "${args.id}" not found in the registry.`);
    }

    // Build a clean output with the info an agent needs
    const output = {
      id: dress.id,
      name: dress.name,
      version: dress.version,
      description: dress.description,
      requires: {
        plugins: dress.requires.plugins.map((p) => ({
          id: p.id,
          spec: p.spec,
          setupCommand: p.setupCommand,
          setupNotes: p.setupNotes,
        })),
        lingerie: dress.requires.lingerie,
        dresses: dress.requires.dresses,
        optionalDresses: dress.requires.optionalDresses,
      },
      crons: dress.crons.map((c) => ({
        id: c.id,
        name: c.name,
        channel: c.channel,
        defaults: c.defaults,
      })),
      skills: Object.fromEntries(
        Object.entries(dress.skills).map(([id, skill]) => [
          id,
          {
            source: skill.source,
            trigger: skill.trigger,
            params: Object.fromEntries(
              Object.entries(skill.params).map(([paramName, paramDef]) => [
                paramName,
                {
                  type: paramDef.type,
                  default: paramDef.default,
                  description: paramDef.description,
                },
              ]),
            ),
          },
        ]),
      ),
      secrets: dress.secrets,
      dailyMemorySection: dress.dailyMemorySection,
      workspace: dress.workspace,
    };

    this.log(JSON.stringify(output, null, 2));
  }
}
