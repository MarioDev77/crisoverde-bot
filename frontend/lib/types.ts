export type UserRole = "user" | "admin";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Assinatura da resposta da IA; o backend só aceita turnos "assistant" assinados no histórico. */
  sig?: string;
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
  sig?: string;
}

export interface OverviewMetrics {
  totalUsers: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  totalChatMessages: number;
  chatMessagesThisWeek: number;
  chatMessagesThisMonth: number;
  blockedIpsActive: number;
  suspiciousEvents7d: number;
  totalCrisomoedas: number;
}

export interface SeriesPoint {
  bucket: string;
  count: number;
}

export interface MetricsSeriesResponse {
  range: "weekly" | "monthly";
  days: number;
  newUsers: SeriesPoint[];
  chatMessages: SeriesPoint[];
  securityEvents: SeriesPoint[];
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface SecurityIpRow {
  ip: string;
  risk_score: number;
  suspicious_count: number;
  block_count: number;
  blocked_until: string | null;
  last_attempt_at: string;
}

/** O que a CRISO.AI guarda sobre o usuário (GET /api/me/memory). */
export interface MemoryView {
  nome: string | null;
  cidade: string | null;
  profissao: string | null;
  idade: string | null;
  interesses: string[];
  metas: string[];
  outros: {
    preferencias: string[];
    acoes_sustentaveis: string[];
    historico: string[];
  };
  ultimaConversa: string | null;
  retencaoDias: { profissao: number; interesses: number; metas: number };
  limites: { interesses: number; metas: number };
}

export interface MemoryResponse {
  memory: MemoryView;
  /** Valores que o backend recusou guardar (dados sensíveis, links, etc.). */
  rejected?: string[];
}
