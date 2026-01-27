import { useEffect, useState } from "react";
import * as api from "../api";
import type { UsageSummary, UserStatisticData } from "../types";
import { DashboardWidgets } from "../components/DashboardWidgets";

interface StatsProps {
  accounts: Array<{
    id: string;
    name: string;
    email: string;
    usage?: UsageSummary | null;
    is_current?: boolean;
  }>;
  hasLoaded?: boolean;
}

export function Stats({ accounts, hasLoaded = true }: StatsProps) {
  const [userStats, setUserStats] = useState<UserStatisticData | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const statsCacheKey = (accountId: string) => `trae_user_stats_${accountId}`;
  const loadStatsCache = (accountId: string) => {
    try {
      const raw = localStorage.getItem(statsCacheKey(accountId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.data) return parsed.data as UserStatisticData;
      if (parsed && parsed.UserID) return parsed as UserStatisticData;
    } catch {
      return null;
    }
    return null;
  };
  const aggregateStats = (statsList: UserStatisticData[]): UserStatisticData => {
    const merged: UserStatisticData = {
      UserID: "ALL",
      RegisterDays: 0,
      AiCnt365d: {},
      CodeAiAcceptCnt7d: 0,
      CodeAiAcceptDiffLanguageCnt7d: {},
      CodeCompCnt7d: 0,
      CodeCompDiffAgentCnt7d: {},
      CodeCompDiffModelCnt7d: {},
      IdeActiveDiffHourCnt7d: {},
      DataDate: "",
      IsIde: false
    };
    for (const stats of statsList) {
      if (!stats) continue;
      merged.RegisterDays = Math.max(merged.RegisterDays, stats.RegisterDays || 0);
      merged.CodeAiAcceptCnt7d += stats.CodeAiAcceptCnt7d || 0;
      merged.CodeCompCnt7d += stats.CodeCompCnt7d || 0;
      merged.IsIde = merged.IsIde || !!stats.IsIde;
      if (stats.DataDate && stats.DataDate > merged.DataDate) {
        merged.DataDate = stats.DataDate;
      }
      const mergeMap = (target: Record<string, number>, source?: Record<string, number>) => {
        if (!source) return;
        Object.entries(source).forEach(([key, value]) => {
          target[key] = (target[key] || 0) + (value || 0);
        });
      };
      mergeMap(merged.AiCnt365d, stats.AiCnt365d);
      mergeMap(merged.CodeAiAcceptDiffLanguageCnt7d, stats.CodeAiAcceptDiffLanguageCnt7d);
      mergeMap(merged.CodeCompDiffAgentCnt7d, stats.CodeCompDiffAgentCnt7d);
      mergeMap(merged.CodeCompDiffModelCnt7d, stats.CodeCompDiffModelCnt7d);
      mergeMap(merged.IdeActiveDiffHourCnt7d, stats.IdeActiveDiffHourCnt7d);
    }
    return merged;
  };
  const saveStatsCache = (accountId: string, data: UserStatisticData) => {
    try {
      localStorage.setItem(statsCacheKey(accountId), JSON.stringify({
        data,
        cachedAt: new Date().toISOString()
      }));
    } catch {
      // ignore cache write errors
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!accounts.length) {
      setUserStats(null);
      setLoadingStats(false);
      setStatsError(null);
      return;
    }
    const cachedStats = accounts
      .map(account => loadStatsCache(account.id))
      .filter(Boolean) as UserStatisticData[];
    if (cachedStats.length > 0) {
      setUserStats(aggregateStats(cachedStats));
      setLoadingStats(false);
      setStatsError(null);
    } else {
      setUserStats(null);
      setLoadingStats(true);
      setStatsError(null);
    }
    (async () => {
      try {
        const results = await Promise.allSettled(
          accounts.map(async (account) => {
            const stats = await api.getUserStatistics(account.id);
            saveStatsCache(account.id, stats);
            return stats;
          })
        );
        if (cancelled) return;
        const freshStats = results
          .filter((res): res is PromiseFulfilledResult<UserStatisticData> => res.status === "fulfilled")
          .map(res => res.value);
        const fallbackStats = cachedStats.length > 0 ? cachedStats : [];
        const mergedList = freshStats.length > 0 ? freshStats : fallbackStats;
        if (mergedList.length > 0) {
          setUserStats(aggregateStats(mergedList));
          setStatsError(null);
        } else {
          setStatsError("获取统计数据失败");
        }
      } catch (e: any) {
        if (cancelled) return;
        if (!cachedStats.length) {
          setStatsError(e.message || "获取统计数据失败");
        }
      } finally {
        if (!cancelled) {
          setLoadingStats(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accounts.map(a => a.id).join("|")]);

  return (
    <div className="dashboard">
      {loadingStats && (
        <div className="dashboard-widgets-section loading-placeholder" style={{ marginBottom: "24px", textAlign: "center", padding: "40px", background: "var(--bg-card)", borderRadius: "16px" }}>
          <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
          <p style={{ color: "var(--text-muted)" }}>正在加载统计数据...</p>
        </div>
      )}

      {statsError && !userStats && (
        <div className="dashboard-widgets-section error-placeholder" style={{ marginBottom: "24px", textAlign: "center", padding: "20px", background: "var(--danger-bg)", borderRadius: "16px", color: "var(--danger)" }}>
          <p>⚠️ {statsError}</p>
          <button
            onClick={() => {
              window.location.reload();
            }}
            style={{ marginTop: "10px", padding: "6px 12px", background: "transparent", border: "1px solid currentColor", borderRadius: "4px", cursor: "pointer", color: "inherit" }}
          >
            重试
          </button>
        </div>
      )}

      {userStats && (
        <div className="dashboard-widgets-section" style={{ marginBottom: "24px" }}>
          <DashboardWidgets data={userStats} />
        </div>
      )}

      {accounts.length === 0 && (
        hasLoaded ? (
          <div className="dashboard-empty">
            <div className="empty-icon">📊</div>
            <h3>暂无账号数据</h3>
            <p>请先在"账号管理"中添加账号</p>
          </div>
        ) : (
          <div className="loading-state">加载中...</div>
        )
      )}
    </div>
  );
}
