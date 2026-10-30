begin;

create function public.is_active_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_staff() and exists (
    select 1 from auth.users u where u.id = auth.uid()
      and u.raw_app_meta_data ->> 'role' = 'admin'
  );
$$;
revoke all on function public.is_active_admin() from public, anon;
grant execute on function public.is_active_admin() to authenticated;

alter policy staff_read_controls on public.controls using (
  public.is_active_staff() and (public.is_active_admin() or created_by = auth.uid())
);
alter policy staff_read_persons on public.persons using (
  public.is_active_staff() and (
    public.is_active_admin() or exists (
      select 1 from public.controls c where c.person_id = persons.id and c.created_by = auth.uid()
    )
  )
);
-- person_summary is security_invoker, so direct client reads inherit these
-- policies. Shared document lookup remains a limited server-authorized action.
commit;
