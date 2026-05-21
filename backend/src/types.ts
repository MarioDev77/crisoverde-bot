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

// ─── Memória do usuário ───────────────────────────────────────────────────────

export interface UserMemory {
  nome?: string;
  cidade?: string;
  idade?: string;
  profissao?: string;
  interesses: string[];
  preferencias: string[];
  metas: string[];
  acoes_sustentaveis: string[];
  pontuacao_crisomoeda: number;
  historico: string[];           // resumos das conversas anteriores
  ultimaConversa?: string;       // ISO timestamp
}