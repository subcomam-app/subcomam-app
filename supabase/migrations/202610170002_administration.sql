begin;

-- Consult current permissions so a suspension also revokes existing JWT access.
create or replace function public.is_active_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u where u.id = auth.uid()
      and u.raw_app_meta_data ->> 'role' in ('admin', 'officer')
      and coalesce(u.raw_app_meta_data ->> 'must_setup_password', 'false') <> 'true'
      and (u.banned_until is null or u.banned_until <= now())
  );
$$;
revoke all on function public.is_active_staff() from public, anon;
grant execute on function public.is_active_staff() to authenticated;
alter policy staff_read_persons on public.persons using (public.is_active_staff());
alter policy staff_read_controls on public.controls using (public.is_active_staff());

-- Keep at least one enabled administrator, even across simultaneous changes.
create or replace function public.protect_last_administrator()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.raw_app_meta_data ->> 'role' = 'admin'
     and (old.banned_until is null or old.banned_until <= now()) then
    if tg_op = 'DELETE' or new.raw_app_meta_data ->> 'role' is distinct from 'admin'
       or new.banned_until > now() then
      perform pg_advisory_xact_lock(81720261017);
      if not exists (select 1 from auth.users u where u.id <> old.id
        and u.raw_app_meta_data ->> 'role' = 'admin'
        and (u.banned_until is null or u.banned_until <= now())) then
        raise exception 'Debe permanecer al menos un administrador activo.';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.protect_last_administrator() from public, anon, authenticated;
create trigger protect_last_administrator before update or delete on auth.users
for each row execute function public.protect_last_administrator();

create or replace function public.admin_statistics(from_date date, to_date date)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare result jsonb;
begin
  if from_date is null or to_date is null or to_date < from_date or to_date - from_date > 365 then
    raise exception 'Período inválido';
  end if;
  with bounds as (
    select from_date::timestamp at time zone 'America/Santiago' as start_at,
      (to_date + 1)::timestamp at time zone 'America/Santiago' as end_at
  ), period as materialized (
    select c.* from public.controls c, bounds b
    where c.controlled_at >= b.start_at and c.controlled_at < b.end_at
  ), daily as (
    select (controlled_at at time zone 'America/Santiago')::date as day, count(*) as total
    from period group by 1
  ), days as (
    select (from_date + n)::text as date, coalesce(d.total, 0) as count
    from generate_series(0, to_date - from_date) n left join daily d on d.day = from_date + n order by n
  ), reasons as (
    select reason as label, count(*) as count from period group by reason order by count(*) desc, reason
  ), officers as (
    select officer as label, count(*) as count from period group by officer order by count(*) desc, officer limit 10
  )
  select jsonb_build_object(
    'total_people', (select count(*) from public.persons),
    'total_controls', (select count(*) from public.controls),
    'period_controls', (select count(*) from period),
    'period_people', (select count(distinct person_id) from period),
    'repeated_people', (select count(*) from (select person_id from period group by person_id having count(*) > 1) r),
    'new_people', (select count(*) from public.persons p, bounds b where p.created_at >= b.start_at and p.created_at < b.end_at),
    'daily', coalesce((select jsonb_agg(days) from days), '[]'::jsonb),
    'reasons', coalesce((select jsonb_agg(reasons) from reasons), '[]'::jsonb),
    'officers', coalesce((select jsonb_agg(officers) from officers), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_statistics(date, date) from public, anon, authenticated;
grant execute on function public.admin_statistics(date, date) to service_role;
commit;
