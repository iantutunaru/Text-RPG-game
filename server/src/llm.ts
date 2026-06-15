// LLM backend abstraction.
//
// The game logic talks to this interface only, so swapping the backend (a free
// hosted tier, or a paid API) later is a single new implementation — no changes
// to the GM engine. The shipped implementation targets a LOCAL Ollama server,
// which is free, private, and requires no API key.

import { Ollama } from "ollama";

export type LLMRole = "system" | "user" | "assistant" | "tool";

export interface LLMMessage {
  role: LLMRole;
  content: string;
  tool_calls?: LLMToolCall[];
  tool_name?: string; // for role: "tool", the tool that produced this result
}

export interface LLMToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
}

export interface LLMToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMChatParams {
  system: string;
  messages: LLMMessage[];
  tools?: LLMToolDef[];
  /** Stream tokens (default true). Forced-JSON calls must be non-streamed. */
  stream?: boolean;
  /** JSON Schema to force structured output (Ollama `format`). Implies non-stream. */
  format?: Record<string, unknown>;
  /** Called for each streamed text token of the assistant's content. */
  onToken?: (text: string) => void;
  /** Override temperature (default 0.8). */
  temperature?: number;
}

export interface LLMResult {
  content: string;
  toolCalls: LLMToolCall[];
}

export interface LLMClient {
  chat(params: LLMChatParams): Promise<LLMResult>;
}

// Default GM model. `qwen2.5:14b` gives noticeably richer narration and is strong
// at the structured-JSON output the engine relies on. Set GM_MODEL=llama3.1:8b
// for a faster, fully-in-VRAM fallback.
export const MODEL = process.env.GM_MODEL || "qwen2.5:14b";
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

// Context window. Ollama defaults to a small num_ctx (~2048), which silently
// truncates our prompt (system + state + up-to-8-turn transcript + storySoFar)
// and starves both continuity and description quality. 8192 is comfortable on
// the dev RTX 4060 (the 14B is already partially CPU-offloaded).
export const NUM_CTX = Number(process.env.GM_NUM_CTX) || 8192;

export class OllamaClient implements LLMClient {
  private client = new Ollama({ host: OLLAMA_HOST });

  async chat({
    system,
    messages,
    tools,
    stream = true,
    format,
    onToken,
    temperature = 0.8,
  }: LLMChatParams): Promise<LLMResult> {
    const ollamaMessages = [
      { role: "system", content: system },
      ...messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.tool_calls
          ? {
              tool_calls: m.tool_calls.map((c) => ({
                function: { name: c.name, arguments: c.arguments },
              })),
            }
          : {}),
        ...(m.tool_name ? { tool_name: m.tool_name } : {}),
      })),
    ];

    const ollamaTools = tools?.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters as any,
      },
    }));

    // Non-streaming: most reliable for structured tool calls / forced JSON.
    if (!stream || format) {
      const resp = await this.client.chat({
        model: MODEL,
        messages: ollamaMessages,
        tools: format ? undefined : ollamaTools,
        format: format as any,
        stream: false,
        options: { temperature, num_ctx: NUM_CTX },
      });
      const toolCalls: LLMToolCall[] = (resp.message?.tool_calls ?? []).map(
        (c) => ({ name: c.function.name, arguments: normalizeArgs(c.function.arguments) })
      );
      return { content: resp.message?.content ?? "", toolCalls };
    }

    // Streaming: used for the prose narration phase (no tools).
    const streamResp = await this.client.chat({
      model: MODEL,
      messages: ollamaMessages,
      tools: ollamaTools,
      stream: true,
      options: { temperature, num_ctx: NUM_CTX },
    });

    let content = "";
    const toolCalls: LLMToolCall[] = [];

    for await (const part of streamResp) {
      const delta = part.message?.content ?? "";
      if (delta) {
        content += delta;
        onToken?.(delta);
      }
      const calls = part.message?.tool_calls;
      if (calls) {
        for (const c of calls) {
          toolCalls.push({
            name: c.function.name,
            arguments: normalizeArgs(c.function.arguments),
          });
        }
      }
    }

    return { content, toolCalls };
  }
}

/** Tool-call arguments usually arrive as an object, but some models emit a JSON
 *  string. Normalize to a plain object so callers don't have to care. */
function normalizeArgs(args: unknown): Record<string, unknown> {
  if (args && typeof args === "object") return args as Record<string, unknown>;
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      /* fall through */
    }
  }
  return {};
}
