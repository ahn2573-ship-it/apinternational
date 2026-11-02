import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ChevronLeft, Plus, RotateCcw, Search, X } from "lucide-react";
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useAppState } from "@/hooks/useAppState";
import { api } from "@/lib/supabase";
import { addDays, diffDays, seoulToday } from "@/lib/dateRange";
import { compact, decimal, num, pct, roasPct, shortDate, won } from "@/lib/format";
import { cn } from "@/lib/cn";
import { BrandDot, brandColor } from "@/lib/brand";
import { PageHeader } from "@/components/layout/AppShell";
import { PeriodFilter } from "@/components/layout/PeriodFilter";
import { Badge, Card, CardHeader, EmptyState, Input, Skeleton } from "@/components/ui";
import {
  ALL_BRANDS, COMPARE_LEVEL_LABEL, MEDIA_SHORT,
  type AdAccount, type CompareDay, type CompareItem, type CompareLevel,
} from "@/lib/types";

const MAX_SLOTS = 4;
const LETTERS = ["A", "B", "C", "D"];
/** 비교 칸 색 (브랜드 색과 겹치지 않게 따로 둔다) */
const SLOT_COLORS = ["#2F5FE0", "#E0892F", "#9B3FC7", "#2A9D8F"];
const SLOT_DASH = ["", "6 4", "2 3", "10 3 2 3"];
const LEVELS: CompareLevel[] = ["campaign", "adgroup", "creative"];

interface Slot {
  key: number;
  brandId: string;
  item: CompareItem | null;
  /** 검색 결과가 오면 몇 번째 항목을 자동으로 고를지 (null = 고르지 않음) */
  autoPick: number | null;
  /** true 면 칸 고유 기간, false 면 위의 기본 기간을 따른다 */
  custom: boolean;
  from: string;
  to: string;
}

interface Totals {
  days: number;
  impressions: number; clicks: number; cost: number;
  conv_count: number; conv_revenue: number;
  total_conv_count: number; total_conv_revenue: number;
  rank: number | null;
}

const div = (a: number, b: number) => (b ? a / b : 0);

function sumDays(rows: CompareDay[]): Totals {
  const t = rows.reduce((a, r) => {
    a.impressions += Number(r.impressions); a.clicks += Number(r.clicks); a.cost += Number(r.cost);
    a.conv_count += Number(r.conv_count); a.conv_revenue += Number(r.conv_revenue);
    a.total_conv_count += Number(r.total_conv_count); a.total_conv_revenue += Number(r.total_conv_revenue);
    a.rw += Number(r.rank_weight); a.ri += Number(r.rank_impressions);
    return a;
  }, {
    impressions: 0, clicks: 0, cost: 0, conv_count: 0, conv_revenue: 0,
    total_conv_count: 0, total_conv_revenue: 0, rw: 0, ri: 0,
  });
  return { ...t, days: rows.length, rank: t.ri ? t.rw / t.ri : null };
}

const itemKey = (i: CompareItem) => `${i.media}|${i.campaign_id}|${i.adgroup_id ?? ""}|${i.creative_id ?? ""}`;
const rangeText = (from: string, to: string) => (from === to ? shortDate(from) : `${shortDate(from)} ~ ${shortDate(to)}`);

// ---------------------------------------------------------------------------
// 비교 칸 하나: 브랜드 토글 · 검색 · 항목 선택 · 기간
// ---------------------------------------------------------------------------
function SlotCard({
  index, slot, level, accounts, baseFrom, baseTo, onChange, onRemove,
}: {
  index: number; slot: Slot; level: CompareLevel; accounts: AdAccount[];
  baseFrom: string; baseTo: string;
  onChange: (patch: Partial<Slot>) => void; onRemove?: () => void;
}) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);
  useEffect(() => { setInput(""); setQuery(""); }, [slot.brandId, level]);

  const search = useQuery({
    queryKey: ["compare-search", slot.brandId, level, query],
    queryFn: () => api.compareSearch(slot.brandId, level, query),
    enabled: Boolean(slot.brandId),
  });

  // 처음 열었을 때 · 단위나 브랜드를 바꿨을 때 광고비 큰 항목을 자동으로 채운다
  useEffect(() => {
    if (slot.autoPick === null || !search.data || query) return;
    const pick = search.data[Math.min(slot.autoPick, search.data.length - 1)] ?? null;
    onChange({ item: pick, autoPick: null });
  }, [search.data, slot.autoPick, query]); // eslint-disable-line react-hooks/exhaustive-deps

  const color = SLOT_COLORS[index];
  const from = slot.custom ? slot.from : baseFrom;
  const to = slot.custom ? slot.to : baseTo;
  const today = seoulToday();

  const setPeriod = (f: string, t: string) => {
    const nf = f > today ? today : f;
    const nt = t > today ? today : t < nf ? nf : t;
    onChange({ custom: true, from: nf, to: nt });
  };
  const span = diffDays(from, to) + 1;

  return (
    <div className="card relative flex min-w-0 flex-col" style={{ borderTop: `3px solid ${color}` }}>
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute right-2 top-2 rounded p-1 text-ink-faint hover:bg-surface-sunken hover:text-ink"
          aria-label={`${LETTERS[index]} 비교 빼기`}
          title="이 칸 빼기"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <div className="px-3 pb-2 pt-3 pr-8">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span className="rounded px-1.5 text-xs text-white" style={{ background: color }}>{LETTERS[index]}</span>
          <span className="truncate" title={slot.item?.name}>{slot.item?.name ?? `${COMPARE_LEVEL_LABEL[level]}을 고르세요`}</span>
        </p>
        {slot.item?.parent_name && (
          <p className="mt-0.5 truncate text-2xs text-ink-faint" title={slot.item.parent_name}>{slot.item.parent_name}</p>
        )}
      </div>

      {/* 브랜드 */}
      <div className="px-3">
        <div className="flex flex-wrap gap-0.5 rounded-md border border-line bg-surface-sunken p-0.5" role="tablist" aria-label={`${LETTERS[index]} 브랜드`}>
          {accounts.map((b) => (
            <button
              key={b.id}
              role="tab"
              aria-selected={slot.brandId === b.id}
              onClick={() => slot.brandId !== b.id && onChange({ brandId: b.id, item: null, autoPick: 0 })}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-0.5 text-2xs font-medium transition-colors",
                slot.brandId === b.id ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
              )}
            >
              <BrandDot color={brandColor(accounts, b.id)} /> {b.name}
            </button>
          ))}
        </div>
      </div>

      {/* 검색 + 목록 */}
      <div className="px-3 pt-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-ink-faint" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`${COMPARE_LEVEL_LABEL[level]} 이름 · ID 검색`}
            className="h-8 w-full pl-7 text-xs"
          />
        </div>
        <div className="mt-1 h-36 overflow-y-auto rounded-md border border-line">
          {search.isLoading ? (
            <div className="space-y-1 p-2"><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /></div>
          ) : (search.data ?? []).length === 0 ? (
            <p className="p-3 text-center text-2xs text-ink-faint">
              {query ? "검색 결과가 없습니다" : "이 브랜드에 올린 데이터가 없습니다"}
            </p>
          ) : (
            (search.data ?? []).map((it) => {
              const active = slot.item && itemKey(slot.item) === itemKey(it);
              return (
                <button
                  key={itemKey(it)}
                  onClick={() => onChange({ item: it, autoPick: null })}
                  className={cn(
                    "block w-full border-b border-line px-2 py-1.5 text-left last:border-b-0",
                    active ? "bg-brand-50" : "hover:bg-surface-sunken",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <span className={cn("truncate text-xs", active ? "font-semibold text-brand-700" : "text-ink")} title={it.name}>
                      {it.name}
                    </span>
                    <Badge tone={it.media === "sa" ? "brand" : "good"}>{MEDIA_SHORT[it.media]}</Badge>
                  </span>
                  <span className="block truncate text-[10px] text-ink-faint">
                    {it.parent_name ? `${it.parent_name} · ` : ""}90일 {won(it.cost_90d)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 기간 */}
      <div className="mt-auto px-3 pb-3 pt-2">
        <div className="flex items-center justify-between">
          <p className="text-2xs text-ink-faint">
            기간 · {slot.custom ? <b className="text-ink">직접 지정</b> : "기본 기간"} · {span}일
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPeriod(addDays(from, -span), addDays(from, -1))}
              className="flex items-center rounded px-1 text-2xs text-brand-700 hover:bg-brand-50"
              title="같은 길이만큼 바로 앞 기간으로"
            >
              <ChevronLeft className="h-3 w-3" />직전 기간
            </button>
            {slot.custom && (
              <button
                onClick={() => onChange({ custom: false })}
                className="flex items-center gap-0.5 rounded px-1 text-2xs text-ink-muted hover:bg-surface-sunken"
                title="위의 기본 기간을 따르게 되돌리기"
              >
                <RotateCcw className="h-3 w-3" />기본
              </button>
            )}
          </div>
        </div>
        <div className="mt-1 flex items-center gap-1">
          <Input type="date" value={from} max={today} className="h-7 min-w-0 flex-1 px-1.5 text-2xs"
            onChange={(e) => e.target.value && setPeriod(e.target.value, to)} aria-label={`${LETTERS[index]} 시작일`} />
          <span className="text-2xs text-ink-faint">~</span>
          <Input type="date" value={to} min={from} max={today} className="h-7 min-w-0 flex-1 px-1.5 text-2xs"
            onChange={(e) => e.target.value && setPeriod(from, e.target.value)} aria-label={`${LETTERS[index]} 종료일`} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 지표 비교표
// ---------------------------------------------------------------------------
type Better = "high" | "low" | null;
interface MetricRow {
  label: string;
  value: (t: Totals) => number | null;
  fmt: (v: number) => string;
  better: Better;
  /** A 대비 증감을 보여 줄지 */
  delta?: boolean;
}

const ROWS: MetricRow[] = [
  { label: "노출수", value: (t) => t.impressions, fmt: num, better: null, delta: true },
  { label: "클릭수", value: (t) => t.clicks, fmt: num, better: null, delta: true },
  { label: "CTR", value: (t) => div(t.clicks, t.impressions), fmt: (v) => pct(v), better: "high", delta: true },
  { label: "광고비", value: (t) => t.cost, fmt: won, better: null, delta: true },
  { label: "일평균 광고비", value: (t) => div(t.cost, t.days), fmt: won, better: null, delta: true },
  { label: "CPC", value: (t) => div(t.cost, t.clicks), fmt: won, better: "low", delta: true },
  { label: "구매완료 수", value: (t) => t.conv_count, fmt: num, better: null, delta: true },
  { label: "구매완료 매출", value: (t) => t.conv_revenue, fmt: won, better: null, delta: true },
  { label: "전환율 (구매 ÷ 클릭)", value: (t) => div(t.conv_count, t.clicks), fmt: (v) => pct(v), better: "high", delta: true },
  { label: "구매완료 ROAS", value: (t) => div(t.conv_revenue, t.cost), fmt: (v) => roasPct(v), better: "high", delta: true },
  { label: "총 전환 ROAS", value: (t) => div(t.total_conv_revenue, t.cost), fmt: (v) => roasPct(v), better: "high", delta: true },
];
const RANK_ROW: MetricRow = {
  label: "평균 노출순위 (SA)", value: (t) => t.rank, fmt: (v) => decimal(v, 1), better: "low",
};

function CompareTable({
  slots, totals, loading,
}: { slots: Slot[]; totals: Array<Totals | null>; loading: boolean[] }) {
  const rows = totals.some((t) => t?.rank) ? [...ROWS, RANK_ROW] : ROWS;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="지표 비교"
        description="비율 지표(CTR · CPC · 전환율 · ROAS)는 가장 좋은 칸을 초록색으로 표시합니다. 괄호는 A 대비 증감입니다"
      />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th w-44">지표</th>
              {slots.map((s, i) => (
                <th key={s.key} className="th text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="rounded px-1.5 text-white" style={{ background: SLOT_COLORS[i] }}>{LETTERS[i]}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="td text-ink-muted">기간</td>
              {slots.map((s, i) => (
                <td key={s.key} className="td text-right text-xs">
                  {totals[i] ? `${rangeText(s.from, s.to)} (${totals[i]!.days}일)` : "—"}
                </td>
              ))}
            </tr>
            {rows.map((row) => {
              const vals = totals.map((t) => (t ? row.value(t) : null));
              const present = vals.filter((v): v is number => v !== null);
              let best = -1;
              if (row.better && present.length > 1) {
                const target = row.better === "high" ? Math.max(...present) : Math.min(...present);
                const hits = vals.filter((v) => v === target).length;
                if (hits === 1 && (row.better === "low" ? target > 0 : true)) best = vals.indexOf(target);
              }
              const base = vals[0];
              return (
                <tr key={row.label}>
                  <td className="td text-ink-muted">{row.label}</td>
                  {vals.map((v, i) => {
                    const d = row.delta && i > 0 && v !== null && base ? (v - base) / base : null;
                    return (
                      <td key={slots[i].key} className={cn("td text-right", i === best && "bg-good-soft font-semibold text-good")}>
                        {loading[i] ? <span className="text-ink-faint">…</span> : v === null ? "—" : row.fmt(v)}
                        {d !== null && Number.isFinite(d) && (
                          <span className="ml-1 text-2xs font-normal text-ink-faint">
                            ({d > 0 ? "+" : ""}{(d * 100).toFixed(0)}%)
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 일별 추이 (칸마다 기간이 다르면 "1일차, 2일차…" 로 맞춰서 겹친다)
// ---------------------------------------------------------------------------
type ChartMetric = "ctr" | "cpc" | "cost" | "clicks" | "conv_revenue" | "conv_roas";
const CHART_METRICS: Array<{ key: ChartMetric; label: string }> = [
  { key: "ctr", label: "CTR" },
  { key: "cpc", label: "CPC" },
  { key: "cost", label: "광고비" },
  { key: "clicks", label: "클릭수" },
  { key: "conv_revenue", label: "구매완료 매출" },
  { key: "conv_roas", label: "구매완료 ROAS" },
];

function dayValue(r: CompareDay, m: ChartMetric): number | null {
  const n = (v: number) => Number(v);
  switch (m) {
    case "ctr": return n(r.impressions) ? n(r.clicks) / n(r.impressions) : null;
    case "cpc": return n(r.clicks) ? n(r.cost) / n(r.clicks) : null;
    case "conv_roas": return n(r.cost) ? n(r.conv_revenue) / n(r.cost) : null;
    default: return n(r[m]);
  }
}

function fmtMetric(m: ChartMetric, v: number) {
  if (m === "ctr") return pct(v);
  if (m === "conv_roas") return roasPct(v);
  if (m === "clicks") return num(v);
  return won(v);
}

function CompareChart({
  slots, series, names,
}: { slots: Slot[]; series: Array<CompareDay[] | undefined>; names: string[] }) {
  const [metric, setMetric] = useState<ChartMetric>("ctr");
  const sameRange = slots.every((s) => s.from === slots[0].from && s.to === slots[0].to);
  const length = Math.max(0, ...series.map((s) => s?.length ?? 0));

  const data = useMemo(() => Array.from({ length }, (_, d) => {
    const row: Record<string, string | number | null> = {
      x: sameRange ? (series.find((s) => s?.[d])?.[d]?.stat_date ?? "") : `${d + 1}일차`,
    };
    series.forEach((s, i) => {
      const r = s?.[d];
      row[`s${i}`] = r ? dayValue(r, metric) : null;
      row[`d${i}`] = r?.stat_date ?? null;
    });
    return row;
  }), [series, metric, length, sameRange]);

  const empty = series.every((s) => !s || s.every((r) => !Number(r.impressions) && !Number(r.cost)));

  return (
    <Card>
      <CardHeader
        title="일별 추이"
        description={sameRange ? "같은 기간 · 날짜별로 겹쳐 봅니다" : "칸마다 기간이 달라 시작일부터 1일차, 2일차…로 맞춰 겹쳤습니다"}
        action={
          <div className="flex flex-wrap items-center rounded-md border border-line bg-surface-sunken p-0.5" role="tablist" aria-label="그래프 지표">
            {CHART_METRICS.map((m) => (
              <button
                key={m.key}
                role="tab"
                aria-selected={metric === m.key}
                onClick={() => setMetric(m.key)}
                className={cn(
                  "rounded px-2 py-0.5 text-2xs font-medium transition-colors",
                  metric === m.key ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        }
      />
      <div className="p-3" style={{ height: 300 }}>
        {empty ? (
          <EmptyState title="선택한 기간에 데이터가 없습니다" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
              <CartesianGrid stroke="#E3E5EC" vertical={false} />
              <XAxis dataKey="x" tick={{ fontSize: 11, fill: "#8C90A0" }} tickLine={false}
                axisLine={{ stroke: "#E3E5EC" }} tickFormatter={(v: string) => (sameRange ? shortDate(v) : v)} />
              <YAxis tick={{ fontSize: 11, fill: "#8C90A0" }} tickLine={false} axisLine={false} width={56}
                tickFormatter={(v: number) => metric === "ctr" ? pct(v, 1)
                  : metric === "conv_roas" ? `${Math.round(v * 100)}%` : compact(v)} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #E3E5EC" }}
                formatter={(v: number, key: string, item) => {
                  const i = Number(key.slice(1));
                  const date = (item?.payload as Record<string, string> | undefined)?.[`d${i}`];
                  return [fmtMetric(metric, v), `${LETTERS[i]}${!sameRange && date ? ` (${shortDate(date)})` : ""}`];
                }}
                labelFormatter={(l: string) => (sameRange ? l : l)}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => {
                const i = Number(v.slice(1));
                return `${LETTERS[i]} · ${names[i] ?? ""}`;
              }} />
              {slots.map((s, i) => (
                <Line
                  key={s.key}
                  dataKey={`s${i}`}
                  stroke={SLOT_COLORS[i]}
                  strokeDasharray={SLOT_DASH[i]}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 페이지
// ---------------------------------------------------------------------------
export function Compare() {
  const { accounts, accountId, range } = useAppState();
  const [level, setLevel] = useState<CompareLevel>("creative");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [nextKey, setNextKey] = useState(2);

  // 처음: A · B 를 상단에서 고른 브랜드(전체면 첫 브랜드)의 광고비 1·2위로 채운다
  const defaultBrand = accountId && accountId !== ALL_BRANDS ? accountId : accounts[0]?.id ?? "";
  useEffect(() => {
    if (slots.length || !defaultBrand) return;
    setSlots([0, 1].map((i) => ({
      key: i, brandId: defaultBrand, item: null, autoPick: i, custom: false, from: range.from, to: range.to,
    })));
  }, [defaultBrand]); // eslint-disable-line react-hooks/exhaustive-deps

  // 기본 기간을 따르는 칸은 위의 기간이 바뀌면 같이 바뀐다
  const view = slots.map((s) => (s.custom ? s : { ...s, from: range.from, to: range.to }));

  const patch = (key: number, p: Partial<Slot>) =>
    setSlots((list) => list.map((s) => {
      if (s.key !== key) return s;
      const next = { ...s, ...p };
      // 칸 기간을 처음 직접 지정할 때 기본 기간에서 출발
      if (p.custom && !s.custom && (p.from === undefined || p.to === undefined)) {
        next.from = p.from ?? range.from;
        next.to = p.to ?? range.to;
      }
      return next;
    }));

  function changeLevel(lv: CompareLevel) {
    if (lv === level) return;
    setLevel(lv);
    setSlots((list) => list.map((s, i) => ({ ...s, item: null, autoPick: i })));
  }

  function addSlot() {
    if (slots.length >= MAX_SLOTS) return;
    const last = slots[slots.length - 1];
    const sameBrand = slots.filter((s) => s.brandId === last.brandId).length;
    setSlots([...slots, {
      key: nextKey, brandId: last.brandId, item: null, autoPick: sameBrand,
      custom: last.custom, from: last.from, to: last.to,
    }]);
    setNextKey(nextKey + 1);
  }

  const dailies = useQueries({
    queries: view.map((s) => ({
      queryKey: ["compare-daily", s.brandId, s.item && itemKey(s.item), s.from, s.to],
      queryFn: () => api.compareDaily(s.brandId, s.item!, s.from, s.to),
      enabled: Boolean(s.item),
    })),
  });

  const totals = dailies.map((q, i) => (view[i].item && q.data ? sumDays(q.data) : null));
  const loading = dailies.map((q, i) => Boolean(view[i].item) && q.isLoading);
  const names = view.map((s) => s.item?.name ?? "");

  if (!accounts.length) {
    return <Skeleton className="h-64 w-full rounded-lg" />;
  }

  return (
    <>
      <PageHeader
        title="성과 비교"
        description="브랜드와 캠페인 · 세트 · 소재를 골라 최대 4개까지 나란히 비교합니다. 칸마다 기간을 따로 정할 수 있습니다"
      />

      <PeriodFilter showCompare={false} />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-md border border-line bg-surface-sunken p-0.5" role="tablist" aria-label="비교 단위">
          {LEVELS.map((lv) => (
            <button
              key={lv}
              role="tab"
              aria-selected={level === lv}
              onClick={() => changeLevel(lv)}
              className={cn(
                "rounded px-3 py-1 text-xs font-medium transition-colors",
                level === lv ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
              )}
            >
              {COMPARE_LEVEL_LABEL[lv]}끼리
            </button>
          ))}
        </div>
        <p className="text-2xs text-ink-faint">
          위의 기간은 "기본 기간"입니다. 칸에서 날짜를 바꾸거나 "직전 기간"을 누르면 그 칸만 따로 정해집니다
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {view.map((s, i) => (
          <SlotCard
            key={s.key}
            index={i}
            slot={s}
            level={level}
            accounts={accounts}
            baseFrom={range.from}
            baseTo={range.to}
            onChange={(p) => patch(s.key, p)}
            onRemove={i >= 2 ? () => setSlots(slots.filter((x) => x.key !== s.key)) : undefined}
          />
        ))}
        {slots.length > 0 && slots.length < MAX_SLOTS && (
          <button
            onClick={addSlot}
            className="flex min-h-[200px] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line text-sm text-ink-muted transition-colors hover:border-brand-500 hover:bg-surface-sunken hover:text-ink"
          >
            <Plus className="h-5 w-5" />
            비교 추가
            <span className="text-2xs text-ink-faint">{slots.length} / {MAX_SLOTS}</span>
          </button>
        )}
      </div>

      <div className="mt-4">
        <CompareTable slots={view} totals={totals} loading={loading} />
      </div>

      <div className="mt-4">
        <CompareChart slots={view} series={dailies.map((q, i) => (view[i].item ? q.data : undefined))} names={names} />
      </div>

      <p className="mt-4 text-2xs text-ink-faint">
        모든 비율은 기간 합계로 다시 계산합니다 (일별 비율의 평균이 아님). 칸마다 기간 길이가 다르면 노출수 · 광고비 같은 합계는
        일수 차이를 감안해서 보세요 — "일평균 광고비" 행을 참고하면 됩니다.
        클릭 · 전환 수가 적으면 차이가 우연일 수 있습니다.
      </p>
    </>
  );
}
