export type UserRole = "admin" | "viewer";

/** 광고 매체: sa = 네이버 검색광고(API 자동 수집), gfa = 네이버 GFA(RAW 업로드) */
export type Media = "sa" | "gfa";

/** 화면에서 보는 단위: total = SA + GFA 합산 */
export type View = Media | "total";

/** 분석 단위: (브랜드) → 캠페인 → 세트(광고그룹) → 소재. brand 는 "전체 브랜드"에서만 쓴다 */
export type Level = "brand" | "campaign" | "adgroup" | "creative";

/** 상단 브랜드 탭: "all" = 전체 브랜드 합산, 그 외는 ad_accounts.id */
export const ALL_BRANDS = "all";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
}

export interface AdAccount {
  id: string;
  name: string;
  platform: string;
  customer_id: string | null;
  account_id: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
}

/** 모든 집계가 공유하는 지표 묶음 */
export interface MetricBundle {
  impressions: number;
  clicks: number;
  cost: number;
  conv_count: number;
  conv_revenue: number;
  total_conv_count: number;
  total_conv_revenue: number;
  cart_count: number;
  cart_revenue: number;
  ctr: number;
  cpc: number;
  conv_roas: number;
  total_roas: number;
  cart_roas: number;
}

export interface PeriodSummary extends MetricBundle {
  avg_rank: number | null;
}

export interface DailyPoint extends MetricBundle {
  stat_date: string;
}

export interface BreakdownRow extends MetricBundle {
  ad_account_id: string;
  brand_name: string;
  /** brand 단위 행은 조회 중인 매체("total" 포함)가 들어온다 */
  media: View;
  campaign_id: string;
  campaign_name: string;
  campaign_type: string | null;
  adgroup_id: string | null;
  adgroup_name: string | null;
  creative_id: string | null;
  creative_name: string | null;
  product_name: string | null;
  child_count: number;
  avg_rank: number | null;
}

export interface SyncLog {
  id: string;
  stat_date: string | null;
  status: "running" | "success" | "partial" | "failed";
  mode: string;
  rows_fetched: number;
  rows_upserted: number;
  attempt: number;
  duration_ms: number | null;
  message: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface RawRow {
  id: string;
  ad_account_id: string;
  brand_name: string;
  media: Media;
  stat_date: string;
  campaign_id: string;
  adgroup_id: string;
  creative_id: string;
  campaign_name: string | null;
  adgroup_name: string | null;
  creative_name: string | null;
  campaign_type: string | null;
  impressions: number;
  clicks: number;
  cost: number;
  avg_rank: number | null;
  conv_count: number;
  conv_revenue: number;
  total_conv_count: number;
  total_conv_revenue: number;
  cart_count: number;
  cart_revenue: number;
  source: string;
}

/** SA 캠페인 유형 코드 → 이름 */
export const CAMPAIGN_TYPE_LABEL: Record<string, string> = {
  "01": "파워링크",
  "02": "쇼핑검색",
  "03": "파워컨텐츠",
  "04": "브랜드검색",
  "05": "플레이스",
};

export const campaignTypeLabel = (code: string | null | undefined) =>
  code ? CAMPAIGN_TYPE_LABEL[code] ?? `유형 ${code}` : "";

export const MEDIA_LABEL: Record<View, string> = {
  total: "전체 (SA+GFA)",
  sa: "네이버 SA",
  gfa: "네이버 GFA",
};

export const MEDIA_SHORT: Record<View, string> = { sa: "SA", gfa: "GFA", total: "SA+GFA" };

export const LEVEL_LABEL: Record<Level, string> = {
  brand: "브랜드",
  campaign: "캠페인",
  adgroup: "세트",
  creative: "소재·상품",
};

// ---------------------------------------------------------------------------
// 성과 비교
// ---------------------------------------------------------------------------
/** 비교 단위 */
export type CompareLevel = "campaign" | "adgroup" | "creative";

export const COMPARE_LEVEL_LABEL: Record<CompareLevel, string> = {
  campaign: "캠페인",
  adgroup: "세트",
  creative: "소재",
};

/** 비교할 수 있는 항목 하나 (검색 결과) */
export interface CompareItem {
  media: Media;
  campaign_id: string;
  adgroup_id: string | null;
  creative_id: string | null;
  name: string;
  parent_name: string | null;
  cost_90d: number;
  last_date: string | null;
}

/** 항목의 하루 성과 (합계 · 비율은 화면에서 다시 계산) */
export interface CompareDay {
  stat_date: string;
  impressions: number;
  clicks: number;
  cost: number;
  conv_count: number;
  conv_revenue: number;
  total_conv_count: number;
  total_conv_revenue: number;
  cart_count: number;
  cart_revenue: number;
  rank_weight: number;
  rank_impressions: number;
}
