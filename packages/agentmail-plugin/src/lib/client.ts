const BASE_URL = 'https://api.agentmail.to/v0';

export type AgentMailClient = ReturnType<typeof createAgentMailClient>;

export function createAgentMailClient(apiKey: string) {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`AgentMail API ${method} ${path} failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }

  return {
    createInbox(options?: { username?: string; display_name?: string }) {
      return request<{
        inbox_id: string;
        email: string;
        display_name: string | null;
        created_at: string;
      }>('POST', '/inboxes', options ?? {});
    },

    async listInboxes(options?: { limit?: number }) {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', String(options.limit));
      const qs = params.toString();
      const raw = await request<{
        inboxes: Array<{ inbox_id: string; email: string; display_name: string | null }>;
        count: number;
      }>('GET', `/inboxes${qs ? `?${qs}` : ''}`);
      return { items: raw.inboxes, count: raw.count };
    },

    sendMessage(
      inboxId: string,
      message: { to: string | string[]; subject: string; text?: string; html?: string },
    ) {
      return request<{ message_id: string; thread_id: string }>(
        'POST',
        `/inboxes/${encodeURIComponent(inboxId)}/messages/send`,
        message,
      );
    },

    async listMessages(
      inboxId: string,
      options?: { limit?: number; after?: string; labels?: string[] },
    ) {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', String(options.limit));
      if (options?.after) params.set('after', options.after);
      if (options?.labels) {
        for (const label of options.labels) params.append('labels', label);
      }
      const qs = params.toString();
      const raw = await request<{
        messages: Array<{
          message_id: string;
          thread_id: string;
          inbox_id: string;
          from: string;
          to: string[];
          subject: string;
          preview: string;
          extracted_text: string | null;
          timestamp: string;
          labels: string[];
        }>;
        count: number;
      }>('GET', `/inboxes/${encodeURIComponent(inboxId)}/messages${qs ? `?${qs}` : ''}`);
      return { items: raw.messages, count: raw.count };
    },

    getMessage(inboxId: string, messageId: string) {
      return request<{
        message_id: string;
        thread_id: string;
        inbox_id: string;
        from: string;
        to: string[] | null;
        cc: string[] | null;
        bcc: string[] | null;
        subject: string;
        text: string | null;
        html: string | null;
        extracted_text: string | null;
        extracted_html: string | null;
        preview: string;
        timestamp: string;
        labels: string[];
        attachments: Array<{
          attachment_id: string;
          filename: string;
          size: number;
          content_type: string;
        }> | null;
      }>('GET', `/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}`);
    },
  };
}
