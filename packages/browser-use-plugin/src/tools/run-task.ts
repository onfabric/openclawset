import { Type } from '@sinclair/typebox';
import type { BrowserUse } from 'browser-use-sdk';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry';
import { registerTool } from '../lib/register-tool';
import { getSession, setSession } from '../lib/session-store';

const RunTaskParametersSchema = Type.Object({
  task: Type.String({
    description:
      'A detailed description of the browser task for the AI agent to perform. ' +
      'Be specific: include URLs, what to click, what data to extract, etc.',
  }),
  session_id: Type.Optional(
    Type.String({
      description:
        'Reuse an existing session for follow-up tasks. ' +
        'The browser state (page, cookies, tabs) persists from the previous task.',
    }),
  ),
  timeout_minutes: Type.Optional(
    Type.Number({
      description: 'Maximum time to wait for the task to complete, in minutes.',
      minimum: 1,
      maximum: 30,
      default: 10,
    }),
  ),
});

export function registerRunTaskTool(
  api: OpenClawPluginApi,
  client: BrowserUse,
  profileId: string,
  proxyCountryCode: string,
): void {
  registerTool(api, {
    name: 'browser_agent_run',
    label: 'Browser Agent — Run Task',
    description:
      'Delegate a browser task to the Browser Use cloud AI agent. ' +
      'The agent operates a real browser: it can navigate, click, fill forms, extract data, and handle CAPTCHAs. ' +
      'This call blocks until the task completes (may take several minutes). ' +
      'Returns the agent output. Pass a session_id to run follow-up tasks in the same browser session.',
    parameters: RunTaskParametersSchema,
    async execute(_id, params) {
      const isFollowUp = !!params.session_id;
      const timeoutMs = (params.timeout_minutes || 10) * 60 * 1000;

      api.logger.info(
        isFollowUp
          ? `browser-use-agent: follow-up task on session ${params.session_id}`
          : 'browser-use-agent: starting new browser agent task...',
      );

      try {
        const result = await client.run(params.task, {
          sessionId: params.session_id ?? undefined,
          sessionSettings: !params.session_id
            ? { profileId, proxyCountryCode: proxyCountryCode as 'uk', enableRecording: false }
            : undefined,
          timeout: timeoutMs,
        });

        const output =
          typeof result.output === 'string'
            ? result.output
            : (JSON.stringify(result.output) ?? '(no output)');
        const status = result.status ?? 'unknown';
        const sessionId = result.sessionId;

        // Track the session for cleanup
        if (!getSession(sessionId)) {
          setSession({
            sessionId,
            liveUrl: '',
            createdAt: new Date().toISOString(),
            lastTaskOutput: null,
          });
        }
        const stored = getSession(sessionId);
        if (stored) stored.lastTaskOutput = output;

        api.logger.info(`browser-use-agent: task ${status} (session: ${sessionId})`);

        return {
          content: [
            {
              type: 'text' as const,
              text: [
                `Browser agent task ${status}.`,
                `Session ID: ${sessionId}`,
                result.isSuccess === false
                  ? 'Note: the agent reported the task was NOT successful.'
                  : '',
                '',
                output,
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
          details: {
            sessionId,
            taskId: result.id,
            status,
            output,
            isSuccess: result.isSuccess,
          },
        };
      } catch (err) {
        const errMsg = String(err);
        const isTimeout = errMsg.includes('timeout') || errMsg.includes('Timeout');

        api.logger.error(`browser-use-agent: ${isTimeout ? 'timed out' : 'error'}: ${errMsg}`);

        return {
          content: [
            {
              type: 'text' as const,
              text: isTimeout
                ? `Browser agent task timed out after ${params.timeout_minutes || 10} minutes. ` +
                  'The session may still be active — use browser_agent_stop to clean up.'
                : `Browser agent error: ${errMsg}`,
            },
          ],
          details: { error: errMsg },
        };
      }
    },
  });
}
