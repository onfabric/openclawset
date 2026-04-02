import type { OpenClawPluginConfigSchema } from 'openclaw/plugin-sdk';

export const PLUGIN_ID = 'browser-use-agent';

export type BrowserUsePluginConfig = {
  apiKey: string;
  profileId: string;
  proxyCountryCode: string;
};

export function parseConfig(_raw: unknown): BrowserUsePluginConfig {
  // The plugin gets its apiKey, profileId, and proxyCountryCode from the
  // browser-use CDP profile's cdpUrl (stored at browser.profiles.browser-use.cdpUrl
  // in openclaw.json). This avoids prompting the user twice — the lingerie setup
  // already collects them.
  return resolveFromCdpUrl();
}

function resolveFromCdpUrl(): BrowserUsePluginConfig {
  try {
    const fs = require('node:fs') as typeof import('node:fs');
    const os = require('node:os') as typeof import('node:os');
    const path = require('node:path') as typeof import('node:path');

    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    const cdpUrl: string | undefined =
      raw?.browser?.profiles?.['browser-use']?.cdpUrl;

    if (!cdpUrl) return { apiKey: '', profileId: '', proxyCountryCode: '' };

    const url = new URL(cdpUrl.replace('wss://', 'https://'));
    return {
      apiKey: url.searchParams.get('apiKey') ?? '',
      profileId: url.searchParams.get('profileId') ?? '',
      proxyCountryCode: url.searchParams.get('proxyCountryCode') ?? '',
    };
  } catch {
    return { apiKey: '', profileId: '', proxyCountryCode: '' };
  }
}

export const configSchema: OpenClawPluginConfigSchema = {
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {},
  },
  parse: parseConfig,
};
