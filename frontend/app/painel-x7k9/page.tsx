"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, RefreshCw, Users, MessageSquare, Coins, ShieldAlert } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { MetricsChart } from "@/components/MetricsChart";
import { UsersTable } from "@/components/UsersTable";
import { SecurityTable } from "@/components/SecurityTable";
import { api } from "@/lib/api";
import type {
  OverviewMetrics,
  MetricsSeriesResponse,
  AdminUserRow,
  SecurityIpRow,
} from "@/lib/types";

type Range = "weekly" | "monthly";

export default function AdminDashboardPage() {
  const [range, setRange] = useState<Range>("weekly");
  const [overview, setOverview] = useState<OverviewMetrics | null>(null);
  const [series, setSeries] = useState<MetricsSeriesResponse | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [ips, setIps] = useState<SecurityIpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async (currentRange: Range, isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [overviewData, seriesData, usersData, ipsData] = await Promise.all([
        api.get<OverviewMetrics>("/admin/metrics/overview"),
        api.get<MetricsSeriesResponse>(`/admin/metrics/series?range=${currentRange}`),
        api.get<{ users: AdminUserRow[] }>("/admin/users?limit=50"),
        api.get<{ ips: SecurityIpRow[] }>("/admin/security/ips?limit=20"),
      ]);
      setOverview(overviewData);
      setSeries(seriesData);
      setUsers(usersData.users);
      setIps(ipsData.ips);
    } catch {
      setError("Não foi possível carregar os dados do painel. Tente atualizar.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAll(range);
  }, [range, loadAll]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-forest" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold">Métricas gerais</h1>
          <p className="text-sm text-ink/55">Visão semanal e mensal de uso e segurança.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-line bg-surface p-1">
            <RangeButton active={range === "weekly"} onClick={() => setRange("weekly")}>
              Semanal
            </RangeButton>
            <RangeButton active={range === "monthly"} onClick={() => setRange("monthly")}>
              Mensal
            </RangeButton>
          </div>
          <button
            onClick={() => loadAll(range, true)}
            disabled={refreshing}
            className="btn-secondary !px-3 !py-2"
            aria-label="Atualizar dados"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-rust/10 px-4 py-2.5 text-sm text-rust" role="alert">
          {error}
        </p>
      )}

      {overview && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Usuários totais"
            value={overview.totalUsers}
            hint={`+${range === "weekly" ? overview.newUsersThisWeek : overview.newUsersThisMonth} no período`}
          />
          <StatCard
            label="Mensagens no chat"
            value={overview.totalChatMessages}
            hint={`+${range === "weekly" ? overview.chatMessagesThisWeek : overview.chatMessagesThisMonth} no período`}
          />
          <StatCard
            label="Crisomoedas emitidas"
            value={Math.round(overview.totalCrisomoedas)}
            tone="gold"
          />
          <StatCard
            label="IPs bloqueados agora"
            value={overview.blockedIpsActive}
            hint={`${overview.suspiciousEvents7d} eventos suspeitos (7d)`}
            tone={overview.blockedIpsActive > 0 ? "rust" : "default"}
          />
        </div>
      )}

      {series && (
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricsChart
            title="Novos usuários"
            data={series.newUsers}
            color="#1F5C3F"
            range={range}
          />
          <MetricsChart
            title="Mensagens de chat"
            data={series.chatMessages}
            color="#C69B3A"
            range={range}
          />
          <MetricsChart
            title="Eventos de segurança"
            data={series.securityEvents}
            color="#B3492F"
            range={range}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <UsersTable users={users} />
        <SecurityTable ips={ips} />
      </div>
    </div>
  );
}

function RangeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-forest text-white" : "text-ink/60 hover:text-forest"
      }`}
    >
      {children}
    </button>
  );
}
