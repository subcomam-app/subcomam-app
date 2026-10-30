begin;

create table public.staff_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  officer_code text not null unique check (officer_code ~ '^[0-9]{6}-[A-Z]$')
);
alter table public.staff_accounts enable row level security;
revoke all on public.staff_accounts from public, anon, authenticated;
grant all on public.staff_accounts to service_role;

-- The unique code is synchronized atomically with Auth's administrator-only metadata.
create function public.sync_staff_account()
returns trigger language plpgsql security definer set search_path = '' as $$
declare code text := new.raw_app_meta_data ->> 'officer_code';
begin
  if code is not null then
    insert into public.staff_accounts(user_id, officer_code) values (new.id, code)
    on conflict (user_id) do update set officer_code = excluded.officer_code;
  else
    delete from public.staff_accounts where user_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_staff_account() from public, anon, authenticated;
create trigger sync_staff_account after insert or update of raw_app_meta_data on auth.users
for each row execute function public.sync_staff_account();
insert into public.staff_accounts(user_id, officer_code)
select id, raw_app_meta_data ->> 'officer_code' from auth.users
where raw_app_meta_data ->> 'officer_code' is not null;

create or replace function public.is_active_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u where u.id = auth.uid()
      and u.raw_app_meta_data ->> 'role' in ('admin', 'officer')
      and coalesce(u.raw_app_meta_data ->> 'must_setup_password', 'false') <> 'true'
      and coalesce(u.raw_app_meta_data ->> 'must_change_password', 'false') <> 'true'
      and (u.banned_until is null or u.banned_until <= now())
  );
$$;
revoke all on function public.is_active_staff() from public, anon;
grant execute on function public.is_active_staff() to authenticated;

alter table public.controls add column officer_code text
check (officer_code is null or officer_code ~ '^[0-9]{6}-[A-Z]$');
create index controls_created_by_date on public.controls(created_by, controlled_at);

create function public.stamp_control_officer()
returns trigger language plpgsql security definer set search_path = '' as $$
declare account record;
begin
  if new.created_by is not null then
    select u.raw_user_meta_data ->> 'full_name' as name,
      u.raw_app_meta_data ->> 'officer_code' as code,
      u.raw_app_meta_data as metadata, u.banned_until
    into account from auth.users u where u.id = new.created_by;
    if not found or coalesce(account.metadata ->> 'role', '') not in ('admin', 'officer')
      or coalesce(account.metadata ->> 'must_setup_password', 'false') = 'true'
      or coalesce(account.metadata ->> 'must_change_password', 'false') = 'true'
      or account.banned_until > now() then
      raise exception 'La cuenta debe estar activa y haber cambiado su contraseña inicial.';
    end if;
    new.officer_code := account.code;
    new.officer := coalesce(nullif(account.name, ''), new.officer);
  else
    new.officer_code := null;
  end if;
  return new;
end;
$$;
revoke all on function public.stamp_control_officer() from public, anon, authenticated;
create trigger stamp_control_officer before insert on public.controls
for each row execute function public.stamp_control_officer();

create function public.officer_statistics(account_id uuid, from_date date, to_date date)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  if account_id is null or from_date is null or to_date is null
    or to_date < from_date or to_date - from_date > 365 then
    raise exception 'Período o cuenta inválidos';
  end if;
  with bounds as (
    select from_date::timestamp at time zone 'America/Santiago' as start_at,
      (to_date + 1)::timestamp at time zone 'America/Santiago' as end_at
  ), own_controls as materialized (
    select c.* from public.controls c where c.created_by = account_id
  ), period as materialized (
    select c.* from own_controls c, bounds b
    where c.controlled_at >= b.start_at and c.controlled_at < b.end_at
  ), daily as (
    select (controlled_at at time zone 'America/Santiago')::date as day, count(*) as total
    from period group by 1
  ), days as (
    select (from_date + n)::text as date, coalesce(d.total, 0) as count
    from generate_series(0, to_date - from_date) n left join daily d on d.day = from_date + n order by n
  ), reasons as (
    select reason as label, count(*) as count from period group by reason order by count(*) desc, reason
  )
  select jsonb_build_object(
    'total_people', (select count(distinct person_id) from own_controls),
    'total_controls', (select count(*) from own_controls),
    'period_controls', (select count(*) from period),
    'period_people', (select count(distinct person_id) from period),
    'repeated_people', (select count(*) from (select person_id from period group by person_id having count(*) > 1) r),
    'new_people', (select count(*) from (
      select person_id from own_controls group by person_id
      having min(controlled_at) >= (select start_at from bounds) and min(controlled_at) < (select end_at from bounds)
    ) first_seen),
    'daily', coalesce((select jsonb_agg(days) from days), '[]'::jsonb),
    'reasons', coalesce((select jsonb_agg(reasons) from reasons), '[]'::jsonb),
    'officers', '[]'::jsonb
  ) into result;
  return result;
end;
$$;
revoke all on function public.officer_statistics(uuid, date, date) from public, anon, authenticated;
grant execute on function public.officer_statistics(uuid, date, date) to service_role;
commit;
