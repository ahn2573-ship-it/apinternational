# 에이피인터내셔널 광고 대시보드 — 설치 가이드 (GFA 먼저)

에브리해빗 대시보드와 같은 방식(GitHub + Supabase)이지만 **저장소 · DB · 로그인 계정이 완전히 분리**된 새 사이트입니다.
이번 단계는 **GFA 업로드만** 설치합니다. SA(검색광고 API)는 맨 아래 "나중에 SA 붙이기"에서 진행합니다.

- 주소: `https://ahn2573-ship-it.github.io/<저장소 이름>/`
- 브랜드: 아이슨 · 프리히 · 매트스토어 (DB 설치 때 자동 등록)

---

## 1단계 — Supabase 새 프로젝트

> ⚠️ 반드시 **새 프로젝트**. 에브리해빗 · 초코펫 프로젝트에 넣으면 안 됩니다.

1. supabase.com → **New project** → 이름은 자유, 리전 **Seoul**
2. 아래 3개를 메모장에 적어 두기
   - **Project ID** (Settings → General)
   - **Project URL** = `https://<Project ID>.supabase.co`
   - **anon key** (Settings → API Keys → **Legacy API keys** 탭 → anon)

## 2단계 — DB 만들기

1. Supabase → **SQL Editor** → 편집기를 **Ctrl+A → Delete** 로 비우기
2. `supabase/SETUP_1_database.sql` 전체 붙여넣기 → **Run**
3. 결과 표에 **테이블 7개가 "있음"**, 그 아래 **브랜드 3개(매트스토어 · 아이슨 · 프리히)** 가 보이면 성공
4. 편집기를 다시 비우고 `supabase/SETUP_3_compare.sql` 붙여넣기 → **Run** → 함수 2개가 **있음** 이면 성공 ("성과 비교" 메뉴용)

## 3단계 — GitHub 새 저장소

1. github.com (ahn2573-ship-it 계정) → **New repository**
   - 이름 = 사이트 주소가 됩니다 (예: `brand-ads`)
   - **Public**, 나머지 옵션은 체크하지 않음 → Create
2. 빈 저장소 화면에서 **uploading an existing file** 클릭
3. 압축을 푼 폴더 **안의 내용 전체**를 끌어다 놓기 → **Commit changes**
4. ⚠️ **확인**: 저장소 첫 화면에 **`.github`** 폴더가 보여야 합니다. 안 보이면
   - **Add file → Create new file** → 파일 이름 칸에 `.github/workflows/deploy.yml` 입력
   - 압축 폴더의 같은 파일을 메모장으로 열어 전체 복사 → 붙여넣기 → Commit

## 4단계 — GitHub Secrets 2개 (GFA 만 쓸 때)

저장소 → **Settings → Secrets and variables → Actions → New repository secret**

| 이름 | 값 |
|---|---|
| `VITE_SUPABASE_URL` | `https://<Project ID>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon key |

## 5단계 — 배포

1. 저장소 → **Settings → Pages** → Source: **GitHub Actions**
2. **Actions** 탭 → `Deploy to GitHub Pages` → **Run workflow** → 초록불
   (`Deploy Supabase Edge Functions` 는 SA 용이라 지금은 건너뜀으로 끝나도 정상)

## 6단계 — 관리자 계정

1. Supabase → **Authentication → Users → Add user** — 이메일 + 비밀번호, **Auto Confirm User 체크**
2. SQL Editor (비우고):
   ```sql
   update public.profiles set role = 'admin' where email = '관리자_이메일';
   ```
3. 사이트 접속 → 로그인

## 7단계 — 첫 GFA 업로드 & 검증

1. 사이트 → **GFA 업로드** → 브랜드 칸 3개가 보임
2. **아이슨 GFA 광고계정**에서 받은 일별 리포트를 **아이슨 칸**에 올리기
3. **반영 전 확인**에서 "반영할 브랜드"가 맞는지, 광고비 합계가 GFA 화면과 같은지 확인 → **아이슨에 반영하기**
4. 프리히 · 매트스토어도 각자 칸에 똑같이
5. 대시보드 상단 **전체** 탭 → **브랜드별 요약** 표에서 세 브랜드 광고비가 각 GFA 계정 화면과 맞는지 확인

---

## GFA 업로드 요령

- **칸 = 브랜드.** 다른 브랜드 파일을 잘못된 칸에 올리면 그 브랜드 데이터로 들어갑니다.
  반영 전 확인 화면에 브랜드 이름이 크게 나오니 꼭 확인하세요.
- 잘못 올렸으면: **기간 지정 삭제**에서 브랜드(아이슨 / 프리히 / 매트스토어)를 고르고 날짜 범위 → 삭제, 또는 **날짜별 업로드 현황**의 휴지통 → 맞는 칸에 다시 올리기.
  삭제는 고른 브랜드 데이터만 지웁니다.
- 리포트는 **일별**로 받아 주세요 (기간 합계 파일은 자동으로 막음). **광고 소재** 단위로 받으면 캠페인 · 세트 · 소재가 모두 나뉩니다.
- 같은 날짜를 다시 올리면 (권장 체크 상태에서) **그 브랜드의** 예전 데이터만 지우고 새로 넣습니다.
- 세 브랜드 리포트의 **열 구성을 같게** 받아 두면 브랜드 간 비교가 정확합니다.

## 화면 구성

- 상단 왼쪽 **브랜드 탭**: 전체 / 아이슨 / 프리히 / 매트스토어 — 대시보드 · RAW 데이터에 적용
- 상단 오른쪽 **매체 탭**: 전체 / 네이버 SA(연동 예정) / 네이버 GFA
- **전체** 탭: 브랜드별 요약 표, 표 상단에 **브랜드별** 보기 추가, 캠페인 표에 브랜드 열 — 행을 누르면 그 브랜드 탭으로 이동
- 브랜드 색은 모든 화면에서 같음 (아이슨 보라 · 프리히 초록 · 매트스토어 주황)
- 엑셀 다운로드: 파일 이름에 브랜드가 붙고, 전체일 때는 "브랜드별" 시트와 브랜드 열이 추가됨

## 성과 비교 (왼쪽 메뉴)

- 위 **비교 단위**에서 캠페인끼리 / 세트끼리 / 소재끼리를 고릅니다.
- 칸(A · B)마다 브랜드를 고르고, 이름 · ID 로 검색해 항목을 클릭합니다. **비교 추가**로 최대 4칸(C · D), C · D 는 X 로 뺄 수 있습니다.
- 기간: 맨 위 기간이 "기본 기간". 칸에서 날짜를 바꾸거나 **직전 기간**을 누르면 그 칸만 따로 정해집니다 (예: 같은 소재 지난주 vs 이번주). **기본**을 누르면 되돌아갑니다.
- 표: 비율 지표(CTR · CPC · 전환율 · ROAS)는 가장 좋은 칸이 초록색, 괄호는 A 대비 증감.
- 그래프: 칸마다 기간이 다르면 1일차 · 2일차…로 맞춰 겹칩니다.

## 브랜드 추가 · 이름 · 색 바꾸기

SQL Editor 에서 (비우고):
```sql
-- 브랜드 추가
insert into public.ad_accounts (name, color, sort_order) values ('새브랜드', '#2F7FD0', 4);
-- 이름 바꾸기
update public.ad_accounts set name = '바꿀이름' where name = '아이슨';
-- 색 바꾸기
update public.ad_accounts set color = '#C23B7A' where name = '프리히';
```
화면 왼쪽 위 콘솔 이름은 `src/lib/brand.tsx` 의 `BRAND_NAME`, 브라우저 탭 제목은 `index.html` 의 `<title>`.

---

## 나중에 SA 붙이기 (메모)

SA 는 브랜드마다 네이버 검색광고 계정(API Key · Secret · Customer ID)이 따로라서, 그 값으로 브랜드가 자동 구분됩니다.
DB 는 이미 준비돼 있습니다 — 브랜드마다 `customer_id` 칸이 있고, 채우면 그 브랜드의 **네이버 SA** 탭과 **SA 수집 이력** 메뉴가 열립니다.

남은 작업 (그때 요청하면 됨): 수집 함수(`supabase/functions/sync-ads`)가 지금은 계정 키 1세트만 읽으므로,
브랜드별 키 3세트를 읽고 매일 7시에 브랜드를 하나씩 돌며 수집하도록 바꾸기 + 자동 수집 등록(`SETUP_2_cron.sql`).
