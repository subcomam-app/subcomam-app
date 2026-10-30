begin;
alter table public.controls
  add column photo_path text,
  add column photo_bytes integer,
  add column photo_width integer,
  add column photo_height integer;
create unique index controls_photo_path_unique on public.controls(photo_path) where photo_path is not null;
alter table public.controls add constraint control_photo_metadata check (
  (photo_path is null and photo_bytes is null and photo_width is null and photo_height is null)
  or (photo_path is not null and photo_bytes is not null and photo_width is not null and photo_height is not null
    and photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
    and photo_bytes between 1 and 102400
    and photo_width between 1 and 640 and photo_height between 1 and 640)
);
-- Old controls remain intact; every new insert must contain a photograph.
alter table public.controls add constraint control_photo_required check (photo_path is not null) not valid;

create or replace function public.register_control(payload jsonb, actor_id uuid default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  target_person uuid;
  saved_control public.controls;
  identity_data jsonb := payload -> 'identity';
  personal_data jsonb := payload -> 'personal';
  control_data jsonb := payload -> 'control';
  photo_data jsonb := payload -> 'photo';
begin
  perform pg_advisory_xact_lock(hashtextextended(payload ->> 'request_id', 0));
  select * into saved_control from public.controls where request_id = (payload ->> 'request_id')::uuid;
  if found then
    if saved_control.created_by is distinct from actor_id then raise exception 'El control pertenece a otro usuario.'; end if;
    return to_jsonb(saved_control);
  end if;
  if photo_data ->> 'path' is null
    or split_part(photo_data ->> 'path', '/', 1) <> payload ->> 'request_id'
    or not exists (select 1 from storage.objects o where o.bucket_id = 'control-photos'
      and o.name = photo_data ->> 'path'
      and o.metadata ->> 'mimetype' = 'image/webp'
      and (o.metadata ->> 'size')::integer = (photo_data ->> 'bytes')::integer) then
    raise exception 'Se requiere una fotografía guardada para este control.';
  end if;
  if payload ->> 'person_id' is not null then
    select id into strict target_person from public.persons where id = (payload ->> 'person_id')::uuid;
  else
    insert into public.persons(document_type, document_number, issuing_country, document_label, first_names, last_names, nationality, birth_date, address, commune, phone)
    values (identity_data ->> 'document_type', identity_data ->> 'document_number', identity_data ->> 'issuing_country', coalesce(identity_data ->> 'document_label', ''),
      personal_data ->> 'first_names', personal_data ->> 'last_names', personal_data ->> 'nationality', (personal_data ->> 'birth_date')::date,
      coalesce(personal_data ->> 'address', ''), coalesce(personal_data ->> 'commune', ''), coalesce(personal_data ->> 'phone', ''))
    returning id into target_person;
  end if;
  insert into public.controls(person_id, request_id, reason, location, officer, notes, created_by, photo_path, photo_bytes, photo_width, photo_height)
  values (target_person, (payload ->> 'request_id')::uuid, control_data ->> 'reason', control_data ->> 'location', control_data ->> 'officer', coalesce(control_data ->> 'notes', ''), actor_id,
    photo_data ->> 'path', (photo_data ->> 'bytes')::integer, (photo_data ->> 'width')::integer, (photo_data ->> 'height')::integer)
  returning * into saved_control;
  return to_jsonb(saved_control);
end;
$$;
revoke all on function public.register_control(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.register_control(jsonb, uuid) to service_role;
-- No Storage policy grants browser access. The authenticated server proxies reads
-- and writes; suspension is checked on each photo request and no public URL exists.
commit;
