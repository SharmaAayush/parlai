export type Role = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface ModelInfo {
  id: string;
  label?: string;
  contextLength?: number;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}

export type ChatChunk =
  | { type: 'text_delta'; text: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number }
  | { type: 'finish'; reason: string }
  | { type: 'error'; code: string; message: string };

export interface ChatProvider {
  id: string;
  listModels(apiKey?: string, signal?: AbortSignal): Promise<ModelInfo[]>;
  streamChat(req: ChatRequest, apiKey?: string): AsyncIterable<ChatChunk>;
}
