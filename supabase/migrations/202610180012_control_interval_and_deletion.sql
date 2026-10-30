begin;

-- Private deletion receipt: makes retries safe, tracks pending image cleanup,
-- and prevents a stale save request from recreating the deleted acta.
create table public.control_deletions (
  control_id uuid primary key,
  request_id uuid not null unique,
  person_id uuid not null,
  deleted_by uuid not null,
  deleted_at timestamptz not null default now(),
  photo_paths text[] not null default '{}',
  storage_cleaned_at timestamptz
);
alter table public.control_deletions enable row level security;
revoke all on public.control_deletions from public, anon, authenticated;
grant all on public.control_deletions to service_role;

create function public.enforce_control_interval()
returns trigger language plpgsql security definer set search_path = '' as $$
declare previous_at timestamptz;
begin
  if exists (select 1 from public.control_deletions where request_id = new.request_id) then
    raise exception using errcode = 'PT410', message = 'El control fue eliminado. Inicia un nuevo registro.';
  end if;
  -- All inserts for this person serialize, regardless of the operator or request.
  perform 1 from public.persons where id = new.person_id for update;
  select max(controlled_at) into previous_at from public.controls where person_id = new.person_id;
  if previous_at is not null and new.controlled_at < previous_at + interval '8 hours' then
    raise exception using errcode = 'PT409', message = 'Deben transcurrir 8 horas desde el último control.',
      detail = jsonb_build_object('last_control_at', previous_at,
        'available_at', previous_at + interval '8 hours', 'server_now', clock_timestamp())::text;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_control_interval() from public, anon, authenticated;
create trigger controls_validate_interval before insert on public.controls
  for each row execute function public.enforce_control_interval();

create function public.delete_control_for_correction(target_id uuid, administrator_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.controls; receipt public.control_deletions;
begin
  if not exists (select 1 from auth.users u where u.id = administrator_id
    and u.raw_app_meta_data ->> 'role' = 'admin'
    and coalesce(u.raw_app_meta_data ->> 'must_change_password', 'false') <> 'true'
    and coalesce(u.raw_app_meta_data ->> 'must_setup_password', 'false') <> 'true'
    and (u.banned_until is null or u.banned_until <= now())) then
    raise exception using errcode = 'PT403', message = 'Solo el administrador puede eliminar controles.';
  end if;
  select * into target from public.controls where id = target_id;
  if found then
    -- Same lock order as register_control: request, then person.
    perform pg_advisory_xact_lock(hashtextextended(target.request_id::text, 0));
    perform 1 from public.persons where id = target.person_id for update;
    delete from public.controls where id = target_id returning * into target;
    if found then
      insert into public.control_deletions(control_id, request_id, person_id, deleted_by, photo_paths)
      values (target.id, target.request_id, target.person_id, administrator_id,
        array_remove(array[target.photo_path, target.document_photo_path], null));
    end if;
  end if;
  select * into receipt from public.control_deletions where control_id = target_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'El control no existe.';
  end if;
  return to_jsonb(receipt);
end;
$$;
revoke all on function public.delete_control_for_correction(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_control_for_correction(uuid, uuid) to service_role;

commit;
