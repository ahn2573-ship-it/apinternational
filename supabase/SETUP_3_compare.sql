-- ============================================================================
-- 에이피인터내셔널 — "성과 비교" 메뉴용 함수 2개 추가 (2026-11-02)
--
--  · SETUP_1 을 이미 실행한 DB 에 한 번만 실행하면 됩니다. (여러 번 실행해도 안전)
--  · 데이터와 기존 함수는 건드리지 않고, 새 함수 2개만 추가합니다.
--  · SQL Editor 를 Ctrl+A → Delete 로 비운 뒤 붙여넣고 Run.
-- ============================================================================

-- 비교할 항목 검색 (캠페인 / 세트 / 소재) -----------------------------------------
--   p_level: 'campaign' | 'adgroup' | 'creative'
--   이름 또는 ID 로 찾고, 최근 90일 광고비가 큰 순으로 최대 50개
drop function if exists public.fn_compare_search(uuid, text, text);
create or replace function public.fn_compare_search(
  p_account uuid,
  p_level   text,
  p_query   text default ''
)
returns table (
  media text, campaign_id text, adgroup_id text, creative_id text,
  name text, parent_name text, cost_90d numeric, last_date date
)
language sql
stable
as $$
  with g as (
    select
      f.media                                                              as k_media,
      f.campaign_id                                                        as k_campaign,
      case when p_level in ('adgroup', 'creative') then f.adgroup_id end   as k_adgroup,
      case when p_level = 'creative' then f.creative_id end                as k_creative,
      coalesce(sum(f.cost) filter (where f.stat_date >= current_date - 90), 0)::numeric as cost_90d,
      max(f.stat_date)                                                     as last_date
    from public.ad_performance_daily f
    where f.ad_account_id = p_account
      and f.campaign_id <> '-'
      and (p_level = 'campaign' or f.adgroup_id <> '-')
      and (p_level <> 'creative' or f.creative_id <> '-')
    group by 1, 2, 3, 4
  ),
  named as (
    select
      g.*,
      case p_level
        when 'campaign' then coalesce(c.name, g.k_campaign)
        when 'adgroup'  then coalesce(a.name, g.k_adgroup)
        else coalesce(cr.name, cr.product_name, g.k_creative) end         as item_name,
      case p_level
        when 'campaign' then null
        when 'adgroup'  then coalesce(c.name, g.k_campaign)
        else concat_ws(' › ', coalesce(c.name, g.k_campaign), coalesce(a.name, g.k_adgroup)) end as parent
    from g
    left join public.campaigns c
      on c.ad_account_id = p_account and c.media = g.k_media and c.campaign_id = g.k_campaign
    left join public.adgroups a
      on a.ad_account_id = p_account and a.media = g.k_media and a.adgroup_id = g.k_adgroup
    left join public.creatives cr
      on cr.ad_account_id = p_account and cr.media = g.k_media and cr.creative_id = g.k_creative
  )
  select n.k_media, n.k_campaign, n.k_adgroup, n.k_creative, n.item_name, n.parent, n.cost_90d, n.last_date
  from named n
  where coalesce(p_query, '') = ''
     or n.item_name ilike '%' || p_query || '%'
     or coalesce(n.parent, '') ilike '%' || p_query || '%'
     or coalesce(n.k_creative, n.k_adgroup, n.k_campaign) ilike '%' || p_query || '%'
  order by n.cost_90d desc, n.last_date desc nulls last
  limit 50;
$$;

-- 항목 하나의 일별 성과 (기간 안의 모든 날짜, 없는 날은 0) -------------------------
--   합계 · 비율은 화면에서 일별 합을 더한 뒤 다시 계산한다 (평균의 평균 금지)
drop function if exists public.fn_compare_daily(uuid, text, date, date, text, text, text);
create or replace function public.fn_compare_daily(
  p_account   uuid,
  p_media     text,
  p_from      date,
  p_to        date,
  p_campaign  text,
  p_adgroup   text default null,
  p_creative  text default null
)
returns table (
  stat_date date,
  impressions bigint, clicks bigint, cost numeric,
  conv_count bigint, conv_revenue numeric,
  total_conv_count bigint, total_conv_revenue numeric,
  cart_count bigint, cart_revenue numeric,
  rank_weight numeric, rank_impressions bigint
)
language sql
stable
as $$
  with days as (
    select d::date as stat_date from generate_series(p_from, p_to, interval '1 day') d
  ),
  agg as (
    select
      f.stat_date,
      sum(f.impressions)::bigint         as impressions,
      sum(f.clicks)::bigint              as clicks,
      sum(f.cost)::numeric               as cost,
      sum(f.conv_count)::bigint          as conv_count,
      sum(f.conv_revenue)::numeric       as conv_revenue,
      sum(f.total_conv_count)::bigint    as total_conv_count,
      sum(f.total_conv_revenue)::numeric as total_conv_revenue,
      sum(f.cart_count)::bigint          as cart_count,
      sum(f.cart_revenue)::numeric       as cart_revenue,
      sum(f.avg_rank * f.impressions) filter (where f.avg_rank is not null and f.impressions > 0) as rank_weight,
      sum(f.impressions) filter (where f.avg_rank is not null and f.impressions > 0)::bigint   as rank_impressions
    from public.ad_performance_daily f
    where f.ad_account_id = p_account
      and f.media = p_media
      and f.stat_date between p_from and p_to
      and f.campaign_id = p_campaign
      and (p_adgroup  is null or f.adgroup_id  = p_adgroup)
      and (p_creative is null or f.creative_id = p_creative)
    group by f.stat_date
  )
  select
    d.stat_date,
    coalesce(a.impressions, 0), coalesce(a.clicks, 0), coalesce(a.cost, 0),
    coalesce(a.conv_count, 0), coalesce(a.conv_revenue, 0),
    coalesce(a.total_conv_count, 0), coalesce(a.total_conv_revenue, 0),
    coalesce(a.cart_count, 0), coalesce(a.cart_revenue, 0),
    coalesce(a.rank_weight, 0), coalesce(a.rank_impressions, 0)
  from days d
  left join agg a on a.stat_date = d.stat_date
  order by d.stat_date;
$$;

grant execute on function public.fn_compare_search(uuid, text, text) to authenticated, service_role;
grant execute on function public.fn_compare_daily(uuid, text, date, date, text, text, text) to authenticated, service_role;

-- 확인 — "있음" 2줄이 나오면 성공
select f.name as 함수,
       case when exists (select 1 from pg_proc p where p.proname = f.name) then '있음' else '없음' end as 상태
from (values ('fn_compare_search'), ('fn_compare_daily')) as f(name);
