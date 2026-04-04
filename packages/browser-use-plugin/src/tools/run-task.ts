import { Type } from '@sinclair/typebox';
import type { BrowserUse } from 'browser-use-sdk';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry';
import type { CountryCode } from '../lib/browser-use';
import { registerTool } from '../lib/register-tool';
import { getSession, setSession } from '../lib/session-store';

const SECONDS_TO_MILLISECONDS = 1000;
const MINUTES_TO_SECONDS = 60;
const DEFAULT_TASK_TIMEOUT_MINUTES = 5;
const DEFAULT_TIMEOUT_MS =
  DEFAULT_TASK_TIMEOUT_MINUTES * MINUTES_TO_SECONDS * SECONDS_TO_MILLISECONDS;

const RunTaskParametersSchema = Type.Object({
  task: Type.String({
    description:
      'A detailed description of the browser task for the AI agent to perform. ' +
      'Be specific: include URLs, what to click, what data to extract, etc.',
  }),
  session_id: Type.Optional(
    Type.String({
      description:
        'An existing session ID to continue a previous browser session (follow-up task). ' +
        'The browser state (page, cookies, tabs) is preserved from the prior task. ' +
        'If omitted, a new session is created.',
    }),
  ),
});

export function registerRunTaskTool(
  api: OpenClawPluginApi,
  client: BrowserUse,
  profileId: string,
  proxyCountryCode: CountryCode,
): void {
  registerTool(api, {
    name: 'browser_agent_run',
    label: 'Browser Agent — Run Task',
    description:
      'Delegate a browser task to the Browser Use Agent. ' +
      'The agent operates a real browser: it can navigate, click, fill forms, extract data, and handle CAPTCHAs. ' +
      'This call blocks until the task completes (may take several minutes). ' +
      'Returns the agent output.',
    parameters: RunTaskParametersSchema,
    async execute(_id, params) {
      api.logger.info(
        params.session_id
          ? `buclaw: continuing browser task on session ${params.session_id}...`
          : 'buclaw: starting new browser agent task...',
      );

      try {
        const sessionId =
          params.session_id ?? (await client.sessions.create({ profileId, proxyCountryCode })).id;

        const {
          id: taskId,
          output: taskOutput,
          status: taskStatus,
          isSuccess: taskIsSuccess,
          createdAt: taskCreatedAt,
        } = await client.run(params.task, {
          sessionId,
          timeout: DEFAULT_TIMEOUT_MS,
        });

        const existingSession = getSession(sessionId);
        if (!existingSession) {
          setSession({
            sessionId,
            createdAt: taskCreatedAt,
          });
        }

        api.logger.info(`buclaw: task ${taskStatus} (session: ${sessionId})`);

        return {
          content: [
            {
              type: 'text' as const,
              text: [
                `Browser agent task ${taskStatus}.`,
                `Session ID: ${sessionId}`,
                taskIsSuccess === false
                  ? 'Note: the agent reported the task was NOT successful.'
                  : '',
                '',
                taskOutput,
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
          details: {
            sessionId,
            taskId,
            status: taskStatus,
            output: taskOutput,
            isSuccess: taskIsSuccess,
          },
        };
      } catch (err) {
        const errMsg = String(err);
        const isTimeout = errMsg.includes('timeout') || errMsg.includes('Timeout');

        api.logger.error(`buclaw: ${isTimeout ? 'timed out' : 'error'}: ${errMsg}`);

        return {
          content: [
            {
              type: 'text' as const,
              text: isTimeout
                ? `Browser agent task timed out after ${DEFAULT_TASK_TIMEOUT_MINUTES} minutes. ` +
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
