import { createOpenRouter, type OpenRouterProvider } from "@openrouter/ai-sdk-provider";
import { openrouterEnv } from "@/lib/env";

let cached: OpenRouterProvider | undefined;

/** Lazily constructed OpenRouter provider (AI SDK). */
export function openrouter(): OpenRouterProvider {
  if (!cached) {
    const { OPENROUTER_API_KEY } = openrouterEnv();
    cached = createOpenRouter({
      apiKey: OPENROUTER_API_KEY,
      appName: "discovery-parser",
    });
  }
  return cached;
}
