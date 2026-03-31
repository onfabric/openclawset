import { Type } from '@sinclair/typebox';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry';
import type { AgentMailClient } from '../lib/client';
import { registerTool } from '../lib/register-tool';

const DEFAULT_LIMIT = 10;

const ListEmailsParametersSchema = Type.Object({
  limit: Type.Optional(
    Type.Number({
      description: 'Maximum number of emails to return.',
      minimum: 1,
      maximum: 50,
      default: DEFAULT_LIMIT,
    }),
  ),
  after: Type.Optional(
    Type.String({
      description: 'Only return emails received after this ISO 8601 timestamp.',
    }),
  ),
});

export function registerListEmailsTool(
  api: OpenClawPluginApi,
  client: AgentMailClient,
  inboxId: string,
): void {
  registerTool(api, {
    name: 'email_list',
    label: 'List Emails',
    description: 'List received emails in your inbox.',
    parameters: ListEmailsParametersSchema,
    async execute(_id, params) {
      api.logger.info('agentmail: listing emails...');

      try {
        const result = await client.listMessages(inboxId, {
          limit: params.limit || DEFAULT_LIMIT,
          after: params.after,
        });

        const text =
          result.items.length === 0
            ? 'No emails found.'
            : result.items
                .map((msg, i) => {
                  const date = new Date(msg.timestamp).toLocaleString();
                  const snippet = msg.preview?.slice(0, 100) ?? '';
                  return `${i + 1}. From: ${msg.from}\n   Subject: ${msg.subject}\n   Date: ${date}\n   Message ID: ${msg.message_id}\n   Preview: ${snippet}`;
                })
                .join('\n\n');

        api.logger.info(`agentmail: found ${result.items.length} emails`);

        return {
          content: [{ type: 'text' as const, text }],
          details: {
            emails: result.items,
          },
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error listing emails: ${String(err)}` }],
          details: { error: String(err) },
        };
      }
    },
  });
}
