begin;

create table public.persons (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('RUT', 'DNI', 'Pasaporte', 'Otro')),
  document_number text not null check (document_number ~ '^[A-Z0-9]{3,30}$'),
  issuing_country text not null,
  document_label text not null default '',
  first_names text not null check (length(first_names) between 2 and 100),
  last_names text not null check (length(last_names) between 2 and 100),
  nationality text not null,
  birth_date date not null check (birth_date >= date '1900-01-01' and birth_date <= current_date),
  address text not null default '',
  commune text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now(),
  unique(document_type, issuing_country, document_number),
  check (document_type <> 'RUT' or issuing_country = 'Chile'),
  check (document_type <> 'Otro' or length(document_label) >= 2)
);

create table public.controls (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id),
  request_id uuid not null unique,
  controlled_at timestamptz not null default now(),
  reason text not null check (reason in ('Control de identidad', 'Fiscalización migratoria', 'Atención en unidad', 'Otro')),
  location text not null check (length(location) between 3 and 200),
  officer text not null check (length(officer) between 3 and 120),
  notes text not null default '' check (length(notes) <= 2000),
  created_by uuid default auth.uid()
);
create index persons_document_search on public.persons(document_type, issuing_country, document_number text_pattern_ops);
create index controls_person_date on public.controls(person_id, controlled_at desc);
create index controls_date on public.controls(controlled_at desc);

alter table public.persons enable row level security;
alter table public.controls enable row level security;

-- Only staff roles assigned by an administrator may read operational records.
create policy staff_read_persons on public.persons for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('officer', 'admin'));
create policy staff_read_controls on public.controls for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('officer', 'admin'));
revoke all on public.persons, public.controls from anon;
revoke insert, update, delete on public.persons, public.controls from authenticated;
grant select on public.persons, public.controls to authenticated;
grant all on public.persons, public.controls to service_role;

create view public.person_summary with (security_invoker = true) as
select p.*, (select max(c.controlled_at) from public.controls c where c.person_id = p.id) as last_control_at,
  (select count(*)::integer from public.controls c where c.person_id = p.id) as control_count
from public.persons p;
revoke all on public.person_summary from anon;
grant select on public.person_summary to authenticated, service_role;

-- One transaction creates the person (if new) and its control. A unique request
-- ID makes retries safe, including a retry after a lost network response.
create function public.register_control(payload jsonb, actor_id uuid default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  target_person uuid;
  saved_control public.controls;
  identity_data jsonb := payload -> 'identity';
  personal_data jsonb := payload -> 'personal';
  control_data jsonb := payload -> 'control';
begin
  perform pg_advisory_xact_lock(hashtextextended(payload ->> 'request_id', 0));
  select * into saved_control from public.controls where request_id = (payload ->> 'request_id')::uuid;
  if found then return to_jsonb(saved_control); end if;

  if payload ->> 'person_id' is not null then
    select id into strict target_person from public.persons where id = (payload ->> 'person_id')::uuid;
  else
    insert into public.persons(document_type, document_number, issuing_country, document_label, first_names, last_names, nationality, birth_date, address, commune, phone)
    values (identity_data ->> 'document_type', identity_data ->> 'document_number', identity_data ->> 'issuing_country', coalesce(identity_data ->> 'document_label', ''),
      personal_data ->> 'first_names', personal_data ->> 'last_names', personal_data ->> 'nationality', (personal_data ->> 'birth_date')::date,
      coalesce(personal_data ->> 'address', ''), coalesce(personal_data ->> 'commune', ''), coalesce(personal_data ->> 'phone', ''))
    returning id into target_person;
  end if;
  insert into public.controls(person_id, request_id, reason, location, officer, notes, created_by)
  values (target_person, (payload ->> 'request_id')::uuid, control_data ->> 'reason', control_data ->> 'location', control_data ->> 'officer', coalesce(control_data ->> 'notes', ''), actor_id)
  returning * into saved_control;
  return to_jsonb(saved_control);
end;
$$;
revoke all on function public.register_control(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.register_control(jsonb, uuid) to service_role;

commit;
