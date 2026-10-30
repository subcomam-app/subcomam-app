begin;
alter table public.controls
  add column art12bis jsonb,
  add column acta_person jsonb,
  add column acta_version integer;
alter table public.controls add constraint controls_acta_metadata check (
  (art12bis is null and acta_person is null and acta_version is null)
  or (art12bis is not null and acta_person is not null and acta_version is not null
    and jsonb_typeof(art12bis) = 'object' and jsonb_typeof(acta_person) = 'object' and acta_version = 1)
);
-- A snapshot preserves the document even if the person's record later changes.
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
  insert into public.controls(person_id, request_id, reason, location, officer, notes, created_by, photo_path, photo_bytes, photo_width, photo_height, art12bis, acta_person, acta_version)
  values (target_person, (payload ->> 'request_id')::uuid, control_data ->> 'reason', control_data ->> 'location', control_data ->> 'officer', coalesce(control_data ->> 'notes', ''), actor_id,
    photo_data ->> 'path', (photo_data ->> 'bytes')::integer, (photo_data ->> 'width')::integer, (photo_data ->> 'height')::integer,
    nullif(control_data -> 'art12bis', 'null'::jsonb),
    case when nullif(control_data -> 'art12bis', 'null'::jsonb) is not null then
      (select jsonb_build_object('first_names', p.first_names, 'last_names', p.last_names,
        'document_type', p.document_type, 'document_number', p.document_number,
        'document_label', p.document_label, 'issuing_country', p.issuing_country,
        'birth_date', p.birth_date, 'nationality', p.nationality)
        from public.persons p where p.id = target_person) end,
    case when nullif(control_data -> 'art12bis', 'null'::jsonb) is not null then 1 end)
  returning * into saved_control;
  return to_jsonb(saved_control);
end;
$$;
revoke all on function public.register_control(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.register_control(jsonb, uuid) to service_role;
commit;
