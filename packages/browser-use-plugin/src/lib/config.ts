import type { OpenClawPluginConfigSchema } from 'openclaw/plugin-sdk';
import type { CountryCode } from './browser-use';

/**
 * The ID of the plugin as declared in the `openclaw.plugin.json` file.
 */
export const PLUGIN_ID = 'browser-use-agent';

export type BrowserUsePluginConfig = {
  apiKey: string;
  profileId: string;
  proxyCountryCode: CountryCode;
};

export function parseConfig(raw: unknown): BrowserUsePluginConfig {
  const cfg =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  return {
    apiKey: cfg.apiKey as string,
    profileId: cfg.profileId as string,
    proxyCountryCode: cfg.proxyCountryCode as CountryCode,
  };
}

export const configSchema: OpenClawPluginConfigSchema = {
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      apiKey: { type: 'string', description: 'Browser Use Cloud API key (bu_...)' },
      profileId: { type: 'string', description: 'Browser profile to use' },
      proxyCountryCode: { type: 'string', description: 'From which country to run the browser' },
    },
  },
  parse: parseConfig,
};
