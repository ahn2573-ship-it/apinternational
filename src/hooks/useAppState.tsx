import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/supabase";
import { resolveRange, type CompareMode, type DateRange } from "@/lib/dateRange";
import { ALL_BRANDS, type AdAccount, type View } from "@/lib/types";

interface AppStateValue {
  /** 브랜드 목록 (= 광고 계정) */
  accounts: AdAccount[];
  /** 선택한 브랜드 id, 또는 "all"(전체 브랜드) */
  accountId: string | null;
  setAccountId: (id: string) => void;
  /** 지금 선택 범위에 SA 가 연동된 브랜드가 있는지 (customer_id 입력 여부) */
  saEnabled: boolean;
  range: DateRange;
  setRange: (r: DateRange) => void;
  compare: CompareMode;
  setCompare: (c: CompareMode) => void;
  media: View;
  setMedia: (m: View) => void;
  loading: boolean;
  error: unknown;
}

const AppStateContext = createContext<AppStateValue | null>(null);
const STORAGE_KEY = "brand-ads.filters";

function loadSaved(): { accountId?: string; range?: DateRange; compare?: CompareMode; media?: View } {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const saved = loadSaved();
  const [accountId, setAccountId] = useState<string | null>(saved.accountId ?? null);
  const [range, setRange] = useState<DateRange>(saved.range ?? resolveRange("last7"));
  const [compare, setCompare] = useState<CompareMode>(saved.compare ?? "prev_period");
  const [media, setMedia] = useState<View>(
    saved.media === "sa" || saved.media === "gfa" ? saved.media : "total",
  );
  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });

  // 처음엔 "전체", 지워진 브랜드가 저장돼 있으면 "전체"로 되돌린다
  useEffect(() => {
    if (!accountsQuery.data) return;
    if (!accountId || (accountId !== ALL_BRANDS && !accountsQuery.data.some((a) => a.id === accountId))) {
      setAccountId(ALL_BRANDS);
    }
  }, [accountsQuery.data, accountId]);

  const saEnabled = useMemo(() => {
    const list = accountsQuery.data ?? [];
    const scope = accountId === ALL_BRANDS ? list : list.filter((a) => a.id === accountId);
    return scope.some((a) => Boolean(a.customer_id));
  }, [accountsQuery.data, accountId]);

  // SA 가 연동 안 된 브랜드로 바꾸면 SA 탭에 머물지 않게 한다
  useEffect(() => {
    if (accountsQuery.data && !saEnabled && media === "sa") setMedia("total");
  }, [accountsQuery.data, saEnabled, media]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ accountId, range, compare, media }));
    } catch {
      // 저장 못 해도 화면은 정상 동작
    }
  }, [accountId, range, compare, media]);

  const value = useMemo<AppStateValue>(() => ({
    accounts: accountsQuery.data ?? [],
    accountId,
    setAccountId,
    saEnabled,
    range,
    setRange,
    compare,
    setCompare,
    media,
    setMedia,
    loading: accountsQuery.isLoading,
    error: accountsQuery.error,
  }), [accountsQuery.data, accountsQuery.isLoading, accountsQuery.error, accountId, saEnabled, range, compare, media]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState 는 AppStateProvider 안에서만 쓸 수 있습니다.");
  return ctx;
}
