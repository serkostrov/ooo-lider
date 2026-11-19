-- Этап «вне регламента»: без шаблона, на объекте, для полевой/внеплановой работы.

alter table public.object_stages
  add column if not exists is_adhoc boolean not null default false;

comment on column public.object_stages.is_adhoc is 'Работа вне регламента (не из справочника этапов)';

create or replace function public.add_object_adhoc_stage(
  p_object_id uuid,
  p_name text,
  p_description text default null,
  p_executor_id uuid default null,
  p_duration_days int default null,
  p_work_type_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_profile_id();
  v_id uuid;
  v_next int;
  v_sort int;
  v_code text;
  v_name text := trim(coalesce(p_name, ''));
  v_executor uuid;
begin
  if v_me is null then raise exception 'Нет профиля'; end if;
  if not public.can_see_object(p_object_id) then
    raise exception 'Нет доступа к объекту';
  end if;
  if not (
    public.is_admin()
    or exists (
      select 1 from public.object_members m
      where m.object_id = p_object_id and m.profile_id = v_me
    )
    or exists (
      select 1 from public.objects o
      where o.id = p_object_id and o.responsible_id = v_me and o.deleted_at is null
    )
  ) then
    raise exception 'Нет прав добавлять работу вне регламента';
  end if;
  if v_name = '' then raise exception 'Укажите название работы'; end if;

  v_executor := coalesce(p_executor_id, v_me);

  select coalesce(max(number), 0) into v_next
  from public.object_stages
  where object_id = p_object_id and deleted_at is null and parent_id is null;

  select coalesce(max(sort), 0) into v_sort
  from public.object_stages
  where object_id = p_object_id and deleted_at is null and parent_id is null;

  loop
    v_next := v_next + 1;
    v_code := v_next::text;
    exit when not exists (
      select 1 from public.object_stages
      where object_id = p_object_id and deleted_at is null and code = v_code
    );
  end loop;
  v_sort := v_sort + 1;

  insert into public.object_stages(
    object_id, template_id, parent_id, number, code, name, description,
    work_type_id, duration_days, executor_id, is_critical, is_adhoc, sort
  )
  values (
    p_object_id, null, null, v_next, v_code, v_name, nullif(trim(coalesce(p_description, '')), ''),
    p_work_type_id, p_duration_days, v_executor, false, true, v_sort
  )
  returning id into v_id;

  perform public.log_history(
    p_object_id, 'stage', v_id, 'adhoc_added',
    format('Добавлена работа вне регламента «%s» (%s)', v_name, v_code),
    jsonb_build_object('name', v_name, 'code', v_code)
  );
  return v_id;
end $$;

revoke all on function public.add_object_adhoc_stage(uuid, text, text, uuid, int, uuid) from public, anon;
grant execute on function public.add_object_adhoc_stage(uuid, text, text, uuid, int, uuid) to authenticated;
