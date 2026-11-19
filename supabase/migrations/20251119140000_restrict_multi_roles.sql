-- Мультироли только для пары сметчик + снабжение.

create or replace function public.set_profile_roles(p_profile_id uuid, p_roles text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_roles text[];
  v_primary text;
begin
  if not public.is_admin() then
    raise exception 'Нет прав';
  end if;
  if p_profile_id is null then
    raise exception 'Не указан сотрудник';
  end if;

  select array_agg(distinct r order by r)
  into v_roles
  from unnest(coalesce(p_roles, '{}'::text[])) r
  where nullif(trim(r), '') is not null;

  if v_roles is null or cardinality(v_roles) = 0 then
    raise exception 'Укажите хотя бы одну роль';
  end if;

  if exists (
    select 1 from unnest(v_roles) x(code)
    where not exists (select 1 from public.roles r where r.code = x.code)
  ) then
    raise exception 'Неизвестная роль';
  end if;

  -- Только одна роль, либо ровно estimator+supply
  if cardinality(v_roles) > 1
     and not (
       cardinality(v_roles) = 2
       and 'estimator' = any(v_roles)
       and 'supply' = any(v_roles)
     )
  then
    raise exception 'Несколько ролей можно только у сметчика и снабжения вместе';
  end if;

  select r.code into v_primary
  from public.roles r
  where r.code = any(v_roles)
  order by
    case when r.is_admin then 0 else 1 end,
    r.sort,
    r.code
  limit 1;

  delete from public.profile_roles where profile_id = p_profile_id;
  insert into public.profile_roles(profile_id, role_code)
  select p_profile_id, x.code from unnest(v_roles) x(code);

  update public.profiles
  set role_code = v_primary, updated_at = now()
  where id = p_profile_id;
end $$;
