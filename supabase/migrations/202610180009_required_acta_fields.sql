begin;

-- Validate new controls without changing historical statements or blocking
-- unrelated updates to old controls (for example, preserving a deleted author).
create or replace function public.require_control_acta_fields()
returns trigger language plpgsql set search_path = '' as $$
declare
  lesions text := regexp_replace(coalesce(new.art12bis ->> 'lesions', ''), '^\s+|\s+$', '', 'g');
  presented text := regexp_replace(coalesce(new.art12bis ->> 'presented_document', ''), '^\s+|\s+$', '', 'g');
begin
  if jsonb_typeof(new.art12bis -> 'lesions') is distinct from 'string'
    or jsonb_typeof(new.art12bis -> 'presented_document') is distinct from 'string'
    or length(lesions) not between 1 and 120
    or length(presented) not between 1 and 160 then
    raise sqlstate 'PT423' using message = 'Completa las lesiones y el documento de identidad presentado.';
  end if;
  new.art12bis := new.art12bis || jsonb_build_object('lesions', lesions, 'presented_document', presented);
  return new;
end;
$$;
revoke all on function public.require_control_acta_fields() from public, anon, authenticated;
create trigger controls_require_acta_fields
before insert on public.controls
for each row execute function public.require_control_acta_fields();

commit;
