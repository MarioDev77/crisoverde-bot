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
  /** Quando o bloqueio expira (apenas em respostas 403 de segurança) */
  blockedUntil?: string;
  /** Segundos para tentar novamente (apenas em respostas 429) */
  retryAfterSeconds?: number;
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

// ─── Segurança ────────────────────────────────────────────────────────────────

export interface SecurityStatus {
  ip: string;
  riskScore: number;
  suspiciousCount: number;
  blockCount: number;
  isBlocked: boolean;
  blockedUntil: string | null;
  lastAttemptAt: string;
}