// lib/server/openai-client.ts
import OpenAI, { type ClientOptions } from "openai";
import { localLLMEnabled, localRespond, type LocalResponse, type Responses_Options } from "./local-llm";

export function openaiClient(opts: Omit<ClientOptions, "apiKey" | "defaultHeaders"> = {}) {
  const client = new OpenAI({
    ...opts,
    apiKey: process.env.OPENAI_API_KEY || "ollama",
  });

  if (localLLMEnabled()) {
    const orig = client.responses;
    (client as any).responses = {
      ...orig,
      create: async (params: Responses_Options, _opts?: unknown): Promise<LocalResponse> => {
        const model = params.model ?? "";
        if (model.startsWith("gpt-live") || model.startsWith("gpt-transcribe") || model.startsWith("gpt-image")) {
          return (orig as any).create(params, _opts);
        }
        return localRespond(params);
      },
    };
  }

  return client;
}                                       
