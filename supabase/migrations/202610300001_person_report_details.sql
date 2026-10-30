begin;

-- Historical names are deliberately not split: compound surnames are ambiguous.
-- All three fields are completed explicitly when the next control is recorded.
alter table public.persons
  add column paternal_surname text,
  add column maternal_surname text,
  add column sex text;
alter table public.persons add constraint persons_report_details check (
  (paternal_surname is null and maternal_surname is null and sex is null)
  or (
    paternal_surname is not null and maternal_surname is not null and sex is not null
    and paternal_surname = btrim(paternal_surname) and length(paternal_surname) between 1 and 100
    and maternal_surname = btrim(maternal_surname) and length(maternal_surname) <= 100
    and sex in ('Masculino', 'Femenino', 'No especificado')
    and last_names = concat_ws(' ', paternal_surname, nullif(maternal_surname, ''))
  )
);

-- Preserve existing view column positions, appending the new fields at the end.
create or replace view public.person_summary with (security_invoker = true) as
select p.id, p.document_type, p.document_number, p.issuing_country, p.document_label,
  p.first_names, p.last_names, p.nationality, p.birth_date, p.address, p.commune,
  p.phone, p.created_at,
  (select max(c.controlled_at) from public.controls c where c.person_id = p.id) as last_control_at,
  (select count(*)::integer from public.controls c where c.person_id = p.id) as control_count,
  p.paternal_surname, p.maternal_surname, p.sex
from public.persons p;
revoke all on public.person_summary from anon;
grant select on public.person_summary to authenticated, service_role;

-- Person corrections and the immutable control snapshot share one transaction.
create or replace function public.register_control(payload jsonb, actor_id uuid default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  target_person uuid;
  saved_control public.controls;
  identity_data jsonb := payload -> 'identity';
  personal_data jsonb := payload -> 'personal';
  details_data jsonb := nullif(payload -> 'person_details', 'null'::jsonb);
  control_data jsonb := payload -> 'control';
  photo_data jsonb := payload -> 'photo';
  document_photo_data jsonb := nullif(payload -> 'document_photo', 'null'::jsonb);
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
  if document_photo_data is not null and (
    document_photo_data ->> 'path' is null
    or document_photo_data ->> 'path' = photo_data ->> 'path'
    or split_part(document_photo_data ->> 'path', '/', 1) <> payload ->> 'request_id'
    or not exists (select 1 from storage.objects o where o.bucket_id = 'control-photos'
      and o.name = document_photo_data ->> 'path'
      and o.metadata ->> 'mimetype' = 'image/webp'
      and (o.metadata ->> 'size')::integer = (document_photo_data ->> 'bytes')::integer)) then
    raise exception using errcode = 'PT422', message = 'La imagen del documento adjunta no es válida para este control.';
  end if;
  if payload ->> 'person_id' is not null then
    select id into strict target_person from public.persons
      where id = (payload ->> 'person_id')::uuid for update;
    if details_data is not null then
      update public.persons
      set paternal_surname = btrim(details_data ->> 'paternal_surname'),
          maternal_surname = btrim(coalesce(details_data ->> 'maternal_surname', '')),
          sex = details_data ->> 'sex',
          last_names = concat_ws(' ', nullif(btrim(details_data ->> 'paternal_surname'), ''),
            nullif(btrim(details_data ->> 'maternal_surname'), ''))
      where id = target_person;
    end if;
    if nullif(payload -> 'contact', 'null'::jsonb) is not null then
      update public.persons
      set address = btrim(coalesce(payload -> 'contact' ->> 'address', '')),
          commune = btrim(coalesce(payload -> 'contact' ->> 'commune', '')),
          phone = btrim(coalesce(payload -> 'contact' ->> 'phone', ''))
      where id = target_person;
    end if;
  else
    insert into public.persons(document_type, document_number, issuing_country, document_label, first_names, last_names, paternal_surname, maternal_surname, sex, nationality, birth_date, address, commune, phone)
    values (identity_data ->> 'document_type', identity_data ->> 'document_number', identity_data ->> 'issuing_country', coalesce(identity_data ->> 'document_label', ''),
      personal_data ->> 'first_names',
      concat_ws(' ', nullif(btrim(personal_data ->> 'paternal_surname'), ''), nullif(btrim(personal_data ->> 'maternal_surname'), '')),
      btrim(personal_data ->> 'paternal_surname'), btrim(coalesce(personal_data ->> 'maternal_surname', '')), personal_data ->> 'sex',
      personal_data ->> 'nationality', (personal_data ->> 'birth_date')::date,
      coalesce(personal_data ->> 'address', ''), coalesce(personal_data ->> 'commune', ''), coalesce(personal_data ->> 'phone', ''))
    returning id into target_person;
  end if;
  if exists (select 1 from public.persons where id = target_person
    and (length(btrim(address)) = 0 or length(btrim(commune)) = 0
      or length(btrim(phone)) = 0 or length(address) > 250
      or length(commune) > 80 or length(phone) > 30)) then
    raise exception using errcode = 'PT400',
      message = 'Completa el domicilio, la comuna y el teléfono antes de registrar el control.';
  end if;
  insert into public.controls(person_id, request_id, reason, location, officer, notes, created_by, photo_path, photo_bytes, photo_width, photo_height, document_photo_path, document_photo_bytes, document_photo_width, document_photo_height, art12bis, acta_person, acta_version)
  values (target_person, (payload ->> 'request_id')::uuid, control_data ->> 'reason', control_data ->> 'location', control_data ->> 'officer', coalesce(control_data ->> 'notes', ''), actor_id,
    photo_data ->> 'path', (photo_data ->> 'bytes')::integer, (photo_data ->> 'width')::integer, (photo_data ->> 'height')::integer,
    document_photo_data ->> 'path', (document_photo_data ->> 'bytes')::integer, (document_photo_data ->> 'width')::integer, (document_photo_data ->> 'height')::integer,
    nullif(control_data -> 'art12bis', 'null'::jsonb),
    case when nullif(control_data -> 'art12bis', 'null'::jsonb) is not null then
      (select jsonb_build_object('first_names', p.first_names, 'last_names', p.last_names,
        'paternal_surname', p.paternal_surname, 'maternal_surname', p.maternal_surname, 'sex', p.sex,
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

create or replace function public.stamp_control_officer()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  account record;
  document_name text;
  document_number text;
begin
  if new.created_by is null then
    raise exception 'El control debe estar asociado a una cuenta de funcionario.';
  end if;
  select u.raw_user_meta_data ->> 'full_name' as name, u.email,
    u.raw_app_meta_data ->> 'officer_code' as code,
    u.raw_app_meta_data ->> 'officer_grade' as grade,
    u.raw_app_meta_data as metadata, u.banned_until
  into account from auth.users u where u.id = new.created_by;
  if not found or coalesce(account.metadata ->> 'role', '') not in ('admin', 'officer')
    or coalesce(account.metadata ->> 'must_setup_password', 'false') = 'true'
    or coalesce(account.metadata ->> 'must_change_password', 'false') = 'true'
    or account.banned_until > now() then
    raise exception 'La cuenta debe estar activa y haber cambiado su contraseña inicial.';
  end if;
  new.officer_code := account.code;
  new.officer := coalesce(nullif(account.name, ''), account.email, 'Funcionario');
  new.art12bis := coalesce(nullif(new.art12bis, 'null'::jsonb), '{}'::jsonb);
  if jsonb_typeof(new.art12bis) <> 'object' then
    raise exception 'Los datos del acta deben ser un objeto.';
  end if;
  new.art12bis := jsonb_build_object('number', '', 'lesions', '',
    'presented_document', '', 'pdi_officer', '', 'pdi_grade', '')
    || new.art12bis || jsonb_build_object('officer_grade', coalesce(account.grade, ''),
      'number', '', 'pdi_officer', '', 'pdi_grade', '');
  select jsonb_build_object('first_names', p.first_names, 'last_names', p.last_names,
        'paternal_surname', p.paternal_surname, 'maternal_surname', p.maternal_surname, 'sex', p.sex,
    'document_type', p.document_type, 'document_number', p.document_number,
    'document_label', p.document_label, 'issuing_country', p.issuing_country,
    'birth_date', p.birth_date, 'nationality', p.nationality)
  into new.acta_person from public.persons p where p.id = new.person_id;
  if nullif(btrim(new.acta_person ->> 'paternal_surname'), '') is null
    or nullif(new.acta_person ->> 'sex', '') is null then
    raise exception using errcode = 'PT424',
      message = 'Completa el apellido paterno y el sexo antes de registrar el control.';
  end if;
  document_name := case when new.acta_person ->> 'document_type' = 'Otro'
    then coalesce(nullif(btrim(new.acta_person ->> 'document_label'), ''), 'Otro documento')
    else new.acta_person ->> 'document_type' end;
  document_number := upper(regexp_replace(new.acta_person ->> 'document_number', '[.\s-]', '', 'g'));
  if new.acta_person ->> 'document_type' = 'RUT' and document_number ~ '^\d{1,8}[\dK]$' then
    document_number := reverse(regexp_replace(reverse(left(document_number, -1)), '(\d{3})(?=\d)', '\1.', 'g'))
      || '-' || right(document_number, 1);
  end if;
  new.art12bis := new.art12bis || jsonb_build_object('presented_document', document_name || ' N.º ' || document_number);
  new.acta_version := 1;
  return new;
end;
$$;
revoke all on function public.stamp_control_officer() from public, anon, authenticated;


commit;
