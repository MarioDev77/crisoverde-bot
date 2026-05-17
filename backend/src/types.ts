export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  sessionId: string;
  message: string;
  history?: ChatMessage[];
}

export interface ChatResponse {
  reply: string;
  sessionId: string;
  timestamp: string;
}

export interface ErrorResponse {
  error: string;
  code: string;
  timestamp: string;
}
