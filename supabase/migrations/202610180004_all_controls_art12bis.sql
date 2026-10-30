begin;

-- Every new control is an art. 12 bis procedure. Snapshot the account and the
-- person at insertion, including when an older client omits the acta fields.
create or replace function public.stamp_control_officer()
returns trigger language plpgsql security definer set search_path = '' as $$
declare account record;
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
    || new.art12bis || jsonb_build_object('officer_grade', coalesce(account.grade, ''));
  select jsonb_build_object('first_names', p.first_names, 'last_names', p.last_names,
    'document_type', p.document_type, 'document_number', p.document_number,
    'document_label', p.document_label, 'issuing_country', p.issuing_country,
    'birth_date', p.birth_date, 'nationality', p.nationality)
  into new.acta_person from public.persons p where p.id = new.person_id;
  new.acta_version := 1;
  return new;
end;
$$;
revoke all on function public.stamp_control_officer() from public, anon, authenticated;

commit;
