import type {
  NotificationProvider,
  NotificationProviderConfig,
  NotificationPayload,
  NotificationResult,
} from "../types";

/**
 * Telegram notification provider.
 *
 * Uses the Telegram Bot API to send messages to a chat.
 *
 * Required credentials:
 *   - botToken: Telegram Bot API token (from @BotFather)
 * Target: Telegram chat ID (numeric string)
 */
export class TelegramProvider implements NotificationProvider {
  readonly type = "telegram";
  readonly displayName = "Telegram";

  private botToken = "";
  private chatId = "";

  private get baseUrl() {
    return `https://api.telegram.org/bot${this.botToken}`;
  }

  async connect(config: NotificationProviderConfig): Promise<void> {
    this.botToken = config.credentials.botToken ?? "";
    this.chatId = config.target;
    if (!this.botToken) throw new Error("Telegram bot token is required");
    if (!this.chatId) throw new Error("Telegram chat ID is required");
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/getMe`);
      const data = await res.json();
      if (!data.ok) return { ok: false, error: data.description ?? "Bot auth failed" };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
    }
  }

  async send(payload: NotificationPayload): Promise<NotificationResult> {
    try {
      const text = this.formatMessage(payload);
      const res = await fetch(`${this.baseUrl}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: !payload.url,
        }),
      });
      const data = await res.json();
      if (!data.ok) return { ok: false, error: data.description };
      return { ok: true, messageId: String(data.result?.message_id) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
    }
  }

  async sendBatch(payloads: NotificationPayload[]): Promise<NotificationResult[]> {
    // Telegram rate-limits; send sequentially
    const results: NotificationResult[] = [];
    for (const p of payloads) {
      results.push(await this.send(p));
    }
    return results;
  }

  private formatMessage(payload: NotificationPayload): string {
    const priorityLabel = {
      low: "",
      normal: "",
      high: "\u26a0\ufe0f ",
      urgent: "\ud83d\udea8 ",
    }[payload.priority];

    let text = `${priorityLabel}<b>${this.escape(payload.title)}</b>\n\n${this.escape(payload.body)}`;

    if (payload.url) {
      text += `\n\n<a href="${payload.url}">View details</a>`;
    }

    return text;
  }

  private escape(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}
