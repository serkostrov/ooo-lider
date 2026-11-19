-- Fix: PostgreSQL format() не поддерживает %+s
create or replace function public.object_stages_bulk_deadlines(
  p_object_id uuid,
  p_shift_days int default null,
  p_fill_empty date default null,
  p_stage_ids uuid[] default null
)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_n int := 0;
  v_part int := 0;
  v_shift int := coalesce(p_shift_days, 0);
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;
  if not public.can_see_object(p_object_id) then raise exception 'Нет доступа к объекту'; end if;
  if v_shift = 0 and p_fill_empty is null then
    raise exception 'Укажите сдвиг дней и/или дату для пустых сроков';
  end if;

  if v_shift <> 0 then
    update public.object_stages s
    set
      due_date = s.due_date + v_shift,
      start_date = case when s.start_date is not null then s.start_date + v_shift else s.start_date end,
      updated_at = now()
    from public.stage_statuses st
    where s.object_id = p_object_id
      and s.deleted_at is null
      and not s.is_excluded
      and s.status_code = st.code
      and not st.is_closed
      and s.due_date is not null
      and (p_stage_ids is null or s.id = any(p_stage_ids));
    get diagnostics v_part = row_count;
    v_n := v_n + v_part;
  end if;

  if p_fill_empty is not null then
    update public.object_stages s
    set due_date = p_fill_empty, updated_at = now()
    from public.stage_statuses st
    where s.object_id = p_object_id
      and s.deleted_at is null
      and not s.is_excluded
      and s.status_code = st.code
      and not st.is_closed
      and s.due_date is null
      and (p_stage_ids is null or s.id = any(p_stage_ids));
    get diagnostics v_part = row_count;
    v_n := v_n + v_part;
  end if;

  perform public.log_history(
    p_object_id, 'object', p_object_id, 'deadlines_bulk',
    format(
      'Массовые сроки: сдвиг %s дн.%s',
      case when v_shift > 0 then '+' || v_shift::text else v_shift::text end,
      case when p_fill_empty is not null then format(', пустые → %s', p_fill_empty) else '' end
    ),
    jsonb_build_object('shift_days', v_shift, 'fill_empty', p_fill_empty, 'updated', v_n)
  );
  return v_n;
end $$;
