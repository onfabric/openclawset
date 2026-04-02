import { Type } from '@sinclair/typebox';
import type { BrowserUse } from 'browser-use-sdk';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry';
import { registerTool } from '../lib/register-tool';
import { listSessions, removeSession } from '../lib/session-store';

const StopSessionParametersSchema = Type.Object({
  session_id: Type.Optional(
    Type.String({
      description:
        'The session ID to stop. If omitted, stops all active sessions tracked by this plugin.',
    }),
  ),
});

export function registerStopSessionTool(
  api: OpenClawPluginApi,
  client: BrowserUse,
): void {
  registerTool(api, {
    name: 'browser_agent_stop',
    label: 'Browser Agent — Stop Session',
    description:
      'Stop and clean up a Browser Use session. ' +
      'Always call this when you are done with a browser agent session to free resources. ' +
      'If no session_id is provided, stops all active sessions.',
    parameters: StopSessionParametersSchema,
    async execute(_id, params) {
      const sessionsToStop = params.session_id
        ? [params.session_id]
        : listSessions().map((s) => s.sessionId);

      if (sessionsToStop.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No active sessions to stop.' }],
          details: { stopped: [] },
        };
      }

      const results: Array<{ sessionId: string; success: boolean; error?: string }> = [];

      for (const sessionId of sessionsToStop) {
        try {
          await client.sessions.stop(sessionId);
          removeSession(sessionId);
          results.push({ sessionId, success: true });
          api.logger.info(`browser-use-agent: session ${sessionId} stopped`);
        } catch (err) {
          removeSession(sessionId);
          results.push({ sessionId, success: false, error: String(err) });
          api.logger.warn(
            `browser-use-agent: error stopping session ${sessionId}: ${String(err)}`,
          );
        }
      }

      const summary = results
        .map((r) =>
          r.success
            ? `Session ${r.sessionId}: stopped`
            : `Session ${r.sessionId}: error (${r.error})`,
        )
        .join('\n');

      return {
        content: [{ type: 'text' as const, text: summary }],
        details: { stopped: results },
      };
    },
  });
}
