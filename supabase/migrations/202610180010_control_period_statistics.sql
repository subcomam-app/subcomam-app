begin;

-- Calendar periods in Chile; weeks begin on Monday. The optional reference day
-- is service-role-only and is never taken from a browser request.
create or replace function public.control_period_statistics(
  account_id uuid default null,
  reference_day date default (now() at time zone 'America/Santiago')::date
)
-- Only this narrowly scoped function reads account display data. It remains
-- executable exclusively by service_role; auth.users gets no broader grants.
returns jsonb language sql stable security definer set search_path = '' as $$
  with calendar as (
    select coalesce(reference_day, (now() at time zone 'America/Santiago')::date) as today
  ), dates as (
    select today, date_trunc('week', today::timestamp)::date as week_start,
      date_trunc('month', today::timestamp)::date as month_start,
      date_trunc('year', today::timestamp)::date as year_start from calendar
  ), bounds as (
    select today::timestamp at time zone 'America/Santiago' as day_start,
      week_start::timestamp at time zone 'America/Santiago' as week_start,
      month_start::timestamp at time zone 'America/Santiago' as month_start,
      year_start::timestamp at time zone 'America/Santiago' as year_start,
      (today + 1)::timestamp at time zone 'America/Santiago' as end_at from dates
  ), scoped as materialized (
    select c.created_by, c.officer, c.officer_code, c.controlled_at
    from public.controls c where account_id is null or c.created_by = account_id
  ), counts as (
    select c.created_by,
      case when c.created_by is null then c.officer end as former_name,
      case when c.created_by is null then c.officer_code end as former_code,
      count(*) filter (where c.controlled_at >= b.day_start and c.controlled_at < b.end_at) as day,
      count(*) filter (where c.controlled_at >= b.week_start and c.controlled_at < b.end_at) as week,
      count(*) filter (where c.controlled_at >= b.month_start and c.controlled_at < b.end_at) as month,
      count(*) filter (where c.controlled_at >= b.year_start and c.controlled_at < b.end_at) as year,
      count(*) as historical
    from scoped c cross join bounds b group by 1, 2, 3
  ), roster as (
    select u.id, coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email, 'Usuario') as name,
      u.raw_app_meta_data ->> 'officer_code' as officer_code,
      u.raw_app_meta_data ->> 'role' as role
    from auth.users u where (account_id is null or u.id = account_id)
      and (u.raw_app_meta_data ->> 'role' in ('admin', 'officer')
        or exists (select 1 from counts c where c.created_by = u.id))
  ), users as (
    select coalesce(r.id::text, c.created_by::text, 'historical:' || md5(coalesce(c.former_name, '') || ':' || coalesce(c.former_code, ''))) as key,
      r.id as user_id, coalesce(r.name, c.former_name, former.officer, 'Registros anteriores') as name,
      coalesce(r.officer_code, c.former_code, former.officer_code) as officer_code,
      coalesce(r.role, 'none') as role, r.id is null as historical_account,
      coalesce(c.day, 0) as day, coalesce(c.week, 0) as week,
      coalesce(c.month, 0) as month, coalesce(c.year, 0) as year,
      coalesce(c.historical, 0) as historical
    from roster r full join counts c on c.created_by = r.id
    left join lateral (
      select previous.officer, previous.officer_code from public.controls previous
      where previous.created_by = c.created_by
      order by previous.controlled_at desc, previous.id desc limit 1
    ) former on r.id is null and c.created_by is not null
  )
  select jsonb_build_object(
    'date', d.today, 'week_start', d.week_start, 'month_start', d.month_start, 'year_start', d.year_start,
    'totals', (select jsonb_build_object('day', coalesce(sum(day), 0), 'week', coalesce(sum(week), 0),
      'month', coalesce(sum(month), 0), 'year', coalesce(sum(year), 0), 'historical', coalesce(sum(historical), 0)) from counts),
    'users', case when account_id is null then coalesce((select jsonb_agg(to_jsonb(u) order by lower(u.name), u.officer_code, u.key) from users u), '[]'::jsonb) else '[]'::jsonb end
  ) from dates d;
$$;
revoke all on function public.control_period_statistics(uuid, date) from public, anon, authenticated;
grant execute on function public.control_period_statistics(uuid, date) to service_role;

commit;
