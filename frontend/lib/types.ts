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
}

export interface ChatResponse {
  reply: string;
  sessionId: string;
  timestamp: string;
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
