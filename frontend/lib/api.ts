/**
 * api.ts — cliente HTTP fino para falar com o backend.
 *
 * `credentials: "include"` é essencial em TODAS as chamadas: é o que faz o
 * navegador enviar/receber o cookie HttpOnly de sessão (cv_token), mesmo o
 * front estando em outro domínio (Vercel) do backend (Railway).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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
  const res = await fetch(`${API_URL}/api${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
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

  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
