import type { JsonSchema } from "./route-ai-client";

export type DeepSeekRouteClientOptions = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
};

export function parseDeepSeekMessageContent<T>(payload: unknown): T | null {
  const content = (payload as { choices?: Array<{ message?: { content?: string | null } }> }).choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export class DeepSeekRouteClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: DeepSeekRouteClientOptions = {}) {
    this.apiKey = options.apiKey || process.env.DEEPSEEK_API_KEY || "";
    this.model = options.model || process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
    this.baseUrl = (options.baseUrl || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
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
            content: `${systemPrompt}\nReturn valid json only. selectedStops must be an array of objects with exactly candidateId, day, and reason. For 1-day routes select 3 to 4 stops. For 2-day routes select 5 to 8 stops and include day 2. Use only candidateId values from the input candidates. Do not mention non-candidate places in any field. Required top-level keys: selectedStops, arrangementReason, skipSuggestion, weatherAlternative.`
          },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        max_tokens: 1800
      })
    });
    if (!response.ok) return null;
    return parseDeepSeekMessageContent<T>(await response.json());
  }
}
