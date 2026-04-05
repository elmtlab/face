import type {
  PlatformAdapter,
  PlatformAdapterConfig,
  ScannedTopic,
  EngagementMetrics,
} from "../types";
import { registerPlatformAdapter } from "../registry";

/**
 * X/Twitter platform adapter.
 *
 * Uses the X API v2 for topic scanning, posting, engagement
 * retrieval, and reply posting.
 *
 * Required credentials:
 *   - apiKey: API Key (Consumer Key)
 *   - apiSecret: API Secret (Consumer Secret)
 *   - accessToken: Access Token
 *   - accessTokenSecret: Access Token Secret
 *   - bearerToken: Bearer Token (for search/read endpoints)
 */
export class TwitterAdapter implements PlatformAdapter {
  readonly type = "twitter";
  readonly displayName = "X / Twitter";

  private bearerToken = "";
  private apiKey = "";
  private apiSecret = "";
  private accessToken = "";
  private accessTokenSecret = "";
  private baseUrl = "https://api.x.com/2";

  async connect(config: PlatformAdapterConfig): Promise<void> {
    this.bearerToken = config.credentials.bearerToken ?? "";
    this.apiKey = config.credentials.apiKey ?? "";
    this.apiSecret = config.credentials.apiSecret ?? "";
    this.accessToken = config.credentials.accessToken ?? "";
    this.accessTokenSecret = config.credentials.accessTokenSecret ?? "";

    if (!this.bearerToken) throw new Error("Bearer token is required");
    if (!this.accessToken) throw new Error("Access token is required");
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/users/me`, {
        headers: { Authorization: `Bearer ${this.bearerToken}` },
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `HTTP ${res.status}: ${text}` };
      }
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Connection failed",
      };
    }
  }

  async scanTopics(keywords: string[]): Promise<ScannedTopic[]> {
    const topics: ScannedTopic[] = [];

    // Build a query from keywords — search recent popular tweets
    const query = keywords
      .map((k) => `"${k}"`)
      .join(" OR ");

    const params = new URLSearchParams({
      query: `(${query}) -is:retweet lang:en`,
      max_results: "50",
      "tweet.fields": "public_metrics,created_at,context_annotations",
      sort_order: "relevancy",
    });

    try {
      const res = await fetch(
        `${this.baseUrl}/tweets/search/recent?${params}`,
        { headers: { Authorization: `Bearer ${this.bearerToken}` } },
      );

      if (!res.ok) {
        console.error(`[listener:twitter] Search failed: ${res.status}`);
        return topics;
      }

      const data = await res.json();
      if (!data.data) return topics;

      // Group tweets by context annotations to find topics
      const topicMap = new Map<
        string,
        { tweets: typeof data.data; keyword: string }
      >();

      for (const tweet of data.data) {
        // Match which keywords this tweet relates to
        const matchedKw = keywords.filter((kw) =>
          tweet.text?.toLowerCase().includes(kw.toLowerCase()),
        );
        const topicKey =
          tweet.context_annotations?.[0]?.entity?.name ?? matchedKw[0] ?? "general";

        if (!topicMap.has(topicKey)) {
          topicMap.set(topicKey, { tweets: [], keyword: topicKey });
        }
        topicMap.get(topicKey)!.tweets.push(tweet);
      }

      for (const [key, { tweets, keyword }] of topicMap) {
        const totalEngagement = tweets.reduce(
          (sum: number, t: Record<string, Record<string, number>>) =>
            sum +
            (t.public_metrics?.like_count ?? 0) +
            (t.public_metrics?.retweet_count ?? 0) +
            (t.public_metrics?.reply_count ?? 0),
          0,
        );

        const matchedKeywords = keywords.filter((kw) =>
          tweets.some((t: { text?: string }) =>
            t.text?.toLowerCase().includes(kw.toLowerCase()),
          ),
        );

        topics.push({
          id: `twitter-topic-${Date.now()}-${key.replace(/\s+/g, "-").toLowerCase()}`,
          platformId: key,
          platform: "twitter",
          title: key,
          description: tweets[0]?.text?.slice(0, 200) ?? "",
          matchedKeywords,
          relevanceScore: Math.min(matchedKeywords.length / keywords.length, 1),
          trendVolume: totalEngagement,
          url: `https://x.com/search?q=${encodeURIComponent(keyword)}`,
          scannedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("[listener:twitter] Scan error:", err);
    }

    return topics.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  async publishContent(
    body: string,
    _mediaUrls?: string[],
  ): Promise<{ platformPostId: string; platformPostUrl: string }> {
    // OAuth 1.0a is required for posting — use HMAC-SHA1 signature
    const oauthParams = this.buildOAuthParams();
    const url = `${this.baseUrl}/tweets`;
    const signature = await this.signRequest("POST", url, oauthParams);
    const authHeader = this.buildOAuthHeader({ ...oauthParams, oauth_signature: signature });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: body }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to publish: ${res.status} ${text}`);
    }

    const data = await res.json();
    const tweetId = data.data?.id;
    // Resolve the author handle for the tweet URL
    const authorHandle = await this.getAuthenticatedUserHandle();

    return {
      platformPostId: tweetId,
      platformPostUrl: `https://x.com/${authorHandle}/status/${tweetId}`,
    };
  }

  async fetchEngagement(platformPostId: string): Promise<EngagementMetrics> {
    const params = new URLSearchParams({
      "tweet.fields": "public_metrics",
    });

    const res = await fetch(
      `${this.baseUrl}/tweets/${platformPostId}?${params}`,
      { headers: { Authorization: `Bearer ${this.bearerToken}` } },
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch engagement: ${res.status}`);
    }

    const data = await res.json();
    const m = data.data?.public_metrics ?? {};

    return {
      likes: m.like_count ?? 0,
      reposts: m.retweet_count ?? 0,
      replies: m.reply_count ?? 0,
      impressions: m.impression_count ?? 0,
      bookmarks: m.bookmark_count ?? 0,
    };
  }

  async fetchComments(platformPostId: string) {
    const params = new URLSearchParams({
      query: `conversation_id:${platformPostId}`,
      max_results: "100",
      "tweet.fields": "public_metrics,author_id,created_at",
      expansions: "author_id",
      "user.fields": "name,username,profile_image_url",
    });

    const res = await fetch(
      `${this.baseUrl}/tweets/search/recent?${params}`,
      { headers: { Authorization: `Bearer ${this.bearerToken}` } },
    );

    if (!res.ok) return [];

    const data = await res.json();
    if (!data.data) return [];

    const users = new Map<string, { name: string; username: string }>();
    for (const u of data.includes?.users ?? []) {
      users.set(u.id, { name: u.name, username: u.username });
    }

    return data.data.map(
      (tweet: {
        id: string;
        text: string;
        author_id: string;
        public_metrics?: { like_count?: number; reply_count?: number };
      }) => {
        const user = users.get(tweet.author_id) ?? {
          name: "Unknown",
          username: "unknown",
        };
        return {
          platformCommentId: tweet.id,
          authorName: user.name,
          authorHandle: `@${user.username}`,
          authorProfileUrl: `https://x.com/${user.username}`,
          body: tweet.text,
          metrics: {
            likes: tweet.public_metrics?.like_count ?? 0,
            replies: tweet.public_metrics?.reply_count ?? 0,
          },
        };
      },
    );
  }

  async postReply(
    platformCommentId: string,
    body: string,
  ): Promise<{ replyPlatformId: string }> {
    const oauthParams = this.buildOAuthParams();
    const url = `${this.baseUrl}/tweets`;
    const signature = await this.signRequest("POST", url, oauthParams);
    const authHeader = this.buildOAuthHeader({ ...oauthParams, oauth_signature: signature });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: body,
        reply: { in_reply_to_tweet_id: platformCommentId },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to post reply: ${res.status} ${text}`);
    }

    const data = await res.json();
    return { replyPlatformId: data.data?.id };
  }

  // ── OAuth helpers ──────────────────────────────────────────────

  private buildOAuthParams(): Record<string, string> {
    return {
      oauth_consumer_key: this.apiKey,
      oauth_nonce: this.generateNonce(),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: this.accessToken,
      oauth_version: "1.0",
    };
  }

  private async signRequest(
    method: string,
    url: string,
    params: Record<string, string>,
  ): Promise<string> {
    const sortedParams = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const baseString = [
      method.toUpperCase(),
      encodeURIComponent(url),
      encodeURIComponent(sortedParams),
    ].join("&");

    const signingKey = `${encodeURIComponent(this.apiSecret)}&${encodeURIComponent(this.accessTokenSecret)}`;

    // Use Web Crypto API for HMAC-SHA1
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(signingKey),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(baseString));
    return btoa(String.fromCharCode(...new Uint8Array(sig)));
  }

  private buildOAuthHeader(params: Record<string, string>): string {
    const parts = Object.entries(params)
      .filter(([k]) => k.startsWith("oauth_"))
      .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
      .join(", ");
    return `OAuth ${parts}`;
  }

  private generateNonce(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private async getAuthenticatedUserHandle(): Promise<string> {
    try {
      const res = await fetch(`${this.baseUrl}/users/me`, {
        headers: { Authorization: `Bearer ${this.bearerToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        return data.data?.username ?? "i";
      }
    } catch {
      // fallback
    }
    return "i";
  }
}

// ── Auto-register ────────────────────────────────────────────────

registerPlatformAdapter("twitter", () => new TwitterAdapter());
