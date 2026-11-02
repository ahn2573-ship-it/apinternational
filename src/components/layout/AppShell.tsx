import { useState, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  BarChart3, Database, GitCompare, LayoutDashboard, LogOut, Menu, RefreshCw, Upload,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/hooks/useAuth";
import { useAppState } from "@/hooks/useAppState";
import { Badge } from "@/components/ui";
import { ALL_BRANDS, type View } from "@/lib/types";
import { BRAND_NAME, BrandDot, brandColor } from "@/lib/brand";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  /** SA 가 연동된 브랜드가 하나라도 있을 때만 보이는 메뉴 */
  needsSa?: boolean;
  end?: boolean;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "성과",
    items: [
      { to: "/", label: "대시보드", icon: LayoutDashboard },
      { to: "/compare", label: "성과 비교", icon: GitCompare },
      { to: "/raw", label: "RAW 데이터", icon: Database },
    ],
  },
  {
    section: "데이터 관리",
    items: [
      { to: "/gfa", label: "GFA 업로드", icon: Upload, adminOnly: true },
      { to: "/sync", label: "SA 수집 이력", icon: RefreshCw, adminOnly: true, needsSa: true },
    ],
  },
];

const MEDIA_TABS: { value: View; label: string }[] = [
  { value: "total", label: "전체" },
  { value: "sa", label: "네이버 SA" },
  { value: "gfa", label: "네이버 GFA" },
];

export function AppShell() {
  const { profile, isAdmin, signOut } = useAuth();
  const { accounts, accountId, setAccountId, media, setMedia, saEnabled } = useAppState();
  const [open, setOpen] = useState(false);
  const anySa = accounts.some((a) => Boolean(a.customer_id));

  return (
    <div className="flex min-h-screen">
      {/* 사이드바 */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-surface",
          "transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-line px-4">
          <BarChart3 className="h-5 w-5 text-brand-500" />
          <div className="leading-tight">
            <p className="text-sm font-semibold">광고 성과 콘솔</p>
            <p className="text-2xs text-ink-faint">{BRAND_NAME}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {NAV.map((group) => {
            const items = group.items.filter((i) => (!i.adminOnly || isAdmin) && (!i.needsSa || anySa));
            if (!items.length) return null;
            return (
              <div key={group.section} className="mb-4">
                <p className="px-2 pb-1 text-2xs font-semibold uppercase tracking-wide text-ink-faint">
                  {group.section}
                </p>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end ?? item.to === "/"}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) => cn(
                      "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-brand-50 font-medium text-brand-700"
                        : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
                    )}
                  >
                    <item.icon className="h-4 w-4" strokeWidth={1.75} />
                    <span className="flex-1">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-line p-3">
          <p className="truncate text-xs font-medium">{profile?.full_name ?? profile?.email}</p>
          <div className="mt-1 flex items-center justify-between">
            <Badge tone={isAdmin ? "brand" : "neutral"}>{isAdmin ? "관리자" : "조회 사용자"}</Badge>
            <button
              onClick={signOut}
              className="flex items-center gap-1 text-2xs text-ink-faint hover:text-ink"
            >
              <LogOut className="h-3 w-3" /> 로그아웃
            </button>
          </div>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-ink/20 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* 본문 */}
      <div className="flex min-w-0 flex-1 flex-col lg:ml-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur">
          <button
            className="rounded p-1.5 text-ink-muted hover:bg-surface-sunken lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="메뉴 열기"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* 브랜드 탭 (전체 / 브랜드별) — 전역 상태, 대시보드·RAW 화면에 적용 */}
          <div
            className="flex min-w-0 items-center overflow-x-auto rounded-md border border-line bg-surface-sunken p-0.5"
            role="tablist"
            aria-label="브랜드"
          >
            {[{ id: ALL_BRANDS, name: "전체" }, ...accounts].map((b) => {
              const active = accountId === b.id;
              return (
                <button
                  key={b.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setAccountId(b.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors",
                    active ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
                  )}
                >
                  {b.id !== ALL_BRANDS && <BrandDot color={brandColor(accounts, b.id)} />}
                  {b.name}
                </button>
              );
            })}
          </div>

          {/* 매체 탭 (전체 / SA / GFA) — 오른쪽 끝. SA 는 연동된 브랜드에서만 열린다 */}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span className="hidden text-2xs text-ink-faint sm:inline">매체</span>
            <div className="flex items-center rounded-md border border-line bg-surface-sunken p-0.5" role="tablist" aria-label="광고 매체">
              {MEDIA_TABS.map((t) => {
                const locked = t.value === "sa" && !saEnabled;
                return (
                  <button
                    key={t.value}
                    role="tab"
                    aria-selected={media === t.value}
                    aria-disabled={locked}
                    onClick={() => !locked && setMedia(t.value)}
                    title={locked ? "SA API 를 연동하면 열립니다" : undefined}
                    className={cn(
                      "flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors",
                      media === t.value
                        ? "bg-surface text-ink shadow-sm"
                        : locked ? "cursor-not-allowed text-ink-faint" : "text-ink-muted hover:text-ink",
                    )}
                  >
                    {t.label}
                    {locked && <span className="hidden rounded bg-surface px-1 text-[10px] font-normal sm:inline">연동 예정</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title, description, actions,
}: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-xs text-ink-faint">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
