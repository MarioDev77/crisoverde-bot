/**
 * api.ts — cliente HTTP fino para falar com o backend.
 *
 * As chamadas usam caminho relativo ("/api/...") em vez da URL do Railway
 * direto. Isso faz o navegador enxergar tudo como same-origin (a Vercel
 * proxeia pro Railway via `rewrites` no next.config.mjs) — essencial pro
 * cookie de sessão funcionar de forma consistente em qualquer navegador
 * (veja o comentário em next.config.mjs pra entender o motivo).
 *
 * `credentials: "include"` continua necessário mesmo same-origin, não atrapalha.
 */

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
  const res = await fetch(`/api${path}`, {
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