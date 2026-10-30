begin;

-- Derive the presented document from the same identity snapshot as the acta.
-- Historical controls remain unchanged; downloads use their stored identity.
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
    'document_type', p.document_type, 'document_number', p.document_number,
    'document_label', p.document_label, 'issuing_country', p.issuing_country,
    'birth_date', p.birth_date, 'nationality', p.nationality)
  into new.acta_person from public.persons p where p.id = new.person_id;
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


