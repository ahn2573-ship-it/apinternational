import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Upload } from "lucide-react";
import { useAppState } from "@/hooks/useAppState";
import { api, supabase } from "@/lib/supabase";
import {
  GFA_SOURCE, mergeFiles, parseGfaFile, type GfaKind, type GfaLevel, type GfaParsedRow,
} from "@/lib/gfa";
import { addDays, seoulToday } from "@/lib/dateRange";
import { num, won } from "@/lib/format";
import { cn } from "@/lib/cn";
import { BrandDot, brandColor } from "@/lib/brand";
import { ALL_BRANDS, type AdAccount } from "@/lib/types";
import { PageHeader } from "@/components/layout/AppShell";
import {
  Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, TableSkeleton,
} from "@/components/ui";

type Row = GfaParsedRow & { kind: GfaKind };

const KIND_LABEL: Record<GfaKind, string> = { creative: "일반 소재 리포트", advoost: "ADVoost 상품 리포트" };

interface Preview {
  /** 이 파일들을 반영할 브랜드 (= 올린 칸) */
  brandId: string;
  files: Array<{ name: string; kind: GfaKind; level: GfaLevel; rows: number; skipped: number; cost: number }>;
  rows: Row[];
  dates: string[];
  cost: number;
  impressions: number;
  campaigns: number;
  adgroups: number;
  creatives: number;
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function dateLabel(dates: string[]) {
  if (!dates.length) return "";
  if (dates.length === 1) return dates[0];
  return `${dates[0]} ~ ${dates[dates.length - 1]} (${dates.length}일)`;
}

/** 브랜드 한 칸: 색 띠 + 최근 업로드 + 파일 놓는 곳 */
function BrandDropZone({
  brand, color, status, busy, parsingHere, selected, onFiles, onSelect,
}: {
  brand: AdAccount; color: string;
  status?: { last_date: string; last_uploaded_at: string; days: number };
  busy: boolean; parsingHere: boolean; selected: boolean;
  onFiles: (files: File[]) => void; onSelect: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={cn("card overflow-hidden transition-shadow", selected && "ring-2 ring-offset-1")}
      style={{ borderTop: `3px solid ${color}`, ...(selected ? { ["--tw-ring-color" as string]: color } : {}) }}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-start justify-between gap-2 px-4 pb-2 pt-3 text-left"
        title="이 브랜드의 업로드 현황 보기"
      >
        <span>
          <span className="flex items-center gap-2 text-sm font-semibold">
            <BrandDot color={color} /> {brand.name} GFA
          </span>
          <span className={cn("mt-0.5 block text-2xs", status ? "text-ink-faint" : "text-warn")}>
            {status
              ? `마지막 데이터 ${status.last_date} · ${num(status.days)}일치 · 반영 ${new Date(status.last_uploaded_at)
                .toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`
              : "아직 올린 파일이 없습니다"}
          </span>
        </span>
      </button>
      <div className="px-4 pb-4">
        <input
          ref={ref} type="file" accept=".csv,.xlsx,.xls" multiple className="hidden"
          onChange={(e) => {
            const fs = Array.from(e.target.files ?? []);
            if (fs.length) onFiles(fs);
            e.target.value = "";
          }}
        />
        <div
          role="button"
          tabIndex={0}
          aria-label={`${brand.name} GFA 파일 올리기`}
          onClick={() => !busy && ref.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") ref.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (busy) return;
            const fs = Array.from(e.dataTransfer.files ?? []).filter((f) => /\.(csv|xlsx|xls)$/i.test(f.name));
            if (fs.length) onFiles(fs);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-7 text-center transition-colors",
            dragging ? "bg-surface-sunken" : "border-line hover:bg-surface-sunken",
            busy && "pointer-events-none opacity-60",
          )}
          style={dragging ? { borderColor: color } : undefined}
        >
          <Upload className="h-5 w-5 text-ink-faint" />
          <p className="text-xs font-medium">
            {parsingHere ? "파일 읽는 중…" : `${brand.name} 파일을 끌어다 놓거나 클릭`}
          </p>
        </div>
      </div>
    </div>
  );
}

export function GfaUpload() {
  const { accounts, accountId: selectedBrand } = useAppState();
  const qc = useQueryClient();
  // 아래쪽 "업로드 현황 · 삭제"가 보여 줄 브랜드. 상단에서 브랜드를 골라 왔으면 그 브랜드부터
  const [viewBrand, setViewBrand] = useState<string | null>(
    selectedBrand && selectedBrand !== ALL_BRANDS ? selectedBrand : null,
  );
  // 상단 브랜드 탭을 바꾸면 아래 현황 · 삭제도 그 브랜드로 따라간다
  useEffect(() => {
    if (selectedBrand && selectedBrand !== ALL_BRANDS) setViewBrand(selectedBrand);
  }, [selectedBrand]);
  const accountId = viewBrand ?? accounts[0]?.id ?? null;
  const viewName = accounts.find((a) => a.id === accountId)?.name ?? "";
  const [parsing, setParsing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [replace, setReplace] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  // 삭제
  const [delFrom, setDelFrom] = useState(addDays(seoulToday(), -1));
  const [delTo, setDelTo] = useState(addDays(seoulToday(), -1));
  const [confirmDel, setConfirmDel] = useState<{ from: string; to: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const listFrom = addDays(seoulToday(), -90);
  const brandStatus = useQuery({ queryKey: ["gfa-brand-status"], queryFn: api.gfaBrandStatus });
  const statusById = new Map((brandStatus.data ?? []).map((r) => [r.ad_account_id, r]));

  const dates = useQuery({
    queryKey: ["gfa-dates", accountId, listFrom],
    queryFn: () => api.mediaDates(accountId!, "gfa", listFrom, seoulToday()),
    enabled: Boolean(accountId),
  });

  async function readFiles(files: File[], brandId: string) {
    setViewBrand(brandId);
    setParsing(brandId);
    setMessage(null);
    setPreview(null);
    try {
      const results: Array<{ kind: GfaKind; rows: GfaParsedRow[] }> = [];
      const info: Preview["files"] = [];
      const problems: string[] = [];
      for (const f of files) {
        const res = await parseGfaFile(f);
        if (res.periodTotal) {
          problems.push(`${f.name}: 기간 합계 리포트입니다. GFA 에서 "일별"로 다시 받아 주세요.`);
          continue;
        }
        if (res.missingColumns.length) {
          problems.push(`${f.name}: 필요한 열이 없습니다 — ${res.missingColumns.join(", ")}`);
          continue;
        }
        if (!res.rows.length) {
          problems.push(`${f.name}: 읽을 수 있는 행이 없습니다.`);
          continue;
        }
        results.push({ kind: res.kind, rows: res.rows });
        info.push({
          name: f.name, kind: res.kind, level: res.level, rows: res.rows.length, skipped: res.skipped,
          cost: res.rows.reduce((a, r) => a + r.cost, 0),
        });
      }
      if (problems.length && !results.length) {
        setMessage({ tone: "bad", text: problems.join("\n") });
        return;
      }
      const rows = mergeFiles(results);
      setPreview({
        brandId,
        files: info,
        rows,
        dates: [...new Set(rows.map((r) => r.stat_date))].sort(),
        cost: rows.reduce((a, r) => a + r.cost, 0),
        impressions: rows.reduce((a, r) => a + r.impressions, 0),
        campaigns: new Set(rows.map((r) => r.campaign_id)).size,
        adgroups: new Set(rows.filter((r) => r.adgroup_id !== "-").map((r) => r.adgroup_id)).size,
        creatives: new Set(rows.filter((r) => r.creative_id !== "-").map((r) => r.creative_id)).size,
      });
      if (problems.length) setMessage({ tone: "bad", text: `일부 파일은 제외했습니다.\n${problems.join("\n")}` });
    } catch (e) {
      setMessage({ tone: "bad", text: e instanceof Error ? e.message : "파일을 읽지 못했습니다." });
    } finally {
      setParsing(null);
    }
  }

  async function save() {
    if (!preview) return;
    // 반영 대상 = 파일을 올린 브랜드 칸 (아래쪽에서 보고 있는 브랜드와 무관)
    const accountId = preview.brandId;
    const brandName = accounts.find((a) => a.id === accountId)?.name ?? "";
    setSaving(true);
    setMessage(null);
    try {
      const now = new Date().toISOString();
      const { rows } = preview;

      // 1) 이름표 (같은 ID 는 나중 날짜의 이름으로)
      const sorted = [...rows].sort((a, b) => a.stat_date.localeCompare(b.stat_date));
      const camp = new Map<string, Record<string, unknown>>();
      const grp = new Map<string, Record<string, unknown>>();
      const cre = new Map<string, Record<string, unknown>>();
      for (const r of sorted) {
        if (r.campaign_id !== "-") {
          camp.set(r.campaign_id, {
            ad_account_id: accountId, media: "gfa", campaign_id: r.campaign_id,
            name: r.campaign_name, updated_at: now,
          });
        }
        if (r.adgroup_id !== "-") {
          grp.set(r.adgroup_id, {
            ad_account_id: accountId, media: "gfa", adgroup_id: r.adgroup_id,
            campaign_id: r.campaign_id, name: r.adgroup_name, updated_at: now,
          });
        }
        if (r.creative_id !== "-") {
          const isProduct = r.kind === "advoost";
          cre.set(r.creative_id, {
            ad_account_id: accountId, media: "gfa", creative_id: r.creative_id,
            adgroup_id: r.adgroup_id, campaign_id: r.campaign_id, name: r.creative_name,
            product_name: isProduct ? r.creative_name : null,
            mall_product_id: isProduct ? r.creative_id.replace(/^p-/, "") : null,
            updated_at: now,
          });
        }
      }
      const upsert = async (table: string, onConflict: string, list: Record<string, unknown>[]) => {
        for (const part of chunks(list, 500)) {
          const { error } = await supabase.from(table).upsert(part, { onConflict });
          if (error) throw new Error(`${table}: ${error.message}`);
        }
      };
      await upsert("campaigns", "ad_account_id,media,campaign_id", [...camp.values()]);
      await upsert("adgroups", "ad_account_id,media,adgroup_id", [...grp.values()]);
      await upsert("creatives", "ad_account_id,media,creative_id", [...cre.values()]);

      // 2) 기존 데이터 정리 (선택) — 파일 종류별로만 교체한다.
      //    · 같은 종류 파일로 예전에 올린 그 날짜 데이터
      //    · 이번 파일에 들어 있는 캠페인의 그 날짜 데이터 (예전 방식으로 올라간 행 정리)
      //    → 일반 소재 파일과 ADVoost 파일을 따로 올려도 서로를 지우지 않는다.
      let removed = 0;
      if (replace) {
        const del = async (dates: string[], col: "source" | "campaign_id", values: string[]) => {
          for (const dPart of chunks(dates, 50)) {
            for (const vPart of chunks(values, 100)) {
              const { error, count } = await supabase.from("ad_performance_daily")
                .delete({ count: "exact" })
                .eq("ad_account_id", accountId).eq("media", "gfa")
                .in("stat_date", dPart).in(col, vPart);
              if (error) throw new Error(error.message);
              removed += count ?? 0;
            }
          }
        };
        for (const kind of ["creative", "advoost"] as GfaKind[]) {
          const part = rows.filter((r) => r.kind === kind);
          if (!part.length) continue;
          const dates = [...new Set(part.map((r) => r.stat_date))];
          await del(dates, "source", [GFA_SOURCE[kind]]);
          await del(dates, "campaign_id", [...new Set(part.map((r) => r.campaign_id))]);
        }
      }

      // 3) 성과 저장
      const payload = rows.map((r) => ({
        ad_account_id: accountId, media: "gfa", stat_date: r.stat_date,
        campaign_id: r.campaign_id, adgroup_id: r.adgroup_id, creative_id: r.creative_id,
        impressions: r.impressions, clicks: r.clicks, cost: r.cost,
        conv_count: r.conv_count, conv_revenue: r.conv_revenue,
        total_conv_count: r.total_conv_count, total_conv_revenue: r.total_conv_revenue,
        cart_count: r.cart_count, cart_revenue: r.cart_revenue,
        source: GFA_SOURCE[r.kind], updated_at: now,
      }));
      await upsert("ad_performance_daily", "ad_account_id,media,stat_date,campaign_id,adgroup_id,creative_id", payload);

      setMessage({
        tone: "ok",
        text: `${brandName} · ${dateLabel(preview.dates)} · ${num(payload.length)}건 반영 · 광고비 ${won(preview.cost)}` +
          (replace ? ` (기존 ${num(removed)}건 교체)` : ""),
      });
      setPreview(null);
      qc.invalidateQueries();
    } catch (e) {
      setMessage({ tone: "bad", text: e instanceof Error ? e.message : "저장에 실패했습니다." });
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!confirmDel || !accountId) return;
    setDeleting(true);
    try {
      const n = await api.deleteGfa(accountId, confirmDel.from, confirmDel.to);
      setMessage({
        tone: "ok",
        text: `${viewName} · ${confirmDel.from === confirmDel.to ? confirmDel.from : `${confirmDel.from} ~ ${confirmDel.to}`} GFA 데이터 ${num(n)}건을 삭제했습니다.`,
      });
      qc.invalidateQueries();
    } catch (e) {
      setMessage({ tone: "bad", text: e instanceof Error ? e.message : "삭제에 실패했습니다." });
    } finally {
      setDeleting(false);
      setConfirmDel(null);
    }
  }

  const busy = Boolean(parsing) || saving;
  const previewBrand = preview ? accounts.find((a) => a.id === preview.brandId) : undefined;
  const previewColor = preview ? brandColor(accounts, preview.brandId) : undefined;

  return (
    <>
      <PageHeader
        title="GFA 업로드"
        description="브랜드마다 칸이 따로 있습니다. 그 브랜드 광고계정에서 받은 일별 RAW 리포트(CSV · XLSX)를 해당 칸에 올리세요"
      />

      {message && (
        <div className={cn(
          "mb-3 whitespace-pre-line rounded-md border px-3 py-2 text-xs",
          message.tone === "ok" ? "border-good/30 bg-good-soft text-good" : "border-bad/30 bg-bad-soft text-bad",
        )}>
          {message.text}
        </div>
      )}

      {/* 브랜드별 업로드 칸 */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((b) => (
          <BrandDropZone
            key={b.id}
            brand={b}
            color={brandColor(accounts, b.id)}
            status={statusById.get(b.id)}
            busy={busy}
            parsingHere={parsing === b.id}
            selected={accountId === b.id}
            onFiles={(fs) => readFiles(fs, b.id)}
            onSelect={() => setViewBrand(b.id)}
          />
        ))}
      </div>

      <div className="mb-4 mt-3 space-y-1 text-xs text-ink-muted">
        <p className="text-2xs text-ink-faint">
          일반 소재 리포트 · ADVoost 상품 리포트 모두 가능 — 두 파일을 한 번에 올려도, 따로 올려도 됩니다.
          열 이름을 보고 캠페인 · 광고 그룹(세트) · 광고 소재와 지표를 자동으로 찾습니다.
        </p>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          <span>
            <b className="text-ink">같은 종류 파일로 올렸던 그 날짜 데이터를 지우고 새로 넣기 (권장)</b><br />
            해당 브랜드의 데이터만 교체합니다. 일반 소재 파일은 일반 소재 데이터만, ADVoost 파일은 ADVoost 데이터만 바뀝니다.
            같은 종류 파일을 캠페인별로 나눠 따로따로 올릴 때만 끄세요.
          </span>
        </label>
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          {preview && (
            <Card className="overflow-hidden" >
              <div style={{ borderTop: `3px solid ${previewColor}` }} />
              <CardHeader
                title={`반영 전 확인 · ${previewBrand?.name ?? ""}`}
                description="브랜드가 맞는지, 숫자가 GFA 화면과 맞는지 확인한 뒤 반영하세요"
              />
              <div className="grid grid-cols-2 gap-3 px-4 py-4 text-sm md:grid-cols-3">
                <div>
                  <p className="text-2xs text-ink-faint">반영할 브랜드</p>
                  <p className="flex items-center gap-1.5 font-semibold">
                    <BrandDot color={previewColor ?? "#888"} /> {previewBrand?.name}
                  </p>
                </div>
                <div><p className="text-2xs text-ink-faint">날짜</p><p className="font-medium">{dateLabel(preview.dates)}</p></div>
                <div><p className="text-2xs text-ink-faint">광고비 합계</p><p className="tnum font-medium">{won(preview.cost)}</p></div>
                <div><p className="text-2xs text-ink-faint">노출수 합계</p><p className="tnum font-medium">{num(preview.impressions)}</p></div>
                <div><p className="text-2xs text-ink-faint">캠페인</p><p className="tnum font-medium">{num(preview.campaigns)}개</p></div>
                <div><p className="text-2xs text-ink-faint">세트</p><p className="tnum font-medium">{num(preview.adgroups)}개</p></div>
                <div><p className="text-2xs text-ink-faint">소재·상품</p><p className="tnum font-medium">{num(preview.creatives)}개</p></div>
              </div>
              <ul className="border-t border-line px-4 py-2 text-2xs text-ink-muted">
                {preview.files.map((f) => (
                  <li key={f.name} className="py-0.5">
                    <b className="text-ink">{KIND_LABEL[f.kind]}</b> · {f.name} — {f.level} 단위 ·{" "}
                    {num(f.rows)}행 · 광고비 {won(f.cost)}{f.skipped ? ` · 건너뜀 ${num(f.skipped)}` : ""}
                    {f.kind === "advoost" && " · 캠페인 → ‘ADVoost 상품’ 세트 → 상품별로 들어갑니다"}
                    {f.level === "캠페인" && " · 세트/소재 구분 없이 캠페인 단위로만 보입니다"}
                  </li>
                ))}
              </ul>
              <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
                <Button onClick={() => setPreview(null)} disabled={saving}>취소</Button>
                <Button variant="primary" onClick={save} loading={saving}>{previewBrand?.name}에 반영하기</Button>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader
              title={`기간 지정 삭제 · ${viewName}`}
              description={`브랜드를 고르고 날짜 범위를 지정해 잘못 올린 GFA 데이터를 지웁니다. 고른 브랜드만 지워지고 다른 브랜드 · SA 데이터는 그대로입니다`}
            />
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="flex items-center rounded-md border border-line bg-surface-sunken p-0.5" role="tablist" aria-label="삭제할 브랜드">
                {accounts.map((b) => (
                  <button
                    key={b.id}
                    role="tab"
                    aria-selected={accountId === b.id}
                    onClick={() => setViewBrand(b.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                      accountId === b.id ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
                    )}
                  >
                    <BrandDot color={brandColor(accounts, b.id)} /> {b.name}
                  </button>
                ))}
              </div>
              <Input type="date" value={delFrom} max={seoulToday()}
                onChange={(e) => { setDelFrom(e.target.value); if (e.target.value > delTo) setDelTo(e.target.value); }}
                className="h-8 w-40 text-xs" />
              <span className="text-xs text-ink-faint">~</span>
              <Input type="date" value={delTo} min={delFrom} max={seoulToday()}
                onChange={(e) => setDelTo(e.target.value)} className="h-8 w-40 text-xs" />
              <Button variant="danger" size="sm" onClick={() => setConfirmDel({ from: delFrom, to: delTo })}>
                <Trash2 className="h-3.5 w-3.5" /> {viewName} 삭제
              </Button>
            </div>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">날짜별 업로드 현황</h2>
              <p className="mt-0.5 text-xs text-ink-faint">최근 90일</p>
            </div>
            <div className="flex items-center rounded-md border border-line bg-surface-sunken p-0.5" role="tablist" aria-label="현황 볼 브랜드">
              {accounts.map((b) => (
                <button
                  key={b.id}
                  role="tab"
                  aria-selected={accountId === b.id}
                  onClick={() => setViewBrand(b.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    accountId === b.id ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
                  )}
                >
                  <BrandDot color={brandColor(accounts, b.id)} /> {b.name}
                </button>
              ))}
            </div>
          </div>
          {dates.error ? <ErrorState error={dates.error} onRetry={() => dates.refetch()} /> :
            dates.isLoading ? <TableSkeleton rows={8} cols={4} /> :
            (dates.data ?? []).length === 0 ? (
              <EmptyState title={`${viewName} 에 올린 GFA 데이터가 아직 없습니다`} />
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">날짜</th>
                      <th className="th text-right">행</th>
                      <th className="th text-right">광고비</th>
                      <th className="th">마지막 반영</th>
                      <th className="th" />
                    </tr>
                  </thead>
                  <tbody>
                    {(dates.data ?? []).map((d) => (
                      <tr key={d.stat_date} className="row-hover">
                        <td className="td tnum">{d.stat_date}</td>
                        <td className="td text-right">{num(d.row_count)}</td>
                        <td className="td text-right">{won(d.cost)}</td>
                        <td className="td text-2xs text-ink-faint">
                          {new Date(d.uploaded_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                        </td>
                        <td className="td text-right">
                          <button
                            onClick={() => setConfirmDel({ from: d.stat_date, to: d.stat_date })}
                            className="rounded p-1 text-ink-faint hover:bg-bad-soft hover:text-bad"
                            aria-label={`${d.stat_date} 삭제`}
                            title="이 날짜 삭제"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>
      </div>

      <Modal
        open={Boolean(confirmDel)}
        onClose={() => !deleting && setConfirmDel(null)}
        title={`${viewName} GFA 데이터 삭제`}
        footer={
          <>
            <Button onClick={() => setConfirmDel(null)} disabled={deleting}>취소</Button>
            <Button variant="danger" onClick={doDelete} loading={deleting}>삭제</Button>
          </>
        }
      >
        <p className="text-sm">
          <b>{confirmDel && (confirmDel.from === confirmDel.to ? confirmDel.from : `${confirmDel.from} ~ ${confirmDel.to}`)}</b>
          {" "}의 <b>{viewName}</b> GFA 데이터를 모두 삭제합니다. 다른 브랜드 데이터는 그대로입니다. 되돌릴 수 없으니, 지운 뒤 같은 날짜 파일을 다시 올려 주세요.
        </p>
      </Modal>
    </>
  );
}
