begin;

create table public.user_access_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  accessed_at timestamptz not null default now(),
  method text not null check (method in ('password', 'recovery')),
  role text not null check (role in ('admin', 'officer'))
);
create index user_access_events_user_date
  on public.user_access_events(user_id, accessed_at desc, id desc);
alter table public.user_access_events enable row level security;
revoke all on public.user_access_events from public, anon, authenticated;
grant all on public.user_access_events to service_role;

commit;
