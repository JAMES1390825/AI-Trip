import { BailianRouteClient } from "./bailian-route-client";
import { DeepSeekRouteClient } from "./deepseek-route-client";
import { OpenAiRouteClient } from "./openai-route-client";

export type JsonSchema = Record<string, unknown>;

export type RouteAiJsonClient = {
  createJson<T>(systemPrompt: string, userPrompt: string, schema: JsonSchema): Promise<T | null>;
};

export type AiProvider = "openai" | "deepseek" | "bailian";
export type AiProviderEnv = NodeJS.ProcessEnv | Record<string, string | undefined>;

export function createRouteAiClient(env: AiProviderEnv = process.env): RouteAiJsonClient | undefined {
  const provider = (env.AI_PROVIDER || "openai").toLowerCase();
  if (provider === "deepseek") {
    return env.DEEPSEEK_API_KEY ? new DeepSeekRouteClient() : undefined;
  }
  if (provider === "bailian") {
    return env.BAILIAN_API_KEY ? new BailianRouteClient() : undefined;
  }
  if (provider === "openai") {
    return env.OPENAI_API_KEY ? new OpenAiRouteClient() : undefined;
  }
  return undefined;
}
