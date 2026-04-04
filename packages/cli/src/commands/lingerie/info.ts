import { Args } from '@oclif/core';
import { BaseCommand } from '#base.ts';
import type { LingerieJson } from '#core/index.ts';
import { createRegistryProvider } from '#lib/registry.ts';

export default class LingerieInfo extends BaseCommand {
  static override summary = 'Show lingerie definition as JSON (for automation)';

  static override description =
    'Fetches the full lingerie definition from the registry and outputs it as JSON. ' +
    'Use this to discover what --config values to pass to `lingerie add` or `lingerie update`.';

  static override examples = ['<%= config.bin %> lingerie info waclaw'];

  static override args = {
    id: Args.string({
      description: 'Lingerie ID from the registry',
      required: true,
    }),
  };

  static override flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(LingerieInfo);
    await this.loadConfig();

    const registry = createRegistryProvider(process.cwd(), this.clawtiquePaths.cache);

    let uw: LingerieJson;
    try {
      uw = await registry.getLingerieJson(args.id);
    } catch {
      this.error(`Lingerie "${args.id}" not found in the registry.`);
    }

    const output = {
      id: uw.id,
      name: uw.name,
      version: uw.version,
      description: uw.description,
      plugins: uw.plugins.map((p) => ({
        id: p.id,
        spec: p.spec,
        setupCommand: p.setupCommand,
        setupNotes: p.setupNotes,
      })),
      configSetup: uw.configSetup
        ? {
            configs: uw.configSetup.configs,
            configPrefix: uw.configSetup.configPrefix,
            params: uw.configSetup.params,
            properties: uw.configSetup.properties,
          }
        : null,
      skills: uw.skills,
      resources: uw.resources,
      toolsSection: uw.toolsSection ?? null,
    };

    this.log(JSON.stringify(output, null, 2));
  }
}
