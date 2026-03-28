import type {
  NotificationProvider,
  NotificationProviderConfig,
  NotificationPayload,
  NotificationResult,
} from "../types";

/**
 * Slack notification provider.
 *
 * Uses Slack's Web API (chat.postMessage) to send notifications
 * to a configured channel or user.
 *
 * Required credentials:
 *   - token: Slack Bot OAuth token (xoxb-...)
 * Target: Slack channel ID (e.g. C01ABC123)
 */
export class SlackProvider implements NotificationProvider {
  readonly type = "slack";
  readonly displayName = "Slack";

  private token = "";
  private channel = "";
  private baseUrl = "https://slack.com/api";

  async connect(config: NotificationProviderConfig): Promise<void> {
    this.token = config.credentials.token ?? "";
    this.channel = config.target;
    if (!this.token) throw new Error("Slack token is required");
    if (!this.channel) throw new Error("Slack channel ID is required");
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/auth.test`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();
      if (!data.ok) return { ok: false, error: data.error ?? "Auth test failed" };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
    }
  }

  async send(payload: NotificationPayload): Promise<NotificationResult> {
    try {
      const blocks = this.formatBlocks(payload);
      const res = await fetch(`${this.baseUrl}/chat.postMessage`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: this.channel,
          text: `${payload.title}: ${payload.body}`,
          blocks,
        }),
      });
      const data = await res.json();
      if (!data.ok) return { ok: false, error: data.error };
      return { ok: true, messageId: data.ts };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
    }
  }

  async sendBatch(payloads: NotificationPayload[]): Promise<NotificationResult[]> {
    return Promise.all(payloads.map((p) => this.send(p)));
  }

  private formatBlocks(payload: NotificationPayload) {
    const priorityEmoji = {
      low: "",
      normal: "",
      high: ":warning:",
      urgent: ":rotating_light:",
    }[payload.priority];

    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${priorityEmoji} *${payload.title}*\n${payload.body}`,
        },
      },
    ];

    if (payload.url) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `<${payload.url}|View details>`,
        },
      });
    }

    return blocks;
  }
}
