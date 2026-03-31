import { Type } from '@sinclair/typebox';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry';
import type { AgentMailClient } from '../lib/client';
import { registerTool } from '../lib/register-tool';

const ReadEmailParametersSchema = Type.Object({
  message_id: Type.String({
    description: 'The message ID of the email to read (from email_list results).',
  }),
});

export function registerReadEmailTool(
  api: OpenClawPluginApi,
  client: AgentMailClient,
  inboxId: string,
): void {
  registerTool(api, {
    name: 'email_read',
    label: 'Read Email',
    description: 'Read the full content of a specific email.',
    parameters: ReadEmailParametersSchema,
    async execute(_id, params) {
      api.logger.info(`agentmail: reading email ${params.message_id}...`);

      try {
        const msg = await client.getMessage(inboxId, params.message_id);

        // Prefer extracted_text (strips quoted reply chains) over full text
        const body = msg.extracted_text ?? msg.text ?? msg.html ?? '(no content)';
        const date = new Date(msg.timestamp).toLocaleString();

        const attachments = msg.attachments ?? [];
        const cc = msg.cc ?? [];
        const attachmentList =
          attachments.length > 0
            ? `\nAttachments:\n${attachments.map((a) => `  - ${a.filename} (${a.content_type}, ${a.size} bytes)`).join('\n')}`
            : '';

        const text = [
          `From: ${msg.from}`,
          `To: ${(msg.to ?? []).join(', ')}`,
          cc.length > 0 ? `CC: ${cc.join(', ')}` : '',
          `Date: ${date}`,
          `Subject: ${msg.subject}`,
          `Message ID: ${msg.message_id}`,
          '',
          body,
          attachmentList,
        ]
          .filter(Boolean)
          .join('\n');

        api.logger.info('agentmail: email read successfully');

        return {
          content: [{ type: 'text' as const, text }],
          details: msg,
        };
      } catch (err) {
        api.logger.error(`agentmail: error reading email: ${String(err)}`);
        return {
          content: [{ type: 'text' as const, text: `Error reading email: ${String(err)}` }],
          details: { error: String(err) },
        };
      }
    },
  });
}
