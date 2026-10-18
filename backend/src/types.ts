export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Assinatura da resposta da IA (só em turnos "assistant" devolvidos pelo cliente). */
  sig?: string;
}

export interface ChatRequest {
  sessionId: string;
  message: string;
  history?: ChatMessage[];
}

export interface SourceRef {
  title: string;
  url: string;
}

export interface ChatResponse {
  reply: string;
  sessionId: string;
  timestamp: string;
  /** Presente apenas quando a resposta usou resultados de busca externa. */
  sources?: SourceRef[];
  /** Assinatura da resposta: o cliente a devolve junto do histórico para ele ser aceito. */
  sig?: string;
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
  /**
   * Quando cada informação foi registrada/confirmada (ISO). Chaves: "profissao",
   * "interesses:<valor>", "metas:<valor>". Usado para expirar dados temporários.
   * Ausente em registros antigos — nesse caso o relógio começa na primeira leitura.
   */
  datas?: Record<string, string>;
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