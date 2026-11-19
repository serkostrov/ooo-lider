-- Нештатная ситуация на объекте: флаг виден всем, кто видит объект.

alter table public.objects
  add column if not exists emergency boolean not null default false,
  add column if not exists emergency_note text,
  add column if not exists emergency_at timestamptz,
  add column if not exists emergency_by uuid references public.profiles(id);

comment on column public.objects.emergency is 'Нештатная ситуация — выделение объекта для всех участников';

create or replace function public.object_set_emergency(
  p_object_id uuid,
  p_active boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_profile_id();
  v_note text := nullif(trim(coalesce(p_note, '')), '');
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
    raise exception 'Нет прав менять нештатную ситуацию';
  end if;

  if p_active then
    if v_note is null then
      raise exception 'Укажите, что произошло';
    end if;
    update public.objects
    set
      emergency = true,
      emergency_note = v_note,
      emergency_at = now(),
      emergency_by = v_me,
      updated_at = now()
    where id = p_object_id and deleted_at is null;
    perform public.log_history(
      p_object_id, 'object', p_object_id, 'emergency_on',
      format('Нештатная ситуация: %s', v_note),
      jsonb_build_object('note', v_note)
    );
  else
    update public.objects
    set
      emergency = false,
      emergency_note = null,
      emergency_at = null,
      emergency_by = null,
      updated_at = now()
    where id = p_object_id and deleted_at is null;
    perform public.log_history(
      p_object_id, 'object', p_object_id, 'emergency_off',
      'Нештатная ситуация снята',
      '{}'::jsonb
    );
  end if;
end $$;

revoke all on function public.object_set_emergency(uuid, boolean, text) from public, anon;
grant execute on function public.object_set_emergency(uuid, boolean, text) to authenticated;
