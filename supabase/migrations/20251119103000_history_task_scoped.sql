-- История для task-scoped ролей: только свои этапы/заявки (и свои действия).
-- foreman/pto/office/admin — как раньше, на уровне объекта.

create or replace function public.can_see_history_row(
  p_object_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_actor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when public.is_admin() then true
      when not public.is_task_scoped_role() then
        p_object_id is not null and public.can_see_object(p_object_id)
      else
        -- свои действия всегда видны
        p_actor_id = public.current_profile_id()
        or (
          p_entity_type = 'stage'
          and p_entity_id is not null
          and public.can_see_stage(p_entity_id)
        )
        or (
          p_entity_type = 'request'
          and p_entity_id is not null
          and public.can_see_request(p_entity_id)
        )
    end;
$$;

grant execute on function public.can_see_history_row(uuid, text, uuid, uuid) to authenticated;

drop policy if exists history_sel on public.history;
create policy history_sel on public.history
  for select to authenticated
  using (
    public.can_see_history_row(object_id, entity_type, entity_id, actor_id)
  );
