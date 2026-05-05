import type { JsonSchema } from "./route-ai-client";

export type BailianRouteClientOptions = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
};

export function parseBailianMessageContent<T>(payload: unknown): T | null {
  const content = (payload as { choices?: Array<{ message?: { content?: string | null } }> }).choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export class BailianRouteClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: BailianRouteClientOptions = {}) {
    this.apiKey = options.apiKey || process.env.BAILIAN_API_KEY || "";
    this.model = options.model || process.env.BAILIAN_MODEL || "qwen-plus";
    this.baseUrl = (options.baseUrl || process.env.BAILIAN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
    this.fetcher = options.fetcher || fetch;
  }

  async createJson<T>(systemPrompt: string, userPrompt: string, _schema: JsonSchema): Promise<T | null> {
    if (!this.apiKey) return null;
    const response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `${systemPrompt}\nReturn valid json only. Example keys: selectedStops, arrangementReason, skipSuggestion, weatherAlternative.`
          },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        max_tokens: 1800
      })
    });
    if (!response.ok) return null;
    return parseBailianMessageContent<T>(await response.json());
  }
}
