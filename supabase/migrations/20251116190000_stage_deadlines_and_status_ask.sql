-- Массовые сроки + «запросить статус» у исполнителя.

-- ---------------------------------------------------------------------
-- 1. Сдвиг / заполнение сроков незакрытых этапов объекта
-- ---------------------------------------------------------------------
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

revoke all on function public.object_stages_bulk_deadlines(uuid, int, date, uuid[]) from public, anon;
grant execute on function public.object_stages_bulk_deadlines(uuid, int, date, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Запрос статуса
-- ---------------------------------------------------------------------
create table if not exists public.stage_status_asks (
  id           uuid primary key default gen_random_uuid(),
  stage_id     uuid not null references public.object_stages(id) on delete cascade,
  object_id    uuid not null references public.objects(id) on delete cascade,
  executor_id  uuid not null references public.profiles(id),
  asked_by     uuid not null references public.profiles(id),
  note         text,
  created_at   timestamptz not null default now(),
  seen_at      timestamptz
);

create index if not exists stage_status_asks_executor_idx
  on public.stage_status_asks (executor_id, created_at desc)
  where seen_at is null;

alter table public.stage_status_asks enable row level security;

drop policy if exists stage_status_asks_select on public.stage_status_asks;
create policy stage_status_asks_select on public.stage_status_asks
  for select to authenticated
  using (
    public.is_admin()
    or executor_id = public.current_profile_id()
    or asked_by = public.current_profile_id()
  );

grant select on public.stage_status_asks to authenticated;

create or replace function public.request_stage_status(p_stage_id uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  s public.object_stages;
  v_me uuid := public.current_profile_id();
  v_id uuid;
  v_exec uuid;
begin
  if v_me is null then raise exception 'Нет профиля'; end if;

  select * into s from public.object_stages where id = p_stage_id and deleted_at is null;
  if not found then raise exception 'Этап не найден'; end if;
  if not public.can_see_object(s.object_id) then raise exception 'Нет доступа'; end if;

  v_exec := coalesce(s.executor_id, (
    select responsible_id from public.objects where id = s.object_id
  ));
  if v_exec is null then raise exception 'Нет исполнителя / ответственного — некому слать запрос'; end if;

  insert into public.stage_status_asks(stage_id, object_id, executor_id, asked_by, note)
  values (s.id, s.object_id, v_exec, v_me, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_id;

  perform public.log_history(
    s.object_id, 'stage', s.id, 'status_ask',
    format('Запрошен статус по этапу %s «%s»', coalesce(s.code, s.number::text), s.name),
    jsonb_build_object('ask_id', v_id, 'executor_id', v_exec)
  );
  return v_id;
end $$;

grant execute on function public.request_stage_status(uuid, text) to authenticated;

create or replace function public.stage_status_ask_seen(p_ask_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_profile_id();
begin
  if v_me is null then raise exception 'Нет профиля'; end if;
  update public.stage_status_asks
  set seen_at = now()
  where id = p_ask_id
    and seen_at is null
    and (executor_id = v_me or public.is_admin());
end $$;

grant execute on function public.stage_status_ask_seen(uuid) to authenticated;
