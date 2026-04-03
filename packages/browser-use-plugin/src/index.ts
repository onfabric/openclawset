import { BrowserUse } from 'browser-use-sdk';
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { configSchema, PLUGIN_ID, parseConfig } from './lib/config';
import { registerGetStatusTool } from './tools/get-status';
import { registerRunTaskTool } from './tools/run-task';
import { registerStopSessionTool } from './tools/stop-session';

export default definePluginEntry({
  id: PLUGIN_ID,
  name: 'Browser Use Agent',
  description: 'Delegate browser tasks to Browser Use cloud AI agent',
  configSchema,
  register(api) {
    const cfg = parseConfig(api.pluginConfig);

    const missing: string[] = [];
    if (!cfg.apiKey) missing.push('apiKey');
    if (!cfg.profileId) missing.push('profileId');
    if (!cfg.proxyCountryCode) missing.push('proxyCountryCode');

    if (missing.length > 0) {
      api.logger.warn(
        `browser-use-agent: missing ${missing.join(', ')} in cdpUrl. ` +
          'Install the browser-use lingerie first: clawtique lingerie add browser-use',
      );
      return;
    }

    const client = new BrowserUse({ apiKey: cfg.apiKey });

    registerRunTaskTool(api, client, cfg.profileId, cfg.proxyCountryCode);
    registerGetStatusTool(api, client);
    registerStopSessionTool(api, client);

    api.logger.info(
      `browser-use-agent: registered tools (profile: ${cfg.profileId}, proxy: ${cfg.proxyCountryCode})`,
    );
  },
});
