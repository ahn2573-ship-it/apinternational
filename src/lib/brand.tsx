import type { AdAccount } from "./types";

// 콘솔 이름 — 화면 왼쪽 위, 로그인 화면, 엑셀 파일명에 쓰인다.
export const BRAND_NAME = "에이피인터내셔널";

// 브랜드 색을 DB(ad_accounts.color)에 안 넣었을 때 순서대로 쓰는 색
const FALLBACK = ["#6D5BD0", "#12936B", "#D9622B", "#2F7FD0", "#C23B7A", "#8A6D0B"];

/** 브랜드 고정 색. 모든 화면에서 같은 브랜드는 같은 색으로 보인다. */
export function brandColor(accounts: AdAccount[], id: string | null | undefined): string {
  const i = accounts.findIndex((a) => a.id === id);
  if (i < 0) return "#8C90A0";
  return accounts[i].color || FALLBACK[i % FALLBACK.length];
}

/** 브랜드 이름 앞에 붙는 색 점 */
export function BrandDot({ color, className = "" }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${className}`}
      style={{ background: color }}
    />
  );
}
