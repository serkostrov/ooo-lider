-- =====================================================================
-- «Лидер» — правка 2.14: «Ход заявки» настраивается в справочнике
--
-- Справочник «Статусы заявки» — как «Статусы этапа» в ТЗ: пять шагов и их
-- порядок фиксированы (на них держатся проверка обязательных полей,
-- даты отправки/принятия/исполнения, просрочки и счётчики), а название шага,
-- текст кнопки перехода на него и цвет — настраиваются.
-- request_set_status() пишет в историю название шага из справочника;
-- всё остальное в функции — как в 00_lider_v1_migration.sql.
--
-- Запускать в Supabase → SQL Editor ПОСЛЕ 00…09. Повторный запуск безопасен
-- (уже заданные названия и цвета не перезаписываются).
-- =====================================================================

create table if not exists public.request_statuses (
  code          text primary key check (code in ('new','ready','sent','accepted','done')),
  name          text not null,        -- название шага: «Отправлена»
  action_label  text not null,        -- текст кнопки перехода на шаг: «Отправлена»
  color         text not null,        -- #RRGGBB
  sort          int  not null
);

insert into public.request_statuses(code, name, action_label, color, sort) values
  ('new',      'Новая',              '',                   '#C2412D', 1),
  ('ready',    'Готова к отправке',  'Готова к отправке',  '#B7791F', 2),
  ('sent',     'Отправлена',         'Отправлена',         '#5B5FA8', 3),
  ('accepted', 'Принята заказчиком', 'Принята заказчиком', '#2F6F8F', 4),
  ('done',     'Исполнена',          'Исполнено',          '#2E7D4F', 5)
on conflict (code) do nothing;

-- Читают все; менять (только названия, текст кнопки и цвет) — администратор и руководитель.
-- Добавлять и удалять шаги нельзя: политик на insert/delete нет.
alter table public.request_statuses enable row level security;
drop policy if exists request_statuses_sel on public.request_statuses;
drop policy if exists request_statuses_upd on public.request_statuses;
create policy request_statuses_sel on public.request_statuses for select to authenticated using (true);
create policy request_statuses_upd on public.request_statuses for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, update (name, action_label, color) on public.request_statuses to authenticated;

create or replace function public.request_set_status(p_request_id uuid, p_status text, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests; v_order text[] := array['new','ready','sent','accepted','done'];
        v_from int; v_to int; v_missing int;
        v_names jsonb := '{"new":"Новая","ready":"Готова к отправке","sent":"Отправлена","accepted":"Принята заказчиком","done":"Исполнена"}';
        v_name text;
begin
  select * into r from public.requests where id = p_request_id and deleted_at is null for update;
  if not found then raise exception 'Заявка не найдена'; end if;
  if not public.can_see_object(r.object_id) then raise exception 'Нет прав'; end if;
  v_from := array_position(v_order, r.status);
  v_to   := array_position(v_order, p_status);
  if v_to is null then raise exception 'Неизвестный статус %', p_status; end if;
  if v_to = v_from then return; end if;
  if v_to > v_from + 1 then raise exception 'Статусы проходятся по порядку'; end if;
  if v_to < v_from and coalesce(trim(p_comment), '') = '' then raise exception 'Укажите причину возврата'; end if;

  if p_status = 'ready' then
    select count(*) into v_missing from public.request_type_fields f
    where f.request_type_id = r.request_type_id and f.is_active and f.deleted_at is null and f.is_required
      and not exists (select 1 from public.request_field_values fv
                      where fv.request_id = r.id and fv.field_id = f.id
                        and fv.value is not null and fv.value <> 'null'::jsonb and fv.value <> '""'::jsonb)
      and not (f.field_type = 'file' and exists (select 1 from public.files fl
               where fl.entity_type = 'request_field' and fl.entity_id = r.id and fl.deleted_at is null));
    if v_missing > 0 then raise exception 'Заполните обязательные поля: %', v_missing; end if;
  end if;

  perform set_config('lider.rpc', 'on', true);
  update public.requests set
    status      = p_status,
    office_id   = case when p_status = 'ready' and office_id is null then public.current_profile_id() else office_id end,
    sent_at     = case when p_status = 'sent' then now() when v_to < 3 then null else sent_at end,
    accepted_at = case when p_status = 'accepted' then now() when v_to < 4 then null else accepted_at end,
    done_at     = case when p_status = 'done' then now() else null end,
    done_by     = case when p_status = 'done' then public.current_profile_id() else null end,
    result_text = case when p_status = 'done' and p_comment is not null then p_comment else result_text end
  where id = r.id;

  if p_comment is not null and p_comment <> '' then
    insert into public.request_comments(request_id, author_id, text)
    values (r.id, public.current_profile_id(), p_comment);
  end if;

  -- Название шага — из справочника «Статусы заявки» (правка 2.14), запасное — встроенное
  select coalesce((select s.name from public.request_statuses s where s.code = p_status), v_names->>p_status) into v_name;
  perform public.log_history(r.object_id, 'request', r.id, 'status_changed',
    format('Заявка №%s «%s»: %s', r.number, r.type_name, v_name),
    jsonb_build_object('from', r.status, 'to', p_status));
end $$;


-- Проверка: шагов 5
select (select count(*) from public.request_statuses) as statuses;
