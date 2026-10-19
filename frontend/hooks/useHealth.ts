"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { HealthInfo } from "@/lib/types";

export interface HealthState {
  status: "loading" | "online" | "offline";
  /** Nome do modelo como o servidor informa (ex.: "gemini-3.8-flash"); null se desconhecido. */
  model: string | null;
  searchEnabled: boolean;
}

const POLL_MS = 60_000;

/** Lê /api/health: disponibilidade real, modelo configurado e se a pesquisa está ligada. */
export function useHealth(): HealthState {
  const [state, setState] = useState<HealthState>({ status: "loading", model: null, searchEnabled: false });

  useEffect(() => {
    let alive = true;

    async function check() {
      try {
        const d = await api.get<HealthInfo>("/health");
        if (!alive) return;
        const model = d.engine ? d.engine.split("—").pop()?.trim() || null : null;
        setState({
          status: d.status === "ok" ? "online" : "offline",
          model,
          searchEnabled: d.search === "on",
        });
      } catch {
        if (!alive) return;
        setState((prev) => ({ ...prev, status: "offline", searchEnabled: false }));
      }
    }

    void check();
    const id = setInterval(check, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return state;
}
