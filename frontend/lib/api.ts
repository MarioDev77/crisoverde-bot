/**
 * api.ts — cliente HTTP fino para falar com o backend.
 *
 * `credentials: "include"` é essencial em TODAS as chamadas: é o que faz o
 * navegador enviar/receber o cookie HttpOnly de sessão (cv_token), mesmo o
 * front estando em outro domínio (Vercel) do backend (Railway).
 *
 * Como esse cookie cross-site é bloqueado por navegadores mobile (Safari/iOS
 * via ITP, WebViews de apps tipo WhatsApp/Instagram), também guardamos o
 * token em localStorage e mandamos via header `Authorization: Bearer` em
 * toda requisição — isso funciona independente de política de cookie do
 * navegador. O backend aceita qualquer um dos dois.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const TOKEN_KEY = "cv_auth_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // localStorage pode estar bloqueado (modo privado, etc.)
  }
}

export function setStoredToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignora — pior caso, cai só no cookie
  }
}

export function clearStoredToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignora
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}/api${path}`, {
    credentials: "include",
    headers,
    ...options,
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // resposta sem corpo (ex: 204) — segue sem erro
  }

  if (!res.ok) {
    throw new ApiError(data?.error || `Erro ${res.status}`, res.status, data?.code);
  }

  // Login/cadastro retornam `token` no corpo — guarda pro fallback funcionar
  // nas próximas requisições em navegadores que bloqueiam o cookie.
  if (data?.token) {
    setStoredToken(data.token);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};