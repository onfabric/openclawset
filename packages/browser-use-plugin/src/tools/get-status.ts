import { Type } from '@sinclair/typebox';
import type { BrowserUse } from 'browser-use-sdk';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry';
import { registerTool } from '../lib/register-tool';

const GetStatusParametersSchema = Type.Object({
  session_id: Type.String({
    description: 'The session ID to check.',
  }),
});

export function registerGetStatusTool(
  api: OpenClawPluginApi,
  client: BrowserUse,
): void {
  registerTool(api, {
    name: 'browser_agent_status',
    label: 'Browser Agent — Session Status',
    description:
      'Check the current status of a Browser Use session. ' +
      'Returns status (active/stopped) and task details.',
    parameters: GetStatusParametersSchema,
    async execute(_id, params) {
      try {
        const session = await client.sessions.get(params.session_id);

        const status = session.status ?? 'unknown';

        api.logger.info(
          `browser-use-agent: session ${params.session_id} status: ${status}`,
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: [
                `Session: ${params.session_id}`,
                `Status: ${status}`,
                session.liveUrl ? `Live URL: ${session.liveUrl}` : '',
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
          details: { sessionId: params.session_id, status, session },
        };
      } catch (err) {
        api.logger.error(
          `browser-use-agent: error checking status: ${String(err)}`,
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error checking session status: ${String(err)}`,
            },
          ],
          details: { error: String(err) },
        };
      }
    },
  });
}
