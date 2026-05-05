export type OpenAiRouteClientOptions = {
  apiKey?: string;
  model?: string;
  fetcher?: typeof fetch;
};

export type JsonSchema = Record<string, unknown>;

export function parseStructuredOutputText<T>(payload: unknown): T | null {
  const output = (payload as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }).output || [];
  for (const item of output) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        try {
          return JSON.parse(content.text) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export class OpenAiRouteClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetcher: typeof fetch;

  constructor(options: OpenAiRouteClientOptions = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || "";
    this.model = options.model || process.env.OPENAI_MODEL || "gpt-4.1-mini";
    this.fetcher = options.fetcher || fetch;
  }

  async createJson<T>(systemPrompt: string, userPrompt: string, schema: JsonSchema): Promise<T | null> {
    if (!this.apiKey) return null;
    const response = await this.fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
          { role: "user", content: [{ type: "input_text", text: userPrompt }] }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "route_planning_result",
            schema,
            strict: false
          }
        }
      })
    });
    if (!response.ok) return null;
    return parseStructuredOutputText<T>(await response.json());
  }
}
