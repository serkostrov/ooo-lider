-- =====================================================================
-- ООО «Лидер» · единая init-миграция (squash 00000–00017)
-- Для чистого развёртывания на пустой БД Supabase.
-- =====================================================================


-- =============================================================================
-- 20251020000000_lider_v1_migration.sql
-- =============================================================================

-- =====================================================================
-- ООО «Лидер» · Система контроля этапов работ · Версия 1
-- Миграция БД (Supabase / PostgreSQL 15+)
-- Основание: Договор № 210926/1 от 21.09.2026, созвон с заказчиком 14.10.2026
-- Принципы: RLS на уровне БД через security definer функции; мягкое удаление
-- (deleted_at); timestamptz в UTC, отображение — Europe/Moscow; статусы
-- меняются только через RPC; справочные значения — снимком в рабочие записи.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 0. Служебное
-- ---------------------------------------------------------------------
create or replace function public.msk_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Moscow')::date $$;

create or replace function public.tg_set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

-- ---------------------------------------------------------------------
-- 1. Роли и сотрудники
-- ---------------------------------------------------------------------
create table public.roles (
  code        text primary key,
  name        text not null,
  is_admin    boolean not null default false,   -- полный доступ ко всему
  sort        int not null default 0
);

create table public.profiles (                    -- «Сотрудники»
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users(id) on delete set null, -- логин (может отсутствовать)
  full_name   text not null,
  role_code   text not null references public.roles(code),
  phone       text,
  email       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create trigger profiles_updated before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Заказчики (справочник)
-- ---------------------------------------------------------------------
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                     -- «ООО …», «АО «МОСГАЗ»»
  inn         text,
  kpp         text,
  ogrn        text,
  legal_address text,
  comment     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create trigger customers_updated before update on public.customers
  for each row execute function public.tg_set_updated_at();

create table public.customer_contacts (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  full_name   text not null,
  position    text,
  phone       text,
  email       text,
  comment     text,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index on public.customer_contacts(customer_id);

-- ---------------------------------------------------------------------
-- 3. Справочники этапов и документов
-- ---------------------------------------------------------------------
create table public.work_types (                  -- «Вид работ»
  id    uuid primary key default gen_random_uuid(),
  name  text not null unique,
  sort  int not null default 0,
  deleted_at timestamptz
);

create table public.stage_statuses (              -- настраиваемые название и цвет; код — фиксирован
  code       text primary key,
  name       text not null,
  color      text not null,                       -- hex
  sort       int not null,
  is_closed  boolean not null default false
);

create table public.documents (                   -- «Справочник документов»
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  section       text not null,                    -- ГСН / ГСВ / МосГаз / МГГТ и Геотрест / органы города
  to_id_folder  boolean not null default true,    -- «в папку ИД»
  stage_template_id uuid,                         -- привязка к этапу (FK ниже)
  comment       text,
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create table public.stage_templates (             -- «Справочник этапов»
  id              uuid primary key default gen_random_uuid(),
  number          int not null,                   -- номер этапа
  name            text not null,
  work_type_id    uuid references public.work_types(id),
  description     text,
  duration_days   int check (duration_days is null or duration_days >= 0), -- «количество дней на этап»
  executor_role   text references public.roles(code),   -- роль исполнителя по регламенту
  confirmer_role  text references public.roles(code),   -- «Адресат (кто подтверждает)»
  outgoing_doc    text,                           -- «от нас»: исходящий документ
  expected_doc    text,                           -- «ждём»: ожидаемый ответный документ
  response_days   int check (response_days is null or response_days >= 0), -- нормативный срок ответа
  remind_days     int check (remind_days is null or remind_days >= 0),     -- напомнить за N дней
  is_critical     boolean not null default false,
  is_active       boolean not null default true,  -- снятие галочки ≠ удаление
  sort            int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create trigger stage_templates_updated before update on public.stage_templates
  for each row execute function public.tg_set_updated_at();
alter table public.documents add constraint documents_stage_template_fk
  foreign key (stage_template_id) references public.stage_templates(id);

create table public.stage_template_predecessors (
  template_id     uuid not null references public.stage_templates(id),
  predecessor_id  uuid not null references public.stage_templates(id),
  primary key (template_id, predecessor_id),
  check (template_id <> predecessor_id)
);

create table public.stage_template_conditions (   -- «Условия закрытия» шаблона
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references public.stage_templates(id),
  title         text not null,
  kind          text not null default 'check' check (kind in ('check','file','field')),
  is_required   boolean not null default true,
  to_id_folder  boolean not null default false,
  document_id   uuid references public.documents(id),
  sort          int not null default 0,
  deleted_at    timestamptz
);
create index on public.stage_template_conditions(template_id);

create table public.stage_template_steps (        -- «Сценарий этапа» (кто, что, в каком порядке)
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references public.stage_templates(id),
  step_no       int not null,
  role_code     text not null references public.roles(code),
  action        text not null,                   -- «прикрепить схему», «отправить в ЖКХ»
  action_kind   text not null default 'other' check (action_kind in ('fill','attach','send','confirm','other')),
  duration_days int check (duration_days is null or duration_days >= 0),
  deleted_at    timestamptz,
  unique (template_id, step_no)
);

-- ---------------------------------------------------------------------
-- 4. Объекты
-- ---------------------------------------------------------------------
create table public.objects (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,                 -- название договора объекта
  address         text,
  customer_id     uuid references public.customers(id),
  object_type     text not null default 'uks' check (object_type in ('uks','urip')), -- УКС / УРиП
  contract_start  date,                          -- дата начала по договору
  contract_end    date,                          -- дата окончания по договору
  responsible_id  uuid references public.profiles(id), -- ответственный за объект
  status          text not null default 'in_work' check (status in ('planned','in_work','completed')),
  notes           text,                          -- до ответа заказчика по «Параметрам»
  completed_at    timestamptz,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  check (contract_end is null or contract_start is null or contract_end >= contract_start)
);
create trigger objects_updated before update on public.objects
  for each row execute function public.tg_set_updated_at();

create table public.object_members (              -- участники объекта
  object_id   uuid not null references public.objects(id),
  profile_id  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  primary key (object_id, profile_id)
);
create index on public.object_members(profile_id);

-- ---------------------------------------------------------------------
-- 5. Этапы объекта (копия шаблона на момент добавления)
-- ---------------------------------------------------------------------
create table public.object_stages (
  id              uuid primary key default gen_random_uuid(),
  object_id       uuid not null references public.objects(id),
  template_id     uuid references public.stage_templates(id),
  number          int not null,
  name            text not null,
  work_type_id    uuid references public.work_types(id),
  description     text,
  duration_days   int,
  executor_id     uuid references public.profiles(id),
  coexecutor_id   uuid references public.profiles(id),
  confirmer_role  text references public.roles(code),     -- адресат по регламенту
  confirmer_id    uuid references public.profiles(id),    -- конкретный сотрудник-адресат
  status_code     text not null default 'not_started' references public.stage_statuses(code),
  start_date      date,
  due_date        date,                                   -- срок окончания («Дата» в таблице)
  outgoing_doc    text,
  expected_doc    text,
  doc_sent_at     date,                                   -- документ отправлен
  response_days   int,
  response_due    date generated always as (doc_sent_at + response_days) stored, -- ответ ждём до
  response_received_at date,
  remind_days     int,
  note            text,                                   -- «Примечание» / что мешает, когда обещали
  is_critical     boolean not null default false,
  is_excluded     boolean not null default false,         -- исключён из работы на этом объекте
  out_of_order    boolean not null default false,         -- взят в работу с нарушением последовательности
  return_reason   text,                                   -- последняя причина возврата на доработку
  closed_at       timestamptz,
  closed_by       uuid references public.profiles(id),
  sort            int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index on public.object_stages(object_id);
create trigger object_stages_updated before update on public.object_stages
  for each row execute function public.tg_set_updated_at();

create table public.object_stage_predecessors (
  stage_id        uuid not null references public.object_stages(id),
  predecessor_id  uuid not null references public.object_stages(id),
  primary key (stage_id, predecessor_id)
);

create table public.object_stage_conditions (
  id            uuid primary key default gen_random_uuid(),
  stage_id      uuid not null references public.object_stages(id),
  title         text not null,
  kind          text not null default 'check' check (kind in ('check','file','field')),
  is_required   boolean not null default true,
  to_id_folder  boolean not null default false,
  document_id   uuid references public.documents(id),
  is_done       boolean not null default false,
  value_text    text,                              -- для kind = 'field'
  done_by       uuid references public.profiles(id),
  done_at       timestamptz,
  sort          int not null default 0,
  deleted_at    timestamptz
);
create index on public.object_stage_conditions(stage_id);

create table public.object_stage_steps (
  id            uuid primary key default gen_random_uuid(),
  stage_id      uuid not null references public.object_stages(id),
  step_no       int not null,
  role_code     text not null references public.roles(code),
  action        text not null,
  action_kind   text not null default 'other',
  duration_days int,
  assignee_id   uuid references public.profiles(id),
  state         text not null default 'pending' check (state in ('pending','current','done')),
  done_by       uuid references public.profiles(id),
  done_at       timestamptz,
  comment       text,
  unique (stage_id, step_no)
);

-- ---------------------------------------------------------------------
-- 6. Заявки (вызовы)
-- ---------------------------------------------------------------------
create table public.representatives (             -- «Представители» (Россети, Водоканал, …)
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text,
  email      text,
  comment    text,
  is_active  boolean not null default true,
  sort       int not null default 0,
  deleted_at timestamptz
);

create table public.request_types (               -- кнопки: Технадзор, Лаборатория МГ, …
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  sort                  int not null default 0,
  is_active             boolean not null default true,
  uses_representatives  boolean not null default false, -- выбор «кого вызываем» из справочника
  send_to_email         text,                            -- адрес, куда офис-менеджер отправляет
  created_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

create table public.request_type_fields (         -- настраиваемые поля заявки
  id               uuid primary key default gen_random_uuid(),
  request_type_id  uuid not null references public.request_types(id),
  label            text not null,
  field_type       text not null check (field_type in ('text','number','date','select','checkbox','file')),
  options          jsonb not null default '[]'::jsonb,   -- варианты для select
  is_required      boolean not null default false,
  filled_by        text not null default 'initiator' check (filled_by in ('initiator','office')),
  sort             int not null default 0,
  is_active        boolean not null default true,
  deleted_at       timestamptz
);
create index on public.request_type_fields(request_type_id);

create sequence public.requests_number_seq;

create table public.requests (
  id                 uuid primary key default gen_random_uuid(),
  number             bigint not null unique default nextval('public.requests_number_seq'),
  object_id          uuid not null references public.objects(id),
  request_type_id    uuid not null references public.request_types(id),
  type_name          text not null,                     -- снимок названия вида
  representative_id  uuid references public.representatives(id),
  stage_id           uuid references public.object_stages(id), -- связь с этапом (необязательно)
  initiator_id       uuid references public.profiles(id),      -- прораб / инженер ПТО
  office_id          uuid references public.profiles(id),      -- офис-менеджер, кто обрабатывает
  call_date          date not null,                     -- дата вызова (единственная вводимая)
  status             text not null default 'new'
                     check (status in ('new','ready','sent','accepted','done')),
  sent_at            timestamptz,
  accepted_at        timestamptz,
  done_at            timestamptz,
  done_by            uuid references public.profiles(id),
  result_text        text,                              -- номер протокола / результат
  created_at         timestamptz not null default now(), -- дата формирования — системная
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  delete_reason      text
);
create index on public.requests(object_id);
create index on public.requests(status);
create trigger requests_updated before update on public.requests
  for each row execute function public.tg_set_updated_at();

create table public.request_field_values (
  request_id   uuid not null references public.requests(id),
  field_id     uuid not null references public.request_type_fields(id),
  label        text not null,                     -- снимок подписи поля
  field_type   text not null,                     -- снимок типа
  value        jsonb,                             -- число / строка / дата ISO / bool
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles(id),
  primary key (request_id, field_id)
);

create table public.request_comments (            -- переписка внутри заявки
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.requests(id),
  author_id   uuid references public.profiles(id),
  text        text not null,
  created_at  timestamptz not null default now()
);
create index on public.request_comments(request_id);

-- ---------------------------------------------------------------------
-- 7. Файлы и история
-- ---------------------------------------------------------------------
create table public.files (
  id            uuid primary key default gen_random_uuid(),
  object_id     uuid not null references public.objects(id),
  entity_type   text not null check (entity_type in ('stage','stage_condition','request','request_field')),
  entity_id     uuid not null,
  kind          text not null default 'other' check (kind in ('draft','signed','photo','other')),
  storage_path  text not null,                    -- bucket lider-files: {object_id}/{entity_type}/{entity_id}/{uuid}-{name}
  file_name     text not null,
  mime_type     text,
  size_bytes    bigint,
  uploaded_by   uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index on public.files(entity_type, entity_id);

create table public.history (                     -- «История» — журнал действий
  id           bigint generated always as identity primary key,
  object_id    uuid references public.objects(id),
  entity_type  text not null,                     -- object / stage / request / template / …
  entity_id    uuid,
  action       text not null,                     -- status_changed, condition_done, created, …
  message      text not null,                     -- готовая строка для ленты
  payload      jsonb not null default '{}'::jsonb,
  actor_id     uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);
create index on public.history(object_id, created_at desc);
create index on public.history(entity_type, entity_id);

-- ---------------------------------------------------------------------
-- 8. Хелперы доступа (security definer)
-- ---------------------------------------------------------------------
create or replace function public.current_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles
  where user_id = auth.uid() and deleted_at is null and is_active
  limit 1 $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p join public.roles r on r.code = p.role_code
    where p.user_id = auth.uid() and p.deleted_at is null and p.is_active and r.is_admin) $$;

create or replace function public.can_see_object(p_object_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.objects o
    where o.id = p_object_id and o.deleted_at is null
      and (o.responsible_id = public.current_profile_id()
           or exists (select 1 from public.object_members m
                      where m.object_id = o.id and m.profile_id = public.current_profile_id()))) $$;

create or replace function public.log_history(
  p_object_id uuid, p_entity_type text, p_entity_id uuid,
  p_action text, p_message text, p_payload jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.history(object_id, entity_type, entity_id, action, message, payload, actor_id)
  values (p_object_id, p_entity_type, p_entity_id, p_action, p_message,
          coalesce(p_payload, '{}'::jsonb), public.current_profile_id()) $$;

-- Статус этапа и заявки — только через RPC
create or replace function public.tg_guard_status() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('lider.rpc', true), '') <> 'on' then
    if tg_table_name = 'object_stages' and new.status_code is distinct from old.status_code then
      raise exception 'Статус этапа меняется только через stage_set_status()';
    elsif tg_table_name = 'requests' and new.status is distinct from old.status then
      raise exception 'Статус заявки меняется только через request_set_status()';
    end if;
  end if;
  return new;
end $$;
create trigger object_stages_guard before update on public.object_stages
  for each row execute function public.tg_guard_status();
create trigger requests_guard before update on public.requests
  for each row execute function public.tg_guard_status();

-- ---------------------------------------------------------------------
-- 9. RPC: объекты и этапы
-- ---------------------------------------------------------------------
-- Копирует шаблоны в этапы объекта (условия, сценарий, связи)
-- Нумерация этапов на объекте: 1…n по порядку (не номера из справочника).
create or replace function public.renumber_object_stages(p_object_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Два прохода: сначала отрицательные, чтобы не пересечься с текущими номерами.
  with ordered as (
    select id, row_number() over (order by sort, number, created_at) as rn
    from public.object_stages
    where object_id = p_object_id and deleted_at is null
  )
  update public.object_stages s
  set number = -o.rn, sort = -o.rn
  from ordered o
  where s.id = o.id;

  update public.object_stages
  set number = -number, sort = -sort
  where object_id = p_object_id and deleted_at is null and number < 0;
end $$;

revoke all on function public.renumber_object_stages(uuid) from public, anon, authenticated;

create or replace function public.add_object_stages(p_object_id uuid, p_template_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare
  t record; v_stage uuid; v_count int := 0; v_first int; v_next int;
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;

  select coalesce(max(number), 0) into v_next
  from public.object_stages
  where object_id = p_object_id and deleted_at is null;

  for t in select * from public.stage_templates
           where id = any(p_template_ids) and deleted_at is null
             and not exists (select 1 from public.object_stages s
                             where s.object_id = p_object_id and s.template_id = stage_templates.id
                               and s.deleted_at is null)
           order by sort, number
  loop
    v_next := v_next + 1;
    insert into public.object_stages(object_id, template_id, number, name, work_type_id, description,
      duration_days, confirmer_role, outgoing_doc, expected_doc, response_days, remind_days,
      is_critical, sort)
    values (p_object_id, t.id, v_next, t.name, t.work_type_id, t.description, t.duration_days,
      t.confirmer_role, t.outgoing_doc, t.expected_doc, t.response_days, t.remind_days,
      t.is_critical, v_next)
    returning id into v_stage;

    insert into public.object_stage_conditions(stage_id, title, kind, is_required, to_id_folder, document_id, sort)
    select v_stage, c.title, c.kind, c.is_required, c.to_id_folder, c.document_id, c.sort
    from public.stage_template_conditions c where c.template_id = t.id and c.deleted_at is null;

    select min(step_no) into v_first from public.stage_template_steps
    where template_id = t.id and deleted_at is null;
    insert into public.object_stage_steps(stage_id, step_no, role_code, action, action_kind, duration_days, state)
    select v_stage, st.step_no, st.role_code, st.action, st.action_kind, st.duration_days,
           case when st.step_no = v_first then 'current' else 'pending' end
    from public.stage_template_steps st where st.template_id = t.id and st.deleted_at is null;

    -- исполнитель по регламенту: первый участник объекта с этой ролью
    update public.object_stages s set executor_id = (
      select m.profile_id from public.object_members m join public.profiles p on p.id = m.profile_id
      where m.object_id = p_object_id and p.role_code = t.executor_role and p.deleted_at is null
      order by m.created_at limit 1)
    where s.id = v_stage and t.executor_role is not null;

    v_count := v_count + 1;
  end loop;

  -- связи «предшествующие этапы» в пределах объекта
  insert into public.object_stage_predecessors(stage_id, predecessor_id)
  select s.id, sp.id
  from public.object_stages s
  join public.stage_template_predecessors tp on tp.template_id = s.template_id
  join public.object_stages sp on sp.template_id = tp.predecessor_id and sp.object_id = s.object_id
  where s.object_id = p_object_id and s.deleted_at is null and sp.deleted_at is null
  on conflict do nothing;

  -- На объекте всегда сплошные 1…n (номера справочника не переносятся)
  perform public.renumber_object_stages(p_object_id);

  if v_count > 0 then
    perform public.log_history(p_object_id, 'object', p_object_id, 'stages_added',
      format('Добавлено этапов: %s', v_count), jsonb_build_object('template_ids', p_template_ids));
  end if;
  return v_count;
end $$;

-- Создание объекта: карточка + участники + этапы из справочника
create or replace function public.create_object(p_object jsonb, p_member_ids uuid[], p_template_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;
  insert into public.objects(name, address, customer_id, object_type, contract_start, contract_end,
                             responsible_id, status, notes, created_by)
  values (p_object->>'name', p_object->>'address', nullif(p_object->>'customer_id','')::uuid,
          coalesce(p_object->>'object_type','uks'), nullif(p_object->>'contract_start','')::date,
          nullif(p_object->>'contract_end','')::date, nullif(p_object->>'responsible_id','')::uuid,
          coalesce(p_object->>'status','in_work'), p_object->>'notes', public.current_profile_id())
  returning id into v_id;

  insert into public.object_members(object_id, profile_id)
  select v_id, unnest(coalesce(p_member_ids, '{}')) on conflict do nothing;

  perform public.log_history(v_id, 'object', v_id, 'created', 'Объект создан', p_object);
  perform public.add_object_stages(v_id, coalesce(p_template_ids, '{}'));
  return v_id;
end $$;

-- Смена статуса этапа (единая точка)
create or replace function public.stage_set_status(p_stage_id uuid, p_status text, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s public.object_stages; v_open_required int; v_open_pred int; v_name text; v_old text;
begin
  select * into s from public.object_stages where id = p_stage_id and deleted_at is null for update;
  if not found then raise exception 'Этап не найден'; end if;
  if not public.can_see_object(s.object_id) then raise exception 'Нет прав'; end if;
  if not exists (select 1 from public.stage_statuses where code = p_status) then
    raise exception 'Неизвестный статус %', p_status; end if;

  -- на проверку — только при отмеченных обязательных условиях закрытия
  if p_status in ('on_review','closed') then
    select count(*) into v_open_required from public.object_stage_conditions
    where stage_id = s.id and deleted_at is null and is_required and not is_done;
    if v_open_required > 0 then
      raise exception 'Не отмечены условия закрытия: %', v_open_required; end if;
  end if;

  -- закрывает только уполномоченный (v1: администратор/руководитель или назначенный адресат)
  if p_status = 'closed' and not (public.is_admin()
       or coalesce(s.confirmer_id = public.current_profile_id(), false)) then
    raise exception 'Закрыть этап может только адресат или руководитель'; end if;

  -- возврат на доработку — с причиной
  if s.status_code = 'on_review' and p_status in ('in_work','not_started') and coalesce(trim(p_comment),'') = '' then
    raise exception 'Укажите причину возврата'; end if;

  perform set_config('lider.rpc', 'on', true);
  v_old := s.status_code;

  update public.object_stages set
    status_code = p_status,
    start_date  = case when p_status <> 'not_started' and start_date is null then public.msk_today() else start_date end,
    due_date    = case when p_status <> 'not_started' and due_date is null and duration_days is not null
                       then coalesce(start_date, public.msk_today()) + duration_days else due_date end,
    doc_sent_at = case when p_status in ('sent','on_approval') and doc_sent_at is null then public.msk_today() else doc_sent_at end,
    closed_at   = case when p_status = 'closed' then now() else null end,
    closed_by   = case when p_status = 'closed' then public.current_profile_id() else null end,
    return_reason = case when v_old = 'on_review' and p_status in ('in_work','not_started') then p_comment else return_reason end,
    out_of_order = out_of_order or (v_old = 'not_started' and p_status <> 'not_started' and exists (
      select 1 from public.object_stage_predecessors pr join public.object_stages ps on ps.id = pr.predecessor_id
      where pr.stage_id = s.id and ps.status_code <> 'closed' and not ps.is_excluded and ps.deleted_at is null))
  where id = s.id;

  select name into v_name from public.stage_statuses where code = p_status;
  perform public.log_history(s.object_id, 'stage', s.id, 'status_changed',
    format('Этап %s «%s»: %s%s', s.number, s.name, v_name,
           case when p_comment is not null and p_comment <> '' then ' — ' || p_comment else '' end),
    jsonb_build_object('from', v_old, 'to', p_status));
end $$;

-- Отметка условия закрытия
create or replace function public.stage_condition_set(p_condition_id uuid, p_done boolean, p_value text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select oc.*, s.object_id, s.number, s.name as stage_name into c
  from public.object_stage_conditions oc join public.object_stages s on s.id = oc.stage_id
  where oc.id = p_condition_id;
  if not found then raise exception 'Условие не найдено'; end if;
  if not public.can_see_object(c.object_id) then raise exception 'Нет прав'; end if;
  if p_done and c.kind = 'file' and not exists (
      select 1 from public.files f where f.entity_type = 'stage_condition' and f.entity_id = c.id and f.deleted_at is null) then
    raise exception 'Сначала прикрепите файл'; end if;
  if p_done and c.kind = 'field' and coalesce(trim(p_value), '') = '' then
    raise exception 'Заполните значение'; end if;

  update public.object_stage_conditions set
    is_done = p_done, value_text = coalesce(p_value, value_text),
    done_by = case when p_done then public.current_profile_id() end,
    done_at = case when p_done then now() end
  where id = p_condition_id;

  perform public.log_history(c.object_id, 'stage', c.stage_id, 'condition_set',
    format('Этап %s: условие «%s» — %s', c.number, c.title, case when p_done then 'выполнено' else 'снята отметка' end));
end $$;

-- Сценарий: текущий шаг выполнен → передать следующему («эстафета»)
create or replace function public.stage_step_complete(p_step_id uuid, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare st record; v_next uuid;
begin
  select ss.*, s.object_id, s.number into st
  from public.object_stage_steps ss join public.object_stages s on s.id = ss.stage_id where ss.id = p_step_id;
  if not found then raise exception 'Шаг не найден'; end if;
  if not public.can_see_object(st.object_id) then raise exception 'Нет прав'; end if;
  if st.state <> 'current' then raise exception 'Можно завершить только текущий шаг'; end if;

  update public.object_stage_steps set state = 'done', done_by = public.current_profile_id(),
         done_at = now(), comment = p_comment where id = p_step_id;
  select id into v_next from public.object_stage_steps
  where stage_id = st.stage_id and step_no > st.step_no order by step_no limit 1;
  if v_next is not null then
    update public.object_stage_steps set state = 'current' where id = v_next;
  end if;

  perform public.log_history(st.object_id, 'stage', st.stage_id, 'step_done',
    format('Этап %s: шаг %s «%s» выполнен', st.number, st.step_no, st.action));
end $$;

-- Исключить / вернуть этап на объекте
create or replace function public.stage_set_excluded(p_stage_id uuid, p_excluded boolean)
returns void language plpgsql security definer set search_path = public as $$
declare s public.object_stages;
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;
  update public.object_stages set is_excluded = p_excluded where id = p_stage_id returning * into s;
  perform public.log_history(s.object_id, 'stage', s.id, 'excluded',
    format('Этап %s «%s» %s', s.number, s.name, case when p_excluded then 'исключён из работы' else 'возвращён в работу' end));
end $$;

-- ---------------------------------------------------------------------
-- 10. RPC: заявки
-- ---------------------------------------------------------------------
-- p_values: [{ "field_id": "...", "value": <json> }, …]
create or replace function public.request_save_values(p_request_id uuid, p_values jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests; v jsonb; f public.request_type_fields;
begin
  select * into r from public.requests where id = p_request_id and deleted_at is null;
  if not found then raise exception 'Заявка не найдена'; end if;
  if not public.can_see_object(r.object_id) then raise exception 'Нет прав'; end if;
  for v in select * from jsonb_array_elements(coalesce(p_values, '[]'::jsonb)) loop
    select * into f from public.request_type_fields where id = (v->>'field_id')::uuid;
    if f.id is null or f.request_type_id <> r.request_type_id then raise exception 'Поле не относится к виду заявки'; end if;
    insert into public.request_field_values(request_id, field_id, label, field_type, value, updated_by)
    values (r.id, f.id, f.label, f.field_type, v->'value', public.current_profile_id())
    on conflict (request_id, field_id) do update
      set value = excluded.value, label = excluded.label, field_type = excluded.field_type,
          updated_at = now(), updated_by = excluded.updated_by;
  end loop;
end $$;

create or replace function public.request_create(
  p_object_id uuid, p_request_type_id uuid, p_call_date date,
  p_values jsonb default '[]'::jsonb, p_representative_id uuid default null,
  p_stage_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; t public.request_types; v_missing int; v_number bigint;
begin
  if not public.can_see_object(p_object_id) then raise exception 'Нет прав'; end if;
  select * into t from public.request_types where id = p_request_type_id and deleted_at is null and is_active;
  if not found then raise exception 'Вид заявки не найден'; end if;
  if p_call_date is null then raise exception 'Укажите дату вызова'; end if;
  if t.uses_representatives and p_representative_id is null then raise exception 'Выберите, кого вызываем'; end if;

  insert into public.requests(object_id, request_type_id, type_name, representative_id, stage_id,
                              initiator_id, call_date)
  values (p_object_id, t.id, t.name, p_representative_id, p_stage_id, public.current_profile_id(), p_call_date)
  returning id, number into v_id, v_number;

  perform public.request_save_values(v_id, p_values);

  select count(*) into v_missing from public.request_type_fields f
  where f.request_type_id = t.id and f.is_active and f.deleted_at is null
    and f.is_required and f.filled_by = 'initiator' and f.field_type <> 'file'
    and not exists (select 1 from public.request_field_values fv
                    where fv.request_id = v_id and fv.field_id = f.id
                      and fv.value is not null and fv.value <> 'null'::jsonb and fv.value <> '""'::jsonb);
  if v_missing > 0 then raise exception 'Заполните обязательные поля: %', v_missing; end if;

  perform public.log_history(p_object_id, 'request', v_id, 'created',
    format('Заявка №%s «%s» создана, вызов на %s', v_number, t.name, to_char(p_call_date, 'DD.MM.YYYY')));
  return v_id;
end $$;

-- new → ready → sent → accepted → done; шаг назад — с комментарием
create or replace function public.request_set_status(p_request_id uuid, p_status text, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests; v_order text[] := array['new','ready','sent','accepted','done'];
        v_from int; v_to int; v_missing int;
        v_names jsonb := '{"new":"Новая","ready":"Готова к отправке","sent":"Отправлена","accepted":"Принята заказчиком","done":"Исполнена"}';
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

  perform public.log_history(r.object_id, 'request', r.id, 'status_changed',
    format('Заявка №%s «%s»: %s', r.number, r.type_name, v_names->>p_status),
    jsonb_build_object('from', r.status, 'to', p_status));
end $$;

create or replace function public.request_set_call_date(p_request_id uuid, p_call_date date, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests;
begin
  select * into r from public.requests where id = p_request_id and deleted_at is null;
  if not public.can_see_object(r.object_id) then raise exception 'Нет прав'; end if;
  if coalesce(trim(p_comment),'') = '' then raise exception 'Укажите причину переноса'; end if;
  update public.requests set call_date = p_call_date where id = r.id;
  insert into public.request_comments(request_id, author_id, text)
  values (r.id, public.current_profile_id(), 'Перенос на ' || to_char(p_call_date,'DD.MM.YYYY') || ': ' || p_comment);
  perform public.log_history(r.object_id, 'request', r.id, 'call_date_changed',
    format('Заявка №%s: вызов перенесён с %s на %s', r.number, to_char(r.call_date,'DD.MM.YYYY'), to_char(p_call_date,'DD.MM.YYYY')));
end $$;

-- ---------------------------------------------------------------------
-- 11. Представления (расчёты — в БД, не на фронте)
-- ---------------------------------------------------------------------
create or replace view public.v_object_stages with (security_invoker = true) as
select s.*,
  st.name  as status_name, st.color as status_color, st.is_closed,
  wt.name  as work_type_name,
  e.full_name  as executor_name,
  ce.full_name as coexecutor_name,
  cr.name      as confirmer_role_name,
  cf.full_name as confirmer_name,
  (select count(*) from public.object_stage_conditions c where c.stage_id = s.id and c.deleted_at is null) as conditions_total,
  (select count(*) from public.object_stage_conditions c where c.stage_id = s.id and c.deleted_at is null and c.is_done) as conditions_done,
  (not st.is_closed and s.due_date is not null and s.due_date < public.msk_today()) as is_overdue,
  (not st.is_closed and s.due_date is not null and s.due_date >= public.msk_today()
     and s.due_date - coalesce(s.remind_days, 0) <= public.msk_today()) as is_due_soon,
  (not st.is_closed and s.response_due is not null and s.response_received_at is null
     and s.response_due < public.msk_today()) as is_no_response,
  (not st.is_closed and s.executor_id is null) as is_no_executor,
  case when not st.is_closed and s.due_date is not null then s.due_date - public.msk_today() end as days_left,
  (select ss.role_code from public.object_stage_steps ss where ss.stage_id = s.id and ss.state = 'current' limit 1) as current_step_role,
  (select ss.action    from public.object_stage_steps ss where ss.stage_id = s.id and ss.state = 'current' limit 1) as current_step_action
from public.object_stages s
join public.stage_statuses st on st.code = s.status_code
left join public.work_types wt on wt.id = s.work_type_id
left join public.profiles e  on e.id = s.executor_id
left join public.profiles ce on ce.id = s.coexecutor_id
left join public.roles cr    on cr.code = s.confirmer_role
left join public.profiles cf on cf.id = s.confirmer_id
where s.deleted_at is null;

create or replace view public.v_requests with (security_invoker = true) as
select r.*,
  o.name as object_name,
  rp.name as representative_name,
  i.full_name as initiator_name,
  om.full_name as office_name,
  (r.status = 'new') as is_new,
  (r.status <> 'done' and r.call_date < public.msk_today()) as is_overdue
from public.requests r
join public.objects o on o.id = r.object_id
left join public.representatives rp on rp.id = r.representative_id
left join public.profiles i  on i.id = r.initiator_id
left join public.profiles om on om.id = r.office_id
where r.deleted_at is null;

create or replace view public.v_objects as
select o.*,
  c.name as customer_name,
  rp.full_name as responsible_name,
  case when o.contract_end is not null then o.contract_end - public.msk_today() end as contract_days_left,
  agg.stages_total, agg.stages_closed,
  case when agg.stages_total > 0 then round(100.0 * agg.stages_closed / agg.stages_total) else 0 end as progress_pct,
  agg.stages_overdue, agg.stages_no_response, agg.stages_on_review, agg.stages_no_executor,
  cur.number as current_stage_number, cur.name as current_stage_name,
  coalesce(rq.requests_new, 0) as requests_new, coalesce(rq.requests_overdue, 0) as requests_overdue
from public.objects o
left join public.customers c on c.id = o.customer_id
left join public.profiles rp on rp.id = o.responsible_id
left join lateral (
  select count(*) filter (where true)                         as stages_total,
         count(*) filter (where v.is_closed)                  as stages_closed,
         count(*) filter (where v.is_overdue)                 as stages_overdue,
         count(*) filter (where v.is_no_response)             as stages_no_response,
         count(*) filter (where v.status_code = 'on_review')  as stages_on_review,
         count(*) filter (where v.is_no_executor)             as stages_no_executor
  from public.v_object_stages v where v.object_id = o.id and not v.is_excluded) agg on true
left join lateral (
  select v.number, v.name from public.v_object_stages v
  where v.object_id = o.id and not v.is_excluded and not v.is_closed
  order by v.sort, v.number limit 1) cur on true
left join lateral (
  select count(*) filter (where vr.is_new) as requests_new,
         count(*) filter (where vr.is_overdue) as requests_overdue
  from public.v_requests vr where vr.object_id = o.id) rq on true
where o.deleted_at is null and public.can_see_object(o.id);

-- ---------------------------------------------------------------------
-- 12. RLS
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['roles','profiles','customers','customer_contacts','work_types','stage_statuses',
    'documents','stage_templates','stage_template_predecessors','stage_template_conditions','stage_template_steps',
    'objects','object_members','object_stages','object_stage_predecessors','object_stage_conditions',
    'object_stage_steps','representatives','request_types','request_type_fields','requests',
    'request_field_values','request_comments','files','history']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Справочники: читают все авторизованные, правит администратор/руководитель
do $$
declare t text;
begin
  foreach t in array array['roles','profiles','customers','customer_contacts','work_types','stage_statuses',
    'documents','stage_templates','stage_template_predecessors','stage_template_conditions','stage_template_steps',
    'representatives','request_types','request_type_fields']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_sel', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_adm', t);
  end loop;
end $$;

-- Объекты и всё, что внутри: видят участники; правит администратор/руководитель
create policy objects_sel on public.objects for select to authenticated using (public.can_see_object(id));
create policy objects_adm on public.objects for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy members_sel on public.object_members for select to authenticated using (public.can_see_object(object_id));
create policy members_adm on public.object_members for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy stages_sel on public.object_stages for select to authenticated using (public.can_see_object(object_id));
create policy stages_upd on public.object_stages for update to authenticated
  using (public.can_see_object(object_id)) with check (public.can_see_object(object_id));
create policy stages_adm on public.object_stages for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy stage_pred_sel on public.object_stage_predecessors for select to authenticated
  using (exists (select 1 from public.object_stages s where s.id = stage_id and public.can_see_object(s.object_id)));
create policy stage_pred_adm on public.object_stage_predecessors for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy stage_cond_sel on public.object_stage_conditions for select to authenticated
  using (exists (select 1 from public.object_stages s where s.id = stage_id and public.can_see_object(s.object_id)));
create policy stage_cond_adm on public.object_stage_conditions for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy stage_steps_sel on public.object_stage_steps for select to authenticated
  using (exists (select 1 from public.object_stages s where s.id = stage_id and public.can_see_object(s.object_id)));
create policy stage_steps_adm on public.object_stage_steps for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy requests_sel on public.requests for select to authenticated using (public.can_see_object(object_id));
create policy requests_adm on public.requests for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy req_values_sel on public.request_field_values for select to authenticated
  using (exists (select 1 from public.requests r where r.id = request_id and public.can_see_object(r.object_id)));
create policy req_values_adm on public.request_field_values for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy req_comments_sel on public.request_comments for select to authenticated
  using (exists (select 1 from public.requests r where r.id = request_id and public.can_see_object(r.object_id)));
create policy req_comments_ins on public.request_comments for insert to authenticated
  with check (author_id = public.current_profile_id()
              and exists (select 1 from public.requests r where r.id = request_id and public.can_see_object(r.object_id)));

create policy files_sel on public.files for select to authenticated using (public.can_see_object(object_id));
create policy files_ins on public.files for insert to authenticated
  with check (public.can_see_object(object_id) and uploaded_by = public.current_profile_id());
create policy files_upd on public.files for update to authenticated
  using (public.is_admin() or uploaded_by = public.current_profile_id());

create policy history_sel on public.history for select to authenticated
  using (public.is_admin() or (object_id is not null and public.can_see_object(object_id)));
-- запись в history — только через log_history() (security definer)

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.log_history(uuid, text, uuid, text, text, jsonb) from authenticated;

-- ---------------------------------------------------------------------
-- 13. Storage
-- ---------------------------------------------------------------------
insert into storage.buckets(id, name, public) values ('lider-files', 'lider-files', false)
on conflict (id) do nothing;

create policy lider_files_read on storage.objects for select to authenticated
  using (bucket_id = 'lider-files' and public.can_see_object((split_part(name, '/', 1))::uuid));
create policy lider_files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'lider-files' and public.can_see_object((split_part(name, '/', 1))::uuid));

-- ---------------------------------------------------------------------
-- 14. Базовые справочные данные
-- ---------------------------------------------------------------------
insert into public.roles(code, name, is_admin, sort) values
  ('admin',    'Администратор',  true,  1),
  ('director', 'Руководитель',   true,  2),
  ('pto',      'Инженер ПТО',    false, 3),
  ('foreman',  'Прораб',         false, 4),
  ('supply',   'Снабжение',      false, 5),
  ('office',   'Офис-менеджер',  false, 6);

insert into public.stage_statuses(code, name, color, sort, is_closed) values
  ('not_started',  'Не начато',        '#9CA3AF', 1, false),
  ('in_work',      'В работе',         '#2563EB', 2, false),
  ('sent',         'Отправлено',       '#7C3AED', 3, false),
  ('waiting_visit','Ожидание выезда',  '#0891B2', 4, false),
  ('on_approval',  'На согласовании',  '#D97706', 5, false),
  ('on_review',    'На проверке',      '#DB2777', 6, false),
  ('closed',       'Закрыто',          '#16A34A', 7, true);

insert into public.request_types(name, sort, uses_representatives) values
  ('Технадзор',       1, false),
  ('Лаборатория МГ',  2, false),
  ('Интеграл',        3, false),
  ('Геотрест',        4, false),
  ('АНПИ',            5, false),
  ('ДИ',              6, false),
  ('ЭПИД',            7, false),
  ('Эксплуатация',    8, false),
  ('Представители',   9, true),
  ('Заказ снабжение', 10, false);

-- Временный набор полей (до получения списка от заказчика) — для всех видов, кроме «Заказ снабжение»
insert into public.request_type_fields(request_type_id, label, field_type, is_required, filled_by, sort)
select t.id, f.label, f.field_type, f.is_required, f.filled_by, f.sort
from public.request_types t
cross join (values
  ('Пикеты (от – до)',     'text',   true,  'initiator', 1),
  ('Длина, м',             'number', false, 'initiator', 2),
  ('Количество стыков',    'number', false, 'initiator', 3),
  ('Комментарий прораба',  'text',   false, 'initiator', 4),
  ('Фото / документы',     'file',   false, 'initiator', 5),
  ('Адрес отправки (email)','text',  false, 'office',    6),
  ('Номер протокола',      'text',   false, 'office',    7)
) as f(label, field_type, is_required, filled_by, sort)
where t.name <> 'Заказ снабжение';

insert into public.request_type_fields(request_type_id, label, field_type, is_required, filled_by, sort)
select t.id, f.label, f.field_type, f.is_required, f.filled_by, f.sort
from public.request_types t
cross join (values
  ('Что нужно (материал)', 'text',   true,  'initiator', 1),
  ('Количество',           'text',   true,  'initiator', 2),
  ('Комментарий',          'text',   false, 'initiator', 3)
) as f(label, field_type, is_required, filled_by, sort)
where t.name = 'Заказ снабжение';

-- Примеры из созвона; полный список пришлёт заказчик
insert into public.representatives(name, sort) values ('Россети', 1), ('Водоканал', 2), ('Теплосети', 3);


-- =============================================================================
-- 20251020000001_lider_v1_seed_spravochniki.sql
-- =============================================================================

-- =====================================================================
-- ООО «Лидер» · Версия 1 · Стартовое наполнение справочников
-- Источник: демо-версия 2bstudio.ru/lider (собрана по двум встречам с заказчиком).
-- Временное наполнение — заменяется/уточняется по материалам заказчика (п. 2.4 договора).
-- Выполнять после lider_v1_migration.sql. Повторный запуск не предусмотрен.
-- =====================================================================

insert into public.work_types(name, sort) values
  ('Тендер и договор', 1), ('Документация и согласования', 2), ('Геодезия и съёмки', 3),
  ('Земляные работы', 4), ('Сварочно-монтажные работы', 5), ('Испытания и просвет стыков', 6),
  ('Химзащита (ЭХЗ)', 7), ('Врезка и сдача', 8), ('Благоустройство и озеленение', 9),
  ('Папка ИД и форма 6', 10);

-- Вспомогательная функция только для наполнения (удаляется в конце)
-- Условие с суффиксом « [ИД]» — попадает в папку ИД; условие, начинающееся с «Фото», — тип «файл».
create function pg_temp.seed_stage(p_no int, p_name text, p_wt int, p_critical boolean,
  p_out text, p_exp text, p_desc text, p_conditions text[]) returns void
language plpgsql as $$
declare v_id uuid; c text; i int := 0; v_id_folder boolean; v_title text;
begin
  insert into public.stage_templates(number, name, work_type_id, is_critical, outgoing_doc, expected_doc,
                                     description, sort)
  values (p_no, p_name, (select id from public.work_types where sort = p_wt), p_critical,
          nullif(p_out, ''), nullif(p_exp, ''), nullif(p_desc, ''), p_no)
  returning id into v_id;
  foreach c in array p_conditions loop
    i := i + 1;
    v_id_folder := c like '% [ИД]';
    v_title := replace(c, ' [ИД]', '');
    insert into public.stage_template_conditions(template_id, title, kind, to_id_folder, sort)
    values (v_id, v_title, case when v_title like 'Фото%' then 'file' else 'check' end, v_id_folder, i);
  end loop;
end $$;

select pg_temp.seed_stage(1,  'Тендер', 1, false, 'Заявка', '', '', array['Заявка — отправлена']);
select pg_temp.seed_stage(2,  'Договор', 1, true, 'Договор', '', '', array['Договор — отправлен']);
select pg_temp.seed_stage(3,  'Анализ всех томов РД — согласования и экспертиза', 2, true, 'Тома', '',
  'Геология · ПОДД · Газ-труба (ПОС, ТКР) · ЭХЗ · Благоустройство · Дендрология', array['Тома — отправлены']);
select pg_temp.seed_stage(4,  'Смета — анализ', 1, false, 'Заявка', 'Заключение', 'СМР · ЭХЗ · Благоустройство',
  array['Заявка — отправлена', 'Заключение — получено [ИД]']);
select pg_temp.seed_stage(5,  'Ордер ОАТИ', 2, true, 'Письмо-заявка', 'Уведомление', '',
  array['Ордер ОАТИ получен [ИД]', 'Срок действия ордера внесён']);
select pg_temp.seed_stage(6,  'Договор на просвет — МосГаз или лаборатория', 1, false, 'Письмо email', 'Договор', '',
  array['Письмо email — отправлено', 'Договор — получен [ИД]']);
select pg_temp.seed_stage(7,  'Согласование: Жилищник, управа, собственник территории', 2, false, 'Письмо email', 'Письмо-ответ', '',
  array['Письмо email — отправлено', 'Письмо-ответ — получено [ИД]']);
select pg_temp.seed_stage(8,  'Обустройство городка, места складирования грунта', 4, false, 'Акт', '', '',
  array['Акт — отправлен', 'Фото с объекта']);
select pg_temp.seed_stage(9,  'Уведомление ГИБДД — на проезжей части', 2, true, 'Письмо', 'Письмо-ответ', '',
  array['Письмо — отправлено', 'Письмо-ответ — получено [ИД]']);
select pg_temp.seed_stage(10, 'Уведомление Гортранс', 2, true, 'Письмо', '', '', array['Письмо — отправлено']);
select pg_temp.seed_stage(11, 'Уведомление в МосГаз о начале работ', 2, true, 'Письмо электронное', 'Уведомление', '',
  array['Письмо электронное — отправлено', 'Уведомление — получено [ИД]']);
select pg_temp.seed_stage(12, 'Вызов балансодержателей до начала работ', 2, true, 'Письмо электронное', 'Акт', '',
  array['Акты вызова балансодержателей подписаны [ИД]', 'Фото шурфов и меток']);
select pg_temp.seed_stage(13, 'Геодезическая разбивка трассы', 3, false, 'Заявка', 'Реперные метки', '',
  array['Заявка — отправлена', 'Реперные метки — получены [ИД]', 'Фото с объекта']);
select pg_temp.seed_stage(14, 'Шурфление коммуникаций', 4, true, 'Заявка', 'Акт шурфовки', '',
  array['Акт шурфовки подписан [ИД]', 'Фото каждого шурфа', 'Коммуникации нанесены на схему']);
select pg_temp.seed_stage(15, 'Допусковая сварка — один раз на объект', 5, true, 'Заявка email', 'Акт лаборатории', '',
  array['Акт допусковой сварки [ИД]', 'Удостоверения НАКС сварщиков [ИД]']);
select pg_temp.seed_stage(16, 'Механические испытания — ежемесячно, катушки в лабораторию', 5, false, 'Заявка email', 'Акт', '',
  array['Катушки сданы в лабораторию', 'Акт механических испытаний [ИД]']);
select pg_temp.seed_stage(17, 'Вырубка по дендроплану, порубочный талон', 2, true, 'Уведомление в ДПиОС', 'Порубочный талон', '',
  array['Уведомление в ДПиОС — отправлено', 'Порубочный талон — получен [ИД]']);
select pg_temp.seed_stage(18, 'Раскопка траншеи', 4, false, 'Наряд-задание', '', '',
  array['Наряд-задание — отправлено', 'Фото с объекта']);
select pg_temp.seed_stage(19, 'Сварка — РД, ПЭ, закладная', 5, false, 'Руководство на объекте', '', '',
  array['Сварочно-монтажная схема заполнена [ИД]', 'Фото стыков по захваткам']);
select pg_temp.seed_stage(20, 'ДИ сталь — дефект изоляции', 6, false, 'Заявка', 'Протокол', '',
  array['Заявка — отправлена', 'Протокол — получен [ИД]', 'Фото с объекта']);
select pg_temp.seed_stage(21, 'Сварочно-монтажная схема', 5, false, 'Вручную', 'Калька', '',
  array['Схема составлена вручную', 'Калька — получена [ИД]', 'Фото с объекта']);
select pg_temp.seed_stage(22, 'Просвет стыков — не менее 10% от общего числа', 6, true, 'Заявка email', 'Протокол испытаний',
  'ВД РД сталь 100%; СРД 50%; НД 10% — на проезжей части 100% · ВД, СД, НД ПЭ — все стыки 100% · Закладная — 0 · Труба в футляре 100%',
  array['Протоколы: ВД сталь 100% [ИД]', 'Протоколы: СД 50% [ИД]', 'Протоколы: НД 10% (проезжая часть 100%) [ИД]',
        'Протоколы: ПЭ все стыки [ИД]', 'Ведомость стыков сходится со схемой [ИД]']);
select pg_temp.seed_stage(23, 'Изоляция стыков', 6, false, 'Заявка email', 'Протокол', '',
  array['Заявка email — отправлена', 'Протокол — получен [ИД]', 'Фото с объекта']);
select pg_temp.seed_stage(24, 'Адгезия — сталь 10%', 6, false, 'Заявка email', 'Протокол', '',
  array['Заявка email — отправлена', 'Протокол — получен [ИД]', 'Фото с объекта']);
select pg_temp.seed_stage(25, 'Технадзор МГ — труба, изоляция, подсыпка', 6, true, 'Заявка email', 'Запись в общем журнале', '',
  array['Запись технадзора в общем журнале [ИД]', 'Фото до подсыпки']);
select pg_temp.seed_stage(26, 'Контрольная геодезическая съёмка', 3, true, 'Заявка', 'Реперные точки на трассе', '',
  array['Реперные точки сняты', 'Все готовые точки предъявлены']);
select pg_temp.seed_stage(27, 'Съёмка МГГТ — углы, футляры, контрольная трубка', 3, true, 'Заявка email', 'Номера вызова', '',
  array['Точка 1 — снята МГГТ', 'Точка 2 — снята МГГТ', 'Точка 3 — снята МГГТ', 'Фото точек до приезда МГГТ',
        'Номера вызова получены [ИД]']);
select pg_temp.seed_stage(28, 'ЭХЗ — шина, изоляция, БСЗД, ЭС, АСДУЗУ, АСУРГАЗ', 7, false, 'Заявка email', 'Акт ввода в эксплуатацию',
  'Вызов технадзора МГ · Вызов специалиста эксплуатации',
  array['Заявка email — отправлена', 'Акт ввода в эксплуатацию — получен [ИД]', 'Фото с объекта']);
select pg_temp.seed_stage(29, 'ИПИТ — обязательно до засыпки', 6, true, 'Заявка email', 'Протокол', '',
  array['Заявка отправлена ДО засыпки', 'Лаборатория выехала', 'Протокол ИПИТ [ИД]']);
select pg_temp.seed_stage(30, 'Поршнение — схему согласовать с технадзором', 6, false, 'Заявка email', 'Акт', '',
  array['Заявка email — отправлена', 'Акт — получен [ИД]', 'Фото с объекта']);
select pg_temp.seed_stage(31, 'Продувка — паспорт манометра', 6, false, 'Заявка email', 'Акт', '',
  array['Акт продувки [ИД]', 'Паспорт манометра [ИД]']);
select pg_temp.seed_stage(32, 'Выход на герметичность — папка ИД собрана полностью', 10, true, 'Папка ИД', 'Акт', '',
  array['Папка ИД собрана по предыдущим этапам [ИД]', 'Папка передана в службы заказчика']);
select pg_temp.seed_stage(33, 'Закопка траншеи — кроме врезочных котлованов', 4, true, 'СМР', '', '',
  array['СМР — отправлено', 'Фото с объекта']);
select pg_temp.seed_stage(34, 'Герметичность: опрессовка — форма 4, 1–2 замер', 6, true, 'Заявка', 'Акт', '',
  array['Форма 4 заполнена [ИД]', 'Замер 1', 'Замер 2', 'Акт герметичности подписан [ИД]']);
select pg_temp.seed_stage(35, 'АНПИ — сталь', 6, false, 'Заявка email', 'Акт испытаний', '',
  array['Заявка email — отправлена', 'Акт испытаний — получен [ИД]', 'Фото с объекта']);
select pg_temp.seed_stage(36, 'Сдача сооружений — ковера, люки, ЭХЗ', 8, false, 'Заявка email', 'Акт', '',
  array['Заявка email — отправлена', 'Акт — получен [ИД]', 'Фото с объекта']);
select pg_temp.seed_stage(37, 'Подготовка к врезке, сдача котлована', 8, false, 'Заявка email', 'Справка о готовности', '',
  array['Заявка email — отправлена', 'Справка о готовности — получена [ИД]', 'Фото с объекта']);
select pg_temp.seed_stage(38, 'Сдача места врезки технадзору', 8, true, 'Заявка email', 'Акт приёмки — форма 5', '',
  array['Акт приёмки форма 5 [ИД]', 'Фото котлована под врезку']);
select pg_temp.seed_stage(39, 'Комиссионный акт — бегунок по службам', 8, true, 'Акт-бегунок', 'Акт с подписями', '',
  array['Бегунок: технадзор', 'Бегунок: руководитель технадзора', 'Бегунок: первый цех', 'Бегунок: второй цех',
        'Комиссионный акт в папке [ИД]']);
select pg_temp.seed_stage(40, 'Врезка — работы МосГаза', 8, true, 'СМР', 'Акт', '',
  array['СМР — отправлено', 'Акт — получен [ИД]']);
select pg_temp.seed_stage(41, 'Изоляция места врезки, сдача эксплуатации', 8, false, 'Заявка email', 'Акт', '',
  array['Заявка email — отправлена', 'Акт — получен [ИД]', 'Фото с объекта']);
select pg_temp.seed_stage(42, 'Съёмка места врезки — Геотрест', 3, true, 'Заявка email', 'Номера контрольных съёмок', '',
  array['Все готовые точки предъявлены Геотресту', 'Фото точек', 'Номера контрольных съёмок [ИД]',
        'Сверка: снято столько, сколько предъявлено']);
select pg_temp.seed_stage(43, 'Засыпка котлованов', 4, false, 'СМР', 'Акт', '',
  array['СМР — отправлено', 'Акт — получен [ИД]', 'Фото с объекта']);
select pg_temp.seed_stage(44, 'Демонтаж старого трубопровода и сооружений', 9, false, '', '', '', array['Фото с объекта']);
select pg_temp.seed_stage(45, 'Благоустройство', 9, true, 'СМР', 'Акт, чертёж',
  'Работы — прораб · Схема покрытий — ПТО · Подписание у балансодержателя',
  array['Акт благоустройства [ИД]', 'Чертёж покрытий [ИД]', 'Подписано у балансодержателя [ИД]']);
select pg_temp.seed_stage(46, 'Посадка деревьев, кустарников', 9, false, 'Наряд-задание', 'Акт', '',
  array['Наряд-задание — отправлено', 'Акт — получен [ИД]', 'Фото с объекта']);
select pg_temp.seed_stage(47, 'Закрытие порубочного билета', 2, true, 'Уведомление', 'Ответ ДПиОС', '',
  array['Уведомление — отправлено', 'Ответ ДПиОС — получен [ИД]']);
select pg_temp.seed_stage(48, 'Согласование ИД — штамп ОПС, Геотрест', 10, true, 'Письмо email', 'Штамп на схеме',
  'Подпись геодезиста МГ · Подпись Ростехнадзора · Штамп МГГТ',
  array['Подпись геодезиста МГ [ИД]', 'Подпись Ростехнадзора [ИД]', 'Штамп МГГТ [ИД]']);
select pg_temp.seed_stage(49, 'Получение формы 6', 10, true, 'Личный контакт', 'Форма 6', '',
  array['Форма 6 получена [ИД]']);

-- Предшествующие этапы (связь мягкая: нарушение отмечается, но не запрещается)
insert into public.stage_template_predecessors(template_id, predecessor_id)
select a.id, b.id from (values (2,1), (24,23), (29,25), (34,32)) as v(t, p)
join public.stage_templates a on a.number = v.t
join public.stage_templates b on b.number = v.p;

-- Справочник документов по разделам с привязкой к этапу
insert into public.documents(name, section, to_id_folder, stage_template_id, sort)
select d.name, d.section, true, st.id, d.sort
from (values
  ('Извещение о начале строительно-монтажных работ',          'ГСН', 11, 1),
  ('Общий журнал работ — прошит, зарегистрирован',            'ГСН', 25, 2),
  ('Акт освидетельствования скрытых работ — основание',       'ГСН', 18, 3),
  ('Акт освидетельствования скрытых работ — изоляция стыков', 'ГСН', 23, 4),
  ('Акт освидетельствования ответственных конструкций',       'ГСН', 33, 5),
  ('Акт входного контроля трубы и фасонных частей',           'ГСВ', 19, 6),
  ('Сертификаты и паспорта на трубу',                         'ГСВ', 19, 7),
  ('Паспорт манометра, свидетельство о поверке',              'ГСВ', 31, 8),
  ('Сертификаты на изоляционные материалы',                   'ГСВ', 23, 9),
  ('Протокол просвета стыков',                                'МосГаз', 22, 10),
  ('Акт допусковой сварки',                                   'МосГаз', 15, 11),
  ('Акт механических испытаний',                              'МосГаз', 16, 12),
  ('Протокол ИПИТ',                                           'МосГаз', 29, 13),
  ('Акт герметичности — форма 4',                             'МосГаз', 34, 14),
  ('Акт приёмки места врезки — форма 5',                      'МосГаз', 38, 15),
  ('Комиссионный акт',                                        'МосГаз', 39, 16),
  ('Акт ввода ЭХЗ в эксплуатацию',                            'МосГаз', 28, 17),
  ('Форма 6',                                                 'МосГаз', 49, 18),
  ('Номера вызова МГГТ',                                      'МГГТ и Геотрест', 27, 19),
  ('Номера контрольных съёмок',                               'МГГТ и Геотрест', 42, 20),
  ('Исполнительная схема со штампом',                         'МГГТ и Геотрест', 48, 21),
  ('Ордер ОАТИ',                                              'Органы города', 5, 22),
  ('Порубочный талон ДПиОС',                                  'Органы города', 17, 23),
  ('Акт сдачи благоустройства балансодержателю',              'Органы города', 45, 24),
  ('Уведомления ГИБДД и Гортранс',                            'Органы города', 9, 25)
) as d(name, section, stage_no, sort)
join public.stage_templates st on st.number = d.stage_no;

-- Пример сценария этапа — «Согласование ЖКХ» (продиктовано на созвоне 14.10, ждём письменного подтверждения)
insert into public.stage_template_steps(template_id, step_no, role_code, action, action_kind)
select st.id, s.step_no, s.role_code, s.action, s.action_kind
from public.stage_templates st
cross join (values
  (1, 'office', 'Найти в документации данные и адрес, куда отправлять; подготовить заявку', 'fill'),
  (2, 'pto',    'Прикрепить приложение к заявке (схему)', 'attach'),
  (3, 'office', 'Забрать приложение из системы, отправить заявку в ЖКХ', 'send'),
  (4, 'office', 'Отметить получение ответа', 'confirm')
) as s(step_no, role_code, action, action_kind)
where st.number = 7;


-- =============================================================================
-- 20251020000002_after_migration.sql
-- =============================================================================

-- =====================================================================
-- ООО «Лидер» · Версия 1 · Запуск после миграции и seed
-- Порядок: lider_v1_migration.sql → lider_v1_seed_spravochniki.sql → этот файл
-- Локально (supabase db reset): создаёт тестовых пользователей Auth, если их нет.
-- На облаке: если admin@example.com / foreman@example.com уже есть — привяжет профили.
-- =====================================================================

-- 1. Закрыть прямой вызов log_history (ТЗ 1.3: права — в БД).
revoke execute on function public.log_history(uuid, text, uuid, text, text, jsonb)
  from public, anon, authenticated;

-- 2. Локальный bootstrap Auth (идемпотентно)
do $$
declare
  v_admin_id uuid := '11111111-1111-4111-8111-111111111111';
  v_foreman_id uuid := '22222222-2222-4222-8222-222222222222';
begin
  -- admin@example.com / пароль: password123
  if not exists (select 1 from auth.users where email = 'admin@example.com') then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_admin_id,
      'authenticated',
      'authenticated',
      'admin@example.com',
      crypt('password123', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(), now(), '', '', '', ''
    );
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      v_admin_id, v_admin_id,
      format('{"sub":"%s","email":"admin@example.com"}', v_admin_id)::jsonb,
      'email', v_admin_id::text, now(), now(), now()
    );
  end if;

  -- foreman@example.com / пароль: password123
  if not exists (select 1 from auth.users where email = 'foreman@example.com') then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_foreman_id,
      'authenticated',
      'authenticated',
      'foreman@example.com',
      crypt('password123', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(), now(), '', '', '', ''
    );
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      v_foreman_id, v_foreman_id,
      format('{"sub":"%s","email":"foreman@example.com"}', v_foreman_id)::jsonb,
      'email', v_foreman_id::text, now(), now(), now()
    );
  end if;
end $$;

-- 3. Сотрудники с логином
insert into public.profiles(user_id, full_name, role_code, email)
select id, 'Администратор', 'admin', email
from auth.users where email = 'admin@example.com'
  and not exists (
    select 1 from public.profiles p where p.user_id = auth.users.id and p.deleted_at is null
  );

insert into public.profiles(user_id, full_name, role_code, email)
select id, 'Прораб (тест)', 'foreman', email
from auth.users where email = 'foreman@example.com'
  and not exists (
    select 1 from public.profiles p where p.user_id = auth.users.id and p.deleted_at is null
  );

-- 4. Сотрудники без логина (ТЗ 9)
insert into public.profiles(full_name, role_code)
select v.n, v.r
from (values
  ('Муслим',            'director'),
  ('Галина Ивановна',   'pto'),
  ('Милана',            'office'),
  ('Снабжение (тест)',  'supply')
) as v(n, r)
where not exists (
  select 1 from public.profiles p where p.full_name = v.n and p.deleted_at is null
);

-- 5. Заказчики с контактами (ТЗ 9)
insert into public.customers(name)
select 'АО «МОСГАЗ»'
where not exists (select 1 from public.customers where name = 'АО «МОСГАЗ»' and deleted_at is null);

insert into public.customer_contacts(customer_id, full_name, position, sort)
select c.id, v.full_name, v.position, v.sort
from public.customers c
cross join (values
  ('Контакт 1 (тест)', 'Куратор объекта', 1),
  ('Контакт 2 (тест)', 'Технадзор', 2)
) as v(full_name, position, sort)
where c.name = 'АО «МОСГАЗ»' and c.deleted_at is null
  and not exists (
    select 1 from public.customer_contacts cc
    where cc.customer_id = c.id and cc.full_name = v.full_name and cc.deleted_at is null
  );

insert into public.customers(name)
select 'Тестовый заказчик'
where not exists (select 1 from public.customers where name = 'Тестовый заказчик' and deleted_at is null);

insert into public.customer_contacts(customer_id, full_name, position, sort)
select c.id, 'Контакт (тест)', 'Представитель', 1
from public.customers c
where c.name = 'Тестовый заказчик' and c.deleted_at is null
  and not exists (
    select 1 from public.customer_contacts cc
    where cc.customer_id = c.id and cc.full_name = 'Контакт (тест)' and cc.deleted_at is null
  );

-- 6. Проверка
select
  (select count(*) from public.profiles where role_code = 'admin'   and user_id is not null) as admin_ok,
  (select count(*) from public.profiles where role_code = 'foreman' and user_id is not null) as foreman_ok,
  (select count(*) from public.stage_templates)  as stages,
  (select count(*) from public.documents)        as documents,
  (select count(*) from public.request_types)    as request_types,
  (select count(*) from storage.buckets where id = 'lider-files') as bucket;


-- =============================================================================
-- 20251020000003_fixes.sql
-- =============================================================================

-- =====================================================================
-- ООО «Лидер» · Версия 1 · Исправления к миграции
-- Выполнить один раз после 01_after_migration.sql (Supabase → SQL Editor).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Исправление tg_guard_status()
-- В исходной версии одно условие обращается и к new.status_code (есть только
-- у object_stages), и к new.status (есть только у requests). PL/pgSQL
-- вычисляет обе ссылки, и любой UPDATE этапа или заявки вне RPC падал с
-- ошибкой «record "new" has no field ...»: не сохранялись примечание и поля
-- этапа, не работали stage_set_excluded(), request_set_call_date() и
-- автоназначение исполнителя в add_object_stages(). Логика та же: статус
-- меняется только через RPC.
-- ---------------------------------------------------------------------
create or replace function public.tg_guard_status() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('lider.rpc', true), '') = 'on' then
    return new;
  end if;
  if tg_table_name = 'object_stages' then
    if new.status_code is distinct from old.status_code then
      raise exception 'Статус этапа меняется только через stage_set_status()';
    end if;
  elsif tg_table_name = 'requests' then
    if new.status is distinct from old.status then
      raise exception 'Статус заявки меняется только через request_set_status()';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2. Запись загрузки файлов в историю
-- ТЗ 11 — «Каждое действие (статус, условие, шаг, файл, перенос) появляется
-- в истории этапа или заявки». Файл загружается напрямую в storage и таблицу
-- files, поэтому запись в history делает триггер.
-- ---------------------------------------------------------------------
create or replace function public.tg_files_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_entity_type text;
  v_entity_id   uuid;
  v_where       text;
  v_kind        text := case new.kind
                          when 'draft'  then 'черновик на согласование'
                          when 'signed' then 'подписанный скан'
                          when 'photo'  then 'фото'
                          else 'файл' end;
  r record;
begin
  if new.entity_type = 'stage' then
    select id, number into r from public.object_stages where id = new.entity_id;
    v_entity_type := 'stage'; v_entity_id := r.id;
    v_where := format('Этап %s', r.number);
  elsif new.entity_type = 'stage_condition' then
    select s.id, s.number, c.title into r
    from public.object_stage_conditions c join public.object_stages s on s.id = c.stage_id
    where c.id = new.entity_id;
    v_entity_type := 'stage'; v_entity_id := r.id;
    v_where := format('Этап %s, условие «%s»', r.number, r.title);
  else
    -- request и request_field: entity_id — id заявки
    select id, number into r from public.requests where id = new.entity_id;
    v_entity_type := 'request'; v_entity_id := r.id;
    v_where := format('Заявка №%s', r.number);
  end if;

  perform public.log_history(new.object_id, v_entity_type, v_entity_id, 'file_uploaded',
    format('%s: загружен %s «%s»', v_where, v_kind, new.file_name),
    jsonb_build_object('file_id', new.id, 'kind', new.kind));
  return new;
end $$;

drop trigger if exists files_history on public.files;
create trigger files_history after insert on public.files
  for each row execute function public.tg_files_history();

-- Проверка: ожидаем trigger_ok = 1, guard_fixed = true
select
  (select count(*) from pg_trigger where tgname = 'files_history') as trigger_ok,
  (select prosrc like '%elsif tg_table_name = ''requests'' then%' from pg_proc where proname = 'tg_guard_status') as guard_fixed;


-- =============================================================================
-- 20251020000004_demo_data.sql
-- =============================================================================

-- =====================================================================
-- ООО «Лидер» · Версия 1 · Демо-данные для видеообзора (ТЗ раздел 9)
-- ПЕРЕД ЗАПУСКОМ: через интерфейс создать объект «ТЕСТ · УКС …» со всеми этапами
-- и участниками «Прораб (тест)», «Галина Ивановна», «Милана».
-- Скрипт приводит его в «живой» вид: этапы в разных статусах, один просроченный,
-- один «нет ответа», один без исполнителя; заявки во всех пяти статусах,
-- одна просроченная, одна новая. Запускать один раз.
-- Статусы ставятся напрямую (служебный режим lider.rpc), т. к. в SQL Editor
-- нет авторизованного пользователя для RPC.
-- =====================================================================

do $$
declare
  v_obj      uuid;
  v_foreman  uuid := (select id from public.profiles where full_name = 'Прораб (тест)' and deleted_at is null limit 1);
  v_pto      uuid := (select id from public.profiles where role_code = 'pto' and deleted_at is null order by created_at limit 1);
  v_office   uuid := (select id from public.profiles where role_code = 'office' and deleted_at is null order by created_at limit 1);
  v_director uuid := (select id from public.profiles where role_code = 'director' and deleted_at is null order by created_at limit 1);
  v_today    date := public.msk_today();
  v_type     uuid;
  v_req      uuid;
  v_pikety   uuid;
  r record;
begin
  select id into v_obj from public.objects
  where name ilike 'ТЕСТ%УКС%' and deleted_at is null order by created_at limit 1;
  -- Скрипт рассчитан на объект, созданный вручную через UI.
  -- При supabase db reset объекта ещё нет — пропускаем; демо создаёт 04_demo_data.sql.
  if v_obj is null then
    raise notice '03_demo_data: объект «ТЕСТ · УКС …» не найден — пропуск (демо в 04_demo_data.sql)';
    return;
  end if;

  perform set_config('lider.rpc', 'on', true);

  -- Исполнители: прораб на всех этапах, этап 8 — без исполнителя
  update public.object_stages set executor_id = v_foreman, confirmer_id = v_director
  where object_id = v_obj and deleted_at is null and number <> 8;
  update public.object_stages set executor_id = null where object_id = v_obj and number = 8;
  -- Документальные этапы — инженеру ПТО
  update public.object_stages set executor_id = v_pto
  where object_id = v_obj and number in (3, 4, 5, 6, 7, 9, 10, 11);

  -- Этапы 1–2 закрыты: условия выполнены
  update public.object_stage_conditions set is_done = true, done_by = v_foreman, done_at = now()
  where stage_id in (select id from public.object_stages where object_id = v_obj and number in (1, 2, 6));
  update public.object_stages set status_code = 'closed', start_date = v_today - 40, due_date = v_today - 30,
         closed_at = now() - interval '30 days', closed_by = v_director
  where object_id = v_obj and number in (1, 2);

  -- Этап 3 — просрочен (в работе, срок прошёл 5 дней назад)
  update public.object_stages set status_code = 'in_work', start_date = v_today - 20, due_date = v_today - 5,
         note = 'Ждём замечания экспертизы, обещали в понедельник'
  where object_id = v_obj and number = 3;

  -- Этап 4 — «нет ответа»: документ отправлен 10 дней назад, ответ ждали 5 дней
  update public.object_stages set status_code = 'sent', start_date = v_today - 12, due_date = v_today + 10,
         doc_sent_at = v_today - 10, response_days = 5
  where object_id = v_obj and number = 4;

  -- Этап 5 — «горит»: срок через 2 дня, напомнить за 3
  update public.object_stages set status_code = 'on_approval', start_date = v_today - 7, due_date = v_today + 2, remind_days = 3
  where object_id = v_obj and number = 5;

  -- Этап 6 — на проверке (условия выполнены)
  update public.object_stages set status_code = 'on_review', start_date = v_today - 8, due_date = v_today + 5
  where object_id = v_obj and number = 6;

  -- Этап 7 — в работе по сценарию «Согласование ЖКХ»: первый шаг выполнен, текущий — второй
  update public.object_stages set status_code = 'in_work', start_date = v_today - 3, due_date = v_today + 14
  where object_id = v_obj and number = 7;
  update public.object_stage_steps set state = 'done', done_by = v_office, done_at = now() - interval '2 days',
         comment = 'Адрес ЖКХ нашли в томе ПОС'
  where stage_id = (select id from public.object_stages where object_id = v_obj and number = 7) and step_no = 1;
  update public.object_stage_steps set state = 'current'
  where stage_id = (select id from public.object_stages where object_id = v_obj and number = 7) and step_no = 2;

  -- Этап 9 — ожидание выезда
  update public.object_stages set status_code = 'waiting_visit', start_date = v_today - 2, due_date = v_today + 7
  where object_id = v_obj and number = 9;

  -- Этап 13 — взят вне очереди (для значка), этап 14 — в работе
  update public.object_stages set status_code = 'in_work', start_date = v_today - 1, due_date = v_today + 10, out_of_order = true
  where object_id = v_obj and number = 13;

  perform public.log_history(v_obj, 'object', v_obj, 'demo', 'Загружены демо-данные для видеообзора');

  -- ---------- Заявки: все пять статусов, одна просроченная, одна новая ----------
  select id into v_type from public.request_types where name = 'Технадзор' and deleted_at is null limit 1;
  select id into v_pikety from public.request_type_fields where request_type_id = v_type and label like 'Пикеты%' limit 1;

  for r in
    select * from (values
      ('new',      v_today + 3,  'ПК 1+00 – ПК 2+50', null::text),
      ('ready',    v_today + 2,  'ПК 2+50 – ПК 3+10', null),
      ('sent',     v_today + 1,  'ПК 3+10 – ПК 4+00', null),
      ('accepted', v_today,      'ПК 4+00 – ПК 4+80', null),
      ('done',     v_today - 6,  'ПК 0+00 – ПК 1+00', 'Протокол № 117-ТН'),
      ('sent',     v_today - 4,  'ПК 5+00 – ПК 5+60', null)   -- просроченная
    ) as t(status, call_date, pikety, result)
  loop
    insert into public.requests(object_id, request_type_id, type_name, initiator_id, office_id, call_date, status,
                                sent_at, accepted_at, done_at, done_by, result_text, created_at)
    values (v_obj, v_type, 'Технадзор', v_foreman,
            case when r.status <> 'new' then v_office end,
            r.call_date, r.status,
            case when r.status in ('sent', 'accepted', 'done') then now() - interval '3 days' end,
            case when r.status in ('accepted', 'done') then now() - interval '2 days' end,
            case when r.status = 'done' then now() - interval '1 day' end,
            case when r.status = 'done' then v_office end,
            r.result,
            now() - interval '5 days')
    returning id into v_req;

    if v_pikety is not null then
      insert into public.request_field_values(request_id, field_id, label, field_type, value, updated_by)
      values (v_req, v_pikety, 'Пикеты (от – до)', 'text', to_jsonb(r.pikety), v_foreman);
    end if;
    if r.result is not null then
      insert into public.request_field_values(request_id, field_id, label, field_type, value, updated_by)
      select v_req, f.id, f.label, f.field_type, to_jsonb(r.result), v_office
      from public.request_type_fields f where f.request_type_id = v_type and f.label = 'Номер протокола';
    end if;
  end loop;

  insert into public.request_comments(request_id, author_id, text)
  select id, v_office, 'Технадзор связался, они на связи' from public.requests
  where object_id = v_obj and status = 'sent' order by call_date desc limit 1;
end $$;

-- Проверка: ожидаем по одному этапу просроченному, без ответа, без исполнителя и 6 заявок
select
  (select count(*) from public.v_object_stages v join public.objects o on o.id = v.object_id
    where o.name ilike 'ТЕСТ%УКС%' and v.is_overdue) as stages_overdue,
  (select count(*) from public.v_object_stages v join public.objects o on o.id = v.object_id
    where o.name ilike 'ТЕСТ%УКС%' and v.is_no_response) as stages_no_response,
  (select count(*) from public.v_object_stages v join public.objects o on o.id = v.object_id
    where o.name ilike 'ТЕСТ%УКС%' and v.is_no_executor) as stages_no_executor,
  (select count(*) from public.requests rq join public.objects o on o.id = rq.object_id
    where o.name ilike 'ТЕСТ%УКС%') as requests;


-- =============================================================================
-- 20251020000005_demo_data.sql
-- =============================================================================

-- =====================================================================
-- ООО «Лидер» · Демо-данные для показа заказчику (правка 1.5, docs/ПРАВКИ.md)
-- Выполнить один раз ПОСЛЕ db/02_fixes.sql в Supabase → SQL Editor (весь файл целиком).
--
-- Что появится:
--   • нормативные сроки и роли у этапов справочника (только где пусто);
--   • сотрудники с ФИО; тестовые «Прораб (тест)» и «Снабжение (тест)» получают ФИО;
--   • 6 объектов: в работе, у срока договора, ранний этап, просроченный,
--     планируемый и завершённый (в архиве);
--   • около 30 заявок всех видов и статусов, переписка, история с датами и авторами.
-- Прораб с логином участвует в 5 объектах из 6 — под ним видно ограничение доступа.
-- Все даты считаются от сегодняшнего дня, подсветка будет «живой» в день показа.
-- Объекты «ТЕСТ · …» не трогаются (скрыть их — db/05_hide_test_objects.sql).
-- =====================================================================

-- ---------- Вспомогательные функции (временные, исчезают после сеанса) ----------

-- Момент времени по Москве: дата + час
create or replace function pg_temp.at(p_day date, p_hour int) returns timestamptz
language sql immutable as $$ select (p_day + make_time(p_hour, 0, 0)) at time zone 'Europe/Moscow' $$;

create or replace function pg_temp.pid(p_name text) returns uuid
language sql stable as $$ select id from public.profiles where full_name = p_name and deleted_at is null limit 1 $$;

-- Сотрудник: по точному имени → по началу имени → первый активный с этой ролью → создать.
-- Так скрипт работает, даже если сотрудников переименовали или удалили при тестировании.
create or replace function pg_temp.person(p_name text, p_role text) returns uuid
language plpgsql as $$
declare v uuid;
begin
  select id into v from public.profiles where full_name = p_name and deleted_at is null limit 1;
  if v is null then
    select id into v from public.profiles
    where full_name ilike split_part(p_name, ' ', 1) || '%' and deleted_at is null and is_active limit 1;
  end if;
  if v is null then
    select id into v from public.profiles where role_code = p_role and deleted_at is null and is_active
    order by user_id is null, created_at limit 1;
  end if;
  if v is null then
    insert into public.profiles(full_name, role_code) values (p_name, p_role) returning id into v;
  end if;
  return v;
end $$;

create or replace function pg_temp.sid(p_obj uuid, p_no int) returns uuid
language sql stable as $$ select id from public.object_stages where object_id = p_obj and number = p_no and deleted_at is null $$;

create or replace function pg_temp.log(p_obj uuid, p_type text, p_entity uuid, p_action text,
  p_msg text, p_actor uuid, p_at timestamptz) returns void
language sql as $$
  insert into public.history(object_id, entity_type, entity_id, action, message, actor_id, created_at)
  values (p_obj, p_type, p_entity, p_action, p_msg, p_actor, p_at) $$;

-- Закрыть этапы с p_from по p_to: даты подряд от сегодня + p_start_off с шагом p_step дней
create or replace function pg_temp.close_range(p_obj uuid, p_from int, p_to int,
  p_start_off int, p_step int, p_closer uuid) returns void
language plpgsql as $$
declare
  s record; i int := 0; v_today date := public.msk_today();
  v_start date; v_due date; v_closed date; v_actor uuid;
begin
  perform set_config('lider.rpc', 'on', true);
  for s in select * from public.object_stages
           where object_id = p_obj and number between p_from and p_to and deleted_at is null and not is_excluded
           order by number
  loop
    v_start  := v_today + p_start_off + i * p_step;
    v_due    := v_start + coalesce(s.duration_days, 7);
    v_closed := least(v_start + greatest(1, coalesce(s.duration_days, 7) - 1), v_today - 1);
    v_actor  := coalesce(s.executor_id, p_closer);

    update public.object_stages set
      status_code = 'closed', start_date = v_start, due_date = v_due,
      doc_sent_at = case when expected_doc is not null then v_start + 1 end,
      response_received_at = case when expected_doc is not null then least(v_start + 3, v_closed) end,
      confirmer_id = coalesce(confirmer_id, p_closer),
      closed_at = pg_temp.at(v_closed, 16), closed_by = p_closer
    where id = s.id;
    update public.object_stage_conditions set is_done = true, done_by = v_actor,
           done_at = pg_temp.at(v_closed, 11),
           value_text = case when kind = 'field' then coalesce(value_text, 'внесено') else value_text end
    where stage_id = s.id and deleted_at is null;
    update public.object_stage_steps set state = 'done', done_by = v_actor, done_at = pg_temp.at(v_closed, 10)
    where stage_id = s.id;

    perform pg_temp.log(p_obj, 'stage', s.id, 'status_changed',
      format('Этап %s «%s»: В работе', s.number, s.name), v_actor, pg_temp.at(v_start, 9));
    perform pg_temp.log(p_obj, 'stage', s.id, 'status_changed',
      format('Этап %s «%s»: На проверке', s.number, s.name), v_actor, pg_temp.at(v_closed, 12));
    perform pg_temp.log(p_obj, 'stage', s.id, 'status_changed',
      format('Этап %s «%s»: Закрыто', s.number, s.name), p_closer, pg_temp.at(v_closed, 16));
    i := i + 1;
  end loop;
end $$;

-- Этап в работе: статус, даты (смещения от сегодня), документ и ответ, заметка, «вне очереди»
create or replace function pg_temp.stage(p_obj uuid, p_no int, p_status text,
  p_start_off int, p_due_off int, p_sent_off int default null, p_resp_days int default null,
  p_note text default null, p_out_of_order boolean default false, p_remind int default null) returns void
language plpgsql as $$
declare
  s public.object_stages; v_today date := public.msk_today(); v_total int; v_done int; v_actor uuid;
  v_status_name text;
begin
  perform set_config('lider.rpc', 'on', true);
  select * into s from public.object_stages where object_id = p_obj and number = p_no and deleted_at is null;
  if not found then return; end if;
  v_actor := s.executor_id;

  update public.object_stages set
    status_code = p_status,
    start_date = v_today + p_start_off, due_date = v_today + p_due_off,
    doc_sent_at = case when p_sent_off is not null then v_today + p_sent_off end,
    response_days = coalesce(p_resp_days, response_days),
    remind_days = coalesce(p_remind, remind_days),
    note = p_note, out_of_order = p_out_of_order
  where id = s.id;

  -- Условия: на проверке — все, в работе — первая половина
  select count(*) into v_total from public.object_stage_conditions where stage_id = s.id and deleted_at is null;
  v_done := case when p_status = 'on_review' then v_total else v_total / 2 end;
  update public.object_stage_conditions c set is_done = true, done_by = v_actor,
         done_at = pg_temp.at(v_today + p_start_off + 1, 14),
         value_text = case when c.kind = 'field' then coalesce(c.value_text, 'внесено') else c.value_text end
  where c.id in (select id from public.object_stage_conditions where stage_id = s.id and deleted_at is null
                 order by sort limit v_done);

  perform pg_temp.log(p_obj, 'stage', s.id, 'status_changed',
    format('Этап %s «%s»: В работе', s.number, s.name), v_actor, pg_temp.at(v_today + p_start_off, 9));
  if p_status <> 'in_work' then
    select name into v_status_name from public.stage_statuses where code = p_status;
    perform pg_temp.log(p_obj, 'stage', s.id, 'status_changed',
      format('Этап %s «%s»: %s', s.number, s.name, v_status_name), v_actor,
      pg_temp.at(coalesce(v_today + p_sent_off, v_today - 1), 15));
  end if;
end $$;

-- Заявка с историей: статус, даты (смещения от сегодня), значения полей по подписям
create or replace function pg_temp.request(p_obj uuid, p_type text, p_status text,
  p_created_ago int, p_call_off int, p_initiator uuid, p_office uuid, p_values jsonb,
  p_result text default null, p_rep text default null, p_stage_no int default null,
  p_comment text default null) returns void
language plpgsql as $$
declare
  t public.request_types; v_id uuid; v_no bigint; v_today date := public.msk_today();
  v_created timestamptz := least(pg_temp.at(v_today - p_created_ago, 9) + interval '25 min', now() - interval '10 min');
  v_order text[] := array['new','ready','sent','accepted','done'];
  v_names text[] := array['Новая','Готова к отправке','Отправлена','Принята заказчиком','Исполнена'];
  v_idx int := array_position(v_order, p_status);
  v_step_at timestamptz; f record; k int;
begin
  select * into t from public.request_types where name = p_type and deleted_at is null limit 1;
  if not found then raise exception 'Нет вида заявки «%»', p_type; end if;

  -- шаги идут через сутки после создания, но не позже вчерашнего дня
  insert into public.requests(object_id, request_type_id, type_name, representative_id, stage_id,
    initiator_id, office_id, call_date, status, sent_at, accepted_at, done_at, done_by, result_text, created_at)
  values (p_obj, t.id, t.name,
    (select id from public.representatives where name = p_rep and deleted_at is null limit 1),
    pg_temp.sid(p_obj, p_stage_no),
    p_initiator, case when v_idx >= 2 then p_office end,
    v_today + p_call_off, p_status,
    case when v_idx >= 3 then least(v_created + interval '1 day', now() - interval '20 hours') end,
    case when v_idx >= 4 then least(v_created + interval '2 days', now() - interval '16 hours') end,
    case when v_idx = 5 then least(pg_temp.at(v_today + p_call_off, 17), now() - interval '2 hours') end,
    case when v_idx = 5 then p_office end,
    p_result, v_created)
  returning id, number into v_id, v_no;

  -- значения полей: снимок подписи и типа, как в request_save_values()
  for f in select * from public.request_type_fields
           where request_type_id = t.id and deleted_at is null and p_values ? label
  loop
    insert into public.request_field_values(request_id, field_id, label, field_type, value, updated_by, updated_at)
    values (v_id, f.id, f.label, f.field_type, p_values -> f.label,
            case when f.filled_by = 'office' then p_office else p_initiator end, v_created);
  end loop;
  if p_result is not null then
    insert into public.request_field_values(request_id, field_id, label, field_type, value, updated_by, updated_at)
    select v_id, tf.id, tf.label, tf.field_type, to_jsonb(p_result), p_office, v_created
    from public.request_type_fields tf
    where tf.request_type_id = t.id and tf.label = 'Номер протокола' and tf.deleted_at is null
    on conflict (request_id, field_id) do nothing;
  end if;

  perform pg_temp.log(p_obj, 'request', v_id, 'created',
    format('Заявка №%s «%s» создана, вызов на %s', v_no, t.name, to_char(v_today + p_call_off, 'DD.MM.YYYY')),
    p_initiator, v_created);
  for k in 2..v_idx loop
    v_step_at := least(v_created + (k - 1) * interval '1 day' - interval '3 hours', now() - interval '1 hour');
    perform pg_temp.log(p_obj, 'request', v_id, 'status_changed',
      format('Заявка №%s «%s»: %s', v_no, t.name, v_names[k]), p_office, v_step_at);
  end loop;

  if p_comment is not null then
    insert into public.request_comments(request_id, author_id, text, created_at)
    values (v_id, p_office, p_comment, least(v_created + interval '1 day 2 hours', now() - interval '30 min'));
  end if;
end $$;

-- ---------- Наполнение ----------
do $$
declare
  v_admin_uid uuid; v_admin uuid; v_today date := public.msk_today();
  v_nikitin uuid; v_sergeev uuid; v_kovalev uuid; v_galina uuid; v_belova uuid;
  v_milana uuid; v_muslim uuid; v_fomina uuid;
  v_mosgaz uuid; v_sever uuid; v_prom uuid; v_alfa uuid;
  o1 uuid; o2 uuid; o3 uuid; o4 uuid; o5 uuid; o6 uuid;
begin
  -- Без исправления из 02_fixes.sql любое изменение этапа или заявки падает («record "new" has no field»)
  if not exists (select 1 from pg_proc where proname = 'tg_guard_status'
                 and prosrc like '%elsif tg_table_name = ''requests'' then%') then
    raise exception 'Сначала выполните db/02_fixes.sql (исправление триггера статусов), затем запустите этот файл снова';
  end if;
  if exists (select 1 from public.objects where name like 'Газопровод среднего давления по ул. Профсоюзной%' and deleted_at is null) then
    raise exception 'Демо-данные уже загружены — повторный запуск не нужен';
  end if;

  -- Действуем от имени администратора: функции БД проверяют права и пишут автора в историю
  select p.user_id, p.id into v_admin_uid, v_admin
  from public.profiles p join public.roles r on r.code = p.role_code
  where r.is_admin and p.user_id is not null and p.deleted_at is null order by p.created_at limit 1;
  if v_admin_uid is null then raise exception 'Не найден администратор с логином (см. 01_after_migration.sql)'; end if;
  perform set_config('request.jwt.claim.sub', v_admin_uid::text, true);

  -- 1. Нормативы этапов справочника — только там, где пусто (заказчик заменит своими)
  update public.stage_templates st set
    duration_days  = coalesce(st.duration_days, n.dur),
    executor_role  = coalesce(st.executor_role, n.exec),
    confirmer_role = coalesce(st.confirmer_role, n.conf),
    response_days  = coalesce(st.response_days, case when st.expected_doc is not null then n.resp end),
    remind_days    = coalesce(st.remind_days, n.remind)
  from public.work_types w
  join (values
    ('Тендер и договор',              10, 'pto',     'director', 7,  3),
    ('Документация и согласования',   14, 'pto',     'director', 10, 3),
    ('Геодезия и съёмки',              5, 'foreman', 'pto',      5,  2),
    ('Земляные работы',               10, 'foreman', 'pto',      5,  2),
    ('Сварочно-монтажные работы',     12, 'foreman', 'pto',      5,  2),
    ('Испытания и просвет стыков',     5, 'foreman', 'pto',      5,  2),
    ('Химзащита (ЭХЗ)',                7, 'foreman', 'pto',      7,  2),
    ('Врезка и сдача',                 7, 'foreman', 'director', 7,  2),
    ('Благоустройство и озеленение',  14, 'foreman', 'director', 10, 3),
    ('Папка ИД и форма 6',            10, 'pto',     'director', 14, 3)
  ) as n(wt, dur, exec, conf, resp, remind) on n.wt = w.name
  where st.work_type_id = w.id and st.deleted_at is null;

  -- Второй пример сценария — «Комиссионный акт — бегунок по службам» (этап 39)
  insert into public.stage_template_steps(template_id, step_no, role_code, action, action_kind, duration_days)
  select st.id, s.step_no, s.role_code, s.action, s.action_kind, s.days
  from public.stage_templates st
  cross join (values
    (1, 'pto',      'Подготовить акт-бегунок и приложить исполнительную схему', 'fill',    2),
    (2, 'foreman',  'Собрать подписи технадзора и руководителя технадзора',     'confirm', 3),
    (3, 'foreman',  'Собрать подписи первого и второго цеха',                    'confirm', 3),
    (4, 'pto',      'Положить подписанный комиссионный акт в папку ИД',          'attach',  1)
  ) as s(step_no, role_code, action, action_kind, days)
  where st.number = 39 and st.deleted_at is null
    and not exists (select 1 from public.stage_template_steps x where x.template_id = st.id and x.deleted_at is null);

  -- 2. Сотрудники: ФИО вместо «(тест)», ещё четыре человека без логина
  update public.profiles set full_name = 'Никитин Роман Андреевич' where full_name = 'Прораб (тест)';
  update public.profiles set full_name = 'Фомина Ольга Петровна'  where full_name = 'Снабжение (тест)';
  insert into public.profiles(full_name, role_code, phone)
  select v.n, v.r, v.ph from (values
    ('Сергеев Андрей Викторович', 'foreman', '+7 916 204-18-37'),
    ('Ковалёв Дмитрий Олегович',  'foreman', '+7 925 611-40-92'),
    ('Белова Ирина Сергеевна',    'pto',     '+7 903 778-25-14')
  ) as v(n, r, ph)
  where not exists (select 1 from public.profiles p where p.full_name = v.n and p.deleted_at is null);

  -- Прораб с логином — тот, под кем заходят «как прораб»; если логина у прораба нет — любой прораб
  select id into v_nikitin from public.profiles
  where role_code = 'foreman' and user_id is not null and deleted_at is null and is_active order by created_at limit 1;
  if v_nikitin is null then v_nikitin := pg_temp.person('Никитин Роман Андреевич', 'foreman'); end if;
  v_sergeev := pg_temp.person('Сергеев Андрей Викторович', 'foreman');
  v_kovalev := pg_temp.person('Ковалёв Дмитрий Олегович', 'foreman');
  v_galina  := pg_temp.person('Галина Ивановна', 'pto');
  v_belova  := pg_temp.person('Белова Ирина Сергеевна', 'pto');
  v_milana  := pg_temp.person('Милана', 'office');
  v_muslim  := pg_temp.person('Муслим', 'director');
  v_fomina  := pg_temp.person('Фомина Ольга Петровна', 'supply');
  -- Разные люди на разных ролях: если по роли нашёлся тот же человек, создаём отдельного
  if v_sergeev = v_nikitin then
    insert into public.profiles(full_name, role_code) values ('Сергеев Андрей Викторович', 'foreman') returning id into v_sergeev;
  end if;
  if v_kovalev in (v_nikitin, v_sergeev) then
    insert into public.profiles(full_name, role_code) values ('Ковалёв Дмитрий Олегович', 'foreman') returning id into v_kovalev;
  end if;
  if v_belova = v_galina then
    insert into public.profiles(full_name, role_code) values ('Белова Ирина Сергеевна', 'pto') returning id into v_belova;
  end if;

  -- 3. Заказчики
  update public.customers set name = 'ООО «Альфа-Девелопмент»' where name = 'Тестовый заказчик';
  insert into public.customers(name, inn, legal_address, comment)
  select v.n, v.inn, v.addr, v.cm from (values
    ('ООО «Северная девелоперская компания»', '7715004821', 'г. Москва, ул. Летчика Бабушкина, д. 1, офис 12', 'Коммерческий заказчик, ЖК «Северный парк»'),
    ('ООО «ПромТехСтрой»',                    '7722418390', 'г. Москва, Рязанский пр-т, д. 8А, стр. 3',       'Вынос сетей из пятна застройки')
  ) as v(n, inn, addr, cm)
  where not exists (select 1 from public.customers c where c.name = v.n and c.deleted_at is null);
  insert into public.customer_contacts(customer_id, full_name, position, phone, sort)
  select c.id, v.fn, v.pos, v.ph, 1 from public.customers c
  join (values
    ('ООО «Северная девелоперская компания»', 'Зайцева Марина Александровна', 'Руководитель проекта', '+7 495 120-44-08'),
    ('ООО «ПромТехСтрой»',                    'Лебедев Игорь Николаевич',     'Главный инженер',      '+7 495 987-31-20')
  ) as v(cn, fn, pos, ph) on v.cn = c.name
  where not exists (select 1 from public.customer_contacts cc where cc.customer_id = c.id and cc.deleted_at is null);

  select id into v_mosgaz from public.customers where name like 'АО%МОСГАЗ%' and deleted_at is null limit 1;
  select id into v_sever  from public.customers where name = 'ООО «Северная девелоперская компания»' limit 1;
  select id into v_prom   from public.customers where name = 'ООО «ПромТехСтрой»' limit 1;
  select id into v_alfa   from public.customers where name = 'ООО «Альфа-Девелопмент»' limit 1;

  -- 4. Объекты (create_object копирует этапы с условиями и сценариями, как из интерфейса)
  o1 := public.create_object(jsonb_build_object(
    'name', 'Газопровод среднего давления по ул. Профсоюзной, вл. 56', 'address', 'г. Москва, ул. Профсоюзная, вл. 56',
    'customer_id', v_mosgaz, 'object_type', 'uks', 'responsible_id', v_galina, 'status', 'in_work',
    'contract_start', v_today - 80, 'contract_end', v_today + 60,
    'notes', 'Ду 225 ПЭ, протяжённость 1,2 км, 2 врезки. Работы на проезжей части — ночью.'),
    array[v_nikitin, v_galina, v_milana, v_fomina, v_muslim],
    (select array_agg(id) from public.stage_templates where deleted_at is null and is_active));

  o2 := public.create_object(jsonb_build_object(
    'name', 'Перекладка газопровода низкого давления, Варшавское ш., д. 118', 'address', 'г. Москва, Варшавское ш., д. 118',
    'customer_id', v_mosgaz, 'object_type', 'uks', 'responsible_id', v_galina, 'status', 'in_work',
    'contract_start', v_today - 120, 'contract_end', v_today + 9,
    'notes', 'Сталь Ду 159, 640 м. Перекладка без отключения абонентов.'),
    array[v_nikitin, v_galina, v_milana, v_muslim],
    (select array_agg(id) from public.stage_templates where deleted_at is null and is_active));

  o3 := public.create_object(jsonb_build_object(
    'name', 'Газоснабжение ЖК «Северный парк», корпус 3', 'address', 'г. Москва, ул. Летчика Бабушкина, вл. 17, корп. 3',
    'customer_id', v_sever, 'object_type', 'urip', 'responsible_id', v_belova, 'status', 'in_work',
    'contract_start', v_today - 15, 'contract_end', v_today + 150,
    'notes', 'Ввод к котельной жилого корпуса, ПЭ Ду 110, 310 м.'),
    array[v_nikitin, v_belova, v_milana, v_fomina],
    (select array_agg(id) from public.stage_templates where deleted_at is null and is_active
       and number not in (11, 12, 15, 16, 39, 40)));

  o4 := public.create_object(jsonb_build_object(
    'name', 'Вынос газопровода из пятна застройки, Рязанский пр-т, вл. 2', 'address', 'г. Москва, Рязанский пр-т, вл. 2',
    'customer_id', v_prom, 'object_type', 'urip', 'responsible_id', v_galina, 'status', 'in_work',
    'contract_start', v_today - 150, 'contract_end', v_today - 6,
    'notes', 'Срок договора прошёл: ждём допсоглашение о продлении на 30 дней.'),
    array[v_sergeev, v_galina, v_milana, v_muslim],
    (select array_agg(id) from public.stage_templates where deleted_at is null and is_active));

  o5 := public.create_object(jsonb_build_object(
    'name', 'Газопровод к котельной, Дмитровское ш., вл. 9', 'address', 'г. Москва, Дмитровское ш., вл. 9',
    'customer_id', v_alfa, 'object_type', 'urip', 'responsible_id', v_galina, 'status', 'planned',
    'contract_start', v_today + 10, 'contract_end', v_today + 200,
    'notes', 'Договор подписан, ждём ордер ОАТИ.'),
    array[v_nikitin, v_kovalev, v_galina, v_milana],
    (select array_agg(id) from public.stage_templates where deleted_at is null and is_active));

  o6 := public.create_object(jsonb_build_object(
    'name', 'Реконструкция газопровода, ул. Нагорная, д. 20', 'address', 'г. Москва, ул. Нагорная, д. 20',
    'customer_id', v_mosgaz, 'object_type', 'uks', 'responsible_id', v_galina, 'status', 'in_work',
    'contract_start', v_today - 260, 'contract_end', v_today - 40),
    array[v_nikitin, v_galina, v_milana, v_muslim],
    (select array_agg(id) from public.stage_templates where deleted_at is null and is_active));

  -- Создание объектов — задним числом, к началу договора
  -- (для планируемого объекта с будущим началом — вчера, чтобы история не уходила в будущее)
  update public.history h set created_at = least(pg_temp.at(o.contract_start - 3, 10), now() - interval '1 day')
  from public.objects o where h.object_id = o.id and h.entity_type = 'object' and o.id in (o1, o2, o3, o4, o5, o6);
  update public.objects set created_at = least(pg_temp.at(contract_start - 3, 10), now() - interval '1 day')
  where id in (o1, o2, o3, o4, o5, o6);

  -- 5. Ход этапов
  -- О1: середина работ — просрочка, «нет ответа», без исполнителя, вне очереди, на проверке
  perform pg_temp.close_range(o1, 1, 13, -78, 4, v_muslim);
  perform pg_temp.close_range(o1, 15, 17, -26, 4, v_muslim);
  perform pg_temp.stage(o1, 18, 'in_work',       -12, -3, p_note => 'Экскаватор на другом объекте, обещали вернуть в четверг');
  perform pg_temp.stage(o1, 19, 'in_work',        -6,  8);
  perform pg_temp.stage(o1, 20, 'sent',           -11,  6, p_sent_off => -9, p_resp_days => 5, p_note => 'Лаборатория не ответила, звонила 2 раза');
  perform pg_temp.stage(o1, 22, 'waiting_visit',   -4,  3, p_sent_off => -2);
  perform pg_temp.stage(o1, 24, 'in_work',         -2, 12, p_out_of_order => true, p_note => 'Начали адгезию на готовом участке, не дожидаясь изоляции по всей трассе');
  perform pg_temp.stage(o1, 14, 'on_review',      -10,  2);
  update public.object_stages set executor_id = null where id = pg_temp.sid(o1, 21);

  -- О2: финиш, срок договора через 9 дней — «горит», комиссионный акт по сценарию
  perform pg_temp.close_range(o2, 1, 33, -118, 3, v_muslim);
  perform pg_temp.stage(o2, 34, 'on_review',  -6, 1);
  perform pg_temp.stage(o2, 35, 'in_work',    -4, 1, p_remind => 3, p_note => 'АНПИ назначено на завтра, 9:00');
  perform pg_temp.stage(o2, 38, 'sent',       -3, 4, p_sent_off => -2, p_resp_days => 7);
  perform pg_temp.stage(o2, 39, 'in_work',    -2, 6);
  update public.object_stage_steps set state = 'done', done_by = v_galina, done_at = pg_temp.at(v_today - 1, 15),
         comment = 'Бегунок передан Никитину'
  where stage_id = pg_temp.sid(o2, 39) and step_no = 1;
  update public.object_stage_steps set state = 'current' where stage_id = pg_temp.sid(o2, 39) and step_no = 2;
  perform pg_temp.log(o2, 'stage', pg_temp.sid(o2, 39), 'step_done',
    'Этап 39: шаг 1 «Подготовить акт-бегунок и приложить исполнительную схему» выполнен', v_galina, pg_temp.at(v_today - 1, 15));

  -- О3: начало работ, сценарий «Согласование ЖКХ» на 2-м шаге
  perform pg_temp.close_range(o3, 1, 2, -14, 5, v_muslim);
  perform pg_temp.stage(o3, 3, 'in_work', -4, 10);
  perform pg_temp.stage(o3, 4, 'sent',    -3, 11, p_sent_off => -2, p_resp_days => 10);
  perform pg_temp.stage(o3, 7, 'in_work', -3, 11);
  update public.object_stage_steps set state = 'done', done_by = v_milana, done_at = pg_temp.at(v_today - 2, 12),
         comment = 'Адрес управы нашли в томе ПОС'
  where stage_id = pg_temp.sid(o3, 7) and step_no = 1;
  update public.object_stage_steps set state = 'current' where stage_id = pg_temp.sid(o3, 7) and step_no = 2;
  perform pg_temp.log(o3, 'stage', pg_temp.sid(o3, 7), 'step_done',
    'Этап 7: шаг 1 «Найти в документации данные и адрес, куда отправлять; подготовить заявку» выполнен', v_milana, pg_temp.at(v_today - 2, 12));
  perform public.stage_set_excluded(pg_temp.sid(o3, 44), true);

  -- О4: срок договора прошёл, хвосты по сдаче
  perform pg_temp.close_range(o4, 1, 40, -148, 3, v_muslim);
  perform pg_temp.stage(o4, 41, 'in_work', -18, -10, p_note => 'Эксплуатация переносит приёмку, ждём письмо');
  perform pg_temp.stage(o4, 42, 'sent',    -14,  -2, p_sent_off => -12, p_resp_days => 7);
  update public.object_stages set executor_id = null where id = pg_temp.sid(o4, 43);

  -- О6: завершён полностью и перенесён в архив
  perform pg_temp.close_range(o6, 1, 49, -255, 4, v_muslim);
  update public.objects set status = 'completed', completed_at = pg_temp.at(v_today - 42, 17) where id = o6;
  perform pg_temp.log(o6, 'object', o6, 'completed', 'Объект завершён и перенесён в архив', v_muslim, pg_temp.at(v_today - 42, 17));

  -- 6. Заявки: все виды и статусы; порядок вставки — по дате создания, номера идут по времени
  perform pg_temp.request(o6, 'Технадзор',      'done', 70, -66, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 0+00 – ПК 2+40", "Длина, м": 240, "Количество стыков": 31}', 'ТН-2041/26');
  perform pg_temp.request(o6, 'Геотрест',       'done', 52, -48, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 0+00 – ПК 4+10", "Длина, м": 410}', 'ГТ-17733');
  perform pg_temp.request(o4, 'Лаборатория МГ', 'done', 40, -36, v_sergeev, v_milana,
    '{"Пикеты (от – до)": "ПК 1+20 – ПК 3+00", "Количество стыков": 24, "Комментарий прораба": "Просвет стыков на участке под проезжей частью"}', 'ЛМГ-0912/26');
  perform pg_temp.request(o1, 'Технадзор',      'done', 34, -30, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 0+00 – ПК 1+50", "Длина, м": 150, "Количество стыков": 18}', 'ТН-2188/26');
  perform pg_temp.request(o2, 'АНПИ',           'done', 30, -27, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 2+00 – ПК 4+40", "Длина, м": 240}', 'АНПИ-334');
  perform pg_temp.request(o1, 'Представители',  'done', 28, -25, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 0+80 – ПК 1+10", "Комментарий прораба": "Пересечение с кабелем 10 кВ, нужен представитель на шурфовку"}',
    'Акт допуска № 58', 'Россети', 14, 'Россети подтвердили выезд представителя');
  perform pg_temp.request(o2, 'ДИ',             'done', 24, -21, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 0+00 – ПК 2+00", "Длина, м": 200}', 'ДИ-1187');
  perform pg_temp.request(o1, 'Лаборатория МГ', 'done', 20, -17, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 1+50 – ПК 3+20", "Количество стыков": 22}', 'ЛМГ-1043/26', null, 22);
  perform pg_temp.request(o4, 'Эксплуатация',   'sent', 16, -9, v_sergeev, v_milana,
    '{"Пикеты (от – до)": "ПК 0+00 – ПК 5+20", "Комментарий прораба": "Приёмка в эксплуатацию, ковера и люки"}',
    null, null, 41, 'Эксплуатация просит перенести, ждём письменный ответ');
  perform pg_temp.request(o4, 'Геотрест',       'sent', 14, -6, v_sergeev, v_milana,
    '{"Пикеты (от – до)": "ПК 4+40 – ПК 5+20", "Длина, м": 80}', null, null, 42, 'Геотрест не отвечает, звонила дважды');
  perform pg_temp.request(o2, 'Геотрест',       'accepted', 12, -5, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 3+00 – ПК 6+40", "Длина, м": 340}', null, null, 42);
  perform pg_temp.request(o1, 'Интеграл',       'done', 11, -8, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 2+00 – ПК 2+60", "Количество стыков": 7}', 'ИНТ-5520');
  perform pg_temp.request(o1, 'Заказ снабжение','done', 10, -7, v_nikitin, v_fomina,
    '{"Что нужно (материал)": "Труба ПЭ 100 SDR 11 Ду 225", "Количество": "120 м", "Комментарий": "Доставка на площадку до 8:00"}',
    'Доставлено, накладная № 4471');
  perform pg_temp.request(o2, 'Технадзор',      'done', 9, -6, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 4+40 – ПК 6+40", "Длина, м": 200, "Количество стыков": 26}', 'ТН-2302/26');
  perform pg_temp.request(o4, 'Технадзор',      'ready', 9, -1, v_sergeev, v_milana,
    '{"Пикеты (от – до)": "ПК 4+80 – ПК 5+20", "Длина, м": 40}', null, null, null, 'Ждём подтверждения от технадзора');
  perform pg_temp.request(o1, 'ЭПИД',           'sent', 8, -3, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 3+20 – ПК 4+00", "Длина, м": 80}', null, null, null, 'ЭПИД перезвонят по дате выезда');
  perform pg_temp.request(o1, 'Технадзор',      'accepted', 7, 1, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 3+20 – ПК 4+60", "Длина, м": 140, "Количество стыков": 16, "Комментарий прораба": "Труба, изоляция, подсыпка"}',
    null, null, 25, 'Технадзор связался, они на связи');
  perform pg_temp.request(o3, 'Представители',  'accepted', 6, 2, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 0+40 – ПК 0+90", "Комментарий прораба": "Пересечение с водопроводом Ду 300"}',
    null, 'Водоканал', 14);
  perform pg_temp.request(o2, 'Эксплуатация',   'sent', 5, 2, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 0+00 – ПК 6+40", "Комментарий прораба": "Сдача сооружений: ковера, люки, ЭХЗ"}', null, null, 36);
  perform pg_temp.request(o1, 'АНПИ',           'ready', 4, 3, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 1+50 – ПК 3+20", "Длина, м": 170}');
  perform pg_temp.request(o3, 'Заказ снабжение','ready', 4, 2, v_nikitin, v_fomina,
    '{"Что нужно (материал)": "Футляр ПЭ Ду 225, отводы 90° Ду 110", "Количество": "12 м, 4 шт.", "Комментарий": "Под переход через дорогу"}');
  perform pg_temp.request(o2, 'Лаборатория МГ', 'ready', 3, 1, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 5+00 – ПК 6+40", "Количество стыков": 15}', null, null, 34);
  perform pg_temp.request(o3, 'Геотрест',       'sent', 3, 4, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 0+00 – ПК 3+10", "Длина, м": 310}', null, null, 13);
  perform pg_temp.request(o1, 'Представители',  'new', 1, 4, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 4+60 – ПК 5+10", "Комментарий прораба": "Тепловая сеть в зоне траншеи"}', null, 'Теплосети');
  perform pg_temp.request(o1, 'Лаборатория МГ', 'new', 0, 3, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 3+20 – ПК 4+60", "Количество стыков": 16, "Комментарий прораба": "Просвет 100% на проезжей части"}', null, null, 22);
  perform pg_temp.request(o2, 'ДИ',             'new', 0, 2, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 4+00 – ПК 6+40", "Длина, м": 240}');
  perform pg_temp.request(o3, 'Технадзор',      'new', 0, 5, v_nikitin, v_milana,
    '{"Пикеты (от – до)": "ПК 0+00 – ПК 1+20", "Длина, м": 120, "Комментарий прораба": "Первый выход технадзора на объект"}');
  perform pg_temp.request(o5, 'Заказ снабжение','new', 0, 12, v_kovalev, v_fomina,
    '{"Что нужно (материал)": "Труба ПЭ 100 SDR 11 Ду 160", "Количество": "450 м", "Комментарий": "Под старт работ по договору"}');
end $$;

-- Проверка: объектов 6, заявок не меньше 28; новых, просроченных и исполненных — больше нуля
select
  (select count(*) from public.objects where created_at > now() - interval '400 days'
     and name in ('Газопровод среднего давления по ул. Профсоюзной, вл. 56',
                  'Перекладка газопровода низкого давления, Варшавское ш., д. 118',
                  'Газоснабжение ЖК «Северный парк», корпус 3',
                  'Вынос газопровода из пятна застройки, Рязанский пр-т, вл. 2',
                  'Газопровод к котельной, Дмитровское ш., вл. 9',
                  'Реконструкция газопровода, ул. Нагорная, д. 20')) as objects,
  (select count(*) from public.v_requests) as requests,
  (select count(*) from public.v_requests where is_new) as requests_new,
  (select count(*) from public.v_requests where is_overdue) as requests_overdue,
  (select count(*) from public.v_requests where status = 'done') as requests_done,
  (select count(*) from public.v_object_stages where is_overdue and not is_excluded) as stages_overdue;


-- =============================================================================
-- 20251020000006_hide_test_objects.sql
-- =============================================================================

-- =====================================================================
-- ООО «Лидер» · Необязательно: скрыть тестовые объекты «ТЕСТ · …» перед показом
-- Удаление мягкое (deleted_at), как везде в системе: данные остаются в базе.
-- Скрываются объект, его этапы и заявки — иначе заявки остались бы в общем
-- списке и счётчиках (v_requests не проверяет, удалён ли объект).
-- Вернуть всё обратно — блок «Отмена» в конце файла.
-- =====================================================================

update public.requests r set deleted_at = now(), delete_reason = 'Тестовые данные скрыты перед показом'
from public.objects o
where r.object_id = o.id and o.name like 'ТЕСТ%' and o.deleted_at is null and r.deleted_at is null;

update public.object_stages s set deleted_at = now()
from public.objects o
where s.object_id = o.id and o.name like 'ТЕСТ%' and o.deleted_at is null and s.deleted_at is null;

update public.objects set deleted_at = now()
where name like 'ТЕСТ%' and deleted_at is null;

-- Проверка: должно быть 0 видимых тестовых объектов и заявок
select
  (select count(*) from public.objects where name like 'ТЕСТ%' and deleted_at is null) as test_objects_visible,
  (select count(*) from public.v_requests where object_name like 'ТЕСТ%') as test_requests_visible;

-- ---------------------------------------------------------------------
-- Отмена (выполнить отдельно, если тестовые объекты нужно вернуть):
-- update public.objects set deleted_at = null where name like 'ТЕСТ%';
-- update public.object_stages s set deleted_at = null from public.objects o
--   where s.object_id = o.id and o.name like 'ТЕСТ%';
-- update public.requests r set deleted_at = null, delete_reason = null from public.objects o
--   where r.object_id = o.id and o.name like 'ТЕСТ%' and r.delete_reason = 'Тестовые данные скрыты перед показом';
-- ---------------------------------------------------------------------


-- =============================================================================
-- 20251020000007_stage_template_files.sql
-- =============================================================================

-- =====================================================================
-- «Лидер» — правка 2.3: файлы «От нас» и «Ждём» у этапов справочника
--
-- Раньше в справочнике этапов «От нас» (исходящий документ) и «Ждём»
-- (ответный документ) были только текстом. Теперь к каждому из них можно
-- приложить несколько файлов-образцов (бланк письма, пример ответа и т. п.).
-- Файлы видны всем сотрудникам — в справочнике и в карточке этапа на объекте.
--
-- Запускать в Supabase → SQL Editor ПОСЛЕ 00…05. Повторный запуск безопасен.
-- Ничего существующего не меняет: новая таблица и новое хранилище.
--
-- Почему отдельное хранилище, а не lider-files: правила доступа lider-files
-- берут первую папку пути как id объекта; у файлов справочника объекта нет.
-- =====================================================================

create table if not exists public.stage_template_files (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references public.stage_templates(id),
  kind          text not null check (kind in ('outgoing', 'expected')),   -- «От нас» / «Ждём»
  storage_path  text not null,          -- хранилище lider-templates: {template_id}/{kind}/{uuid}-{имя}
  file_name     text not null,
  mime_type     text,
  size_bytes    bigint,
  uploaded_by   uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists stage_template_files_template_idx on public.stage_template_files(template_id);

-- Права — как у остальных справочников: читают все, правят администратор и руководитель
alter table public.stage_template_files enable row level security;
drop policy if exists stage_template_files_sel on public.stage_template_files;
drop policy if exists stage_template_files_adm on public.stage_template_files;
create policy stage_template_files_sel on public.stage_template_files
  for select to authenticated using (true);
create policy stage_template_files_adm on public.stage_template_files
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.stage_template_files to authenticated;

-- Хранилище
insert into storage.buckets(id, name, public) values ('lider-templates', 'lider-templates', false)
on conflict (id) do nothing;

drop policy if exists lider_templates_read on storage.objects;
drop policy if exists lider_templates_write on storage.objects;
drop policy if exists lider_templates_delete on storage.objects;
create policy lider_templates_read on storage.objects for select to authenticated
  using (bucket_id = 'lider-templates');
create policy lider_templates_write on storage.objects for insert to authenticated
  with check (bucket_id = 'lider-templates' and public.is_admin());
create policy lider_templates_delete on storage.objects for delete to authenticated
  using (bucket_id = 'lider-templates' and public.is_admin());

-- Проверка: таблица есть, хранилище есть, политик хранилища 3
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'stage_template_files') as table_ok,
  (select count(*) from storage.buckets where id = 'lider-templates') as bucket_ok,
  (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'lider_templates_%') as storage_policies;


-- =============================================================================
-- 20251020000008_object_types.sql
-- =============================================================================

-- =====================================================================
-- «Лидер» — правка 2.5: «Тип объекта» — настраиваемый справочник
--
-- Было: objects.object_type ограничен двумя значениями прямо в схеме
-- (check in ('uks','urip')), подписи «УКС» / «УРиП» зашиты в интерфейсе.
-- Стало: справочник public.object_types (код, название, порядок);
-- objects.object_type ссылается на него. Существующие объекты не меняются:
-- коды 'uks' и 'urip' остаются, им заводятся строки «УКС» и «УРиП».
--
-- Запускать в Supabase → SQL Editor ПОСЛЕ 00…06. Повторный запуск безопасен.
-- =====================================================================

create table if not exists public.object_types (
  code        text primary key default ('t' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  name        text not null unique,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

insert into public.object_types(code, name, sort) values
  ('uks',  'УКС',  1),
  ('urip', 'УРиП', 2)
on conflict (code) do nothing;

-- Снимаем жёсткий список значений и ставим ссылку на справочник
do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.objects'::regclass and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%object_type%'
  loop
    execute format('alter table public.objects drop constraint %I', c);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'objects_object_type_fkey') then
    alter table public.objects
      add constraint objects_object_type_fkey foreign key (object_type)
      references public.object_types(code) on update cascade;
  end if;
end $$;

-- Права — как у остальных справочников
alter table public.object_types enable row level security;
drop policy if exists object_types_sel on public.object_types;
drop policy if exists object_types_adm on public.object_types;
create policy object_types_sel on public.object_types for select to authenticated using (true);
create policy object_types_adm on public.object_types for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.object_types to authenticated;

-- Проверка: типов ≥ 2, ссылка на справочник есть, объектов с неизвестным типом 0
select
  (select count(*) from public.object_types where deleted_at is null) as types,
  (select count(*) from pg_constraint where conname = 'objects_object_type_fkey') as fk_ok,
  (select count(*) from public.objects o
     where not exists (select 1 from public.object_types t where t.code = o.object_type)) as orphans;


-- =============================================================================
-- 20251020000009_picket_range_field.sql
-- =============================================================================

-- =====================================================================
-- «Лидер» — правка 2.10: тип поля заявки «Пикеты (от – до)»
--
-- Новый тип поля 'picket_range': в форме — раздельный ввод
-- «от ПК [ ] + [ ] м — до ПК [ ] + [ ] м» с подсчётом длины участка.
-- Значение хранится как раньше — строкой «ПК 3+20 – ПК 4+60», поэтому
-- старые заявки, поиск, проверки обязательных полей и Excel не меняются.
--
-- Все существующие поля «Пикеты…» с типом «Текст» переводятся на новый тип.
-- Запускать в Supabase → SQL Editor ПОСЛЕ 00…07. Повторный запуск безопасен.
-- =====================================================================

do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.request_type_fields'::regclass and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%field_type%'
  loop
    execute format('alter table public.request_type_fields drop constraint %I', c);
  end loop;
end $$;

alter table public.request_type_fields
  add constraint request_type_fields_field_type_check
  check (field_type in ('text','number','date','select','checkbox','file','picket_range'));

update public.request_type_fields
set field_type = 'picket_range'
where field_type = 'text' and label ilike 'пикет%' and deleted_at is null;

-- Проверка: полей нового типа больше нуля (по одному на каждый вид заявки с пикетами)
select
  (select count(*) from public.request_type_fields where field_type = 'picket_range' and deleted_at is null) as picket_fields,
  (select count(*) from public.request_type_fields where field_type = 'text' and label ilike 'пикет%' and deleted_at is null) as left_as_text;


-- =============================================================================
-- 20251020000010_textarea_field.sql
-- =============================================================================

-- =====================================================================
-- «Лидер» — правка 2.11: тип поля заявки «Многострочный текст»
--
-- Новый тип поля 'textarea' — в форме поле в несколько строк.
-- Значение — та же строка, что у «Текста», поэтому старые заявки,
-- поиск и Excel не меняются. Поля «Комментарий…» переводятся на новый тип.
--
-- Запускать в Supabase → SQL Editor ПОСЛЕ 00…08. Повторный запуск безопасен.
-- =====================================================================

do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.request_type_fields'::regclass and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%field_type%'
  loop
    execute format('alter table public.request_type_fields drop constraint %I', c);
  end loop;
end $$;

alter table public.request_type_fields
  add constraint request_type_fields_field_type_check
  check (field_type in ('text','textarea','number','date','select','checkbox','file','picket_range'));

update public.request_type_fields
set field_type = 'textarea'
where field_type = 'text' and label ilike 'комментарий%' and deleted_at is null;

-- Проверка: полей «Комментарий…» в несколько строк больше нуля, обычным текстом не осталось
select
  (select count(*) from public.request_type_fields where field_type = 'textarea' and deleted_at is null) as textarea_fields,
  (select count(*) from public.request_type_fields where field_type = 'text' and label ilike 'комментарий%' and deleted_at is null) as left_as_text;


-- =============================================================================
-- 20251020000011_request_statuses.sql
-- =============================================================================

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


-- =============================================================================
-- 20251020000012_object_customer_contacts.sql
-- =============================================================================

-- =====================================================================
-- Контакты заказчика на объекте: куратор, технадзор, технадзор ЭХЗ (созвон 27.10.2026)
-- =====================================================================

alter table public.objects
  add column if not exists curator_contact_id uuid references public.customer_contacts(id),
  add column if not exists technadzor_contact_id uuid references public.customer_contacts(id),
  add column if not exists technadzor_ehz_contact_id uuid references public.customer_contacts(id);

create or replace function public.tg_objects_contacts_belong_to_customer()
returns trigger language plpgsql as $$
declare v_bad text;
begin
  if new.customer_id is null then
    if new.curator_contact_id is not null
       or new.technadzor_contact_id is not null
       or new.technadzor_ehz_contact_id is not null then
      raise exception 'Сначала укажите заказчика объекта';
    end if;
    return new;
  end if;

  select c.full_name into v_bad
  from public.customer_contacts c
  where c.id in (new.curator_contact_id, new.technadzor_contact_id, new.technadzor_ehz_contact_id)
    and c.customer_id is distinct from new.customer_id
  limit 1;
  if v_bad is not null then
    raise exception 'Контакт «%» не принадлежит выбранному заказчику', v_bad;
  end if;
  return new;
end $$;

drop trigger if exists objects_contacts_customer on public.objects;
create trigger objects_contacts_customer
  before insert or update of customer_id, curator_contact_id, technadzor_contact_id, technadzor_ehz_contact_id
  on public.objects
  for each row execute function public.tg_objects_contacts_belong_to_customer();

create or replace function public.create_object(p_object jsonb, p_member_ids uuid[], p_template_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;
  insert into public.objects(
    name, address, customer_id, object_type, contract_start, contract_end,
    responsible_id, status, notes, created_by,
    curator_contact_id, technadzor_contact_id, technadzor_ehz_contact_id
  )
  values (
    p_object->>'name',
    p_object->>'address',
    nullif(p_object->>'customer_id','')::uuid,
    coalesce(p_object->>'object_type','uks'),
    nullif(p_object->>'contract_start','')::date,
    nullif(p_object->>'contract_end','')::date,
    nullif(p_object->>'responsible_id','')::uuid,
    coalesce(p_object->>'status','in_work'),
    p_object->>'notes',
    public.current_profile_id(),
    nullif(p_object->>'curator_contact_id','')::uuid,
    nullif(p_object->>'technadzor_contact_id','')::uuid,
    nullif(p_object->>'technadzor_ehz_contact_id','')::uuid
  )
  returning id into v_id;

  insert into public.object_members(object_id, profile_id)
  select v_id, unnest(coalesce(p_member_ids, '{}')) on conflict do nothing;

  perform public.log_history(v_id, 'object', v_id, 'created', 'Объект создан', p_object);
  perform public.add_object_stages(v_id, coalesce(p_template_ids, '{}'));
  return v_id;
end $$;

-- CREATE OR REPLACE нельзя: новые колонки objects сдвигают позиции o.* — нужен DROP
drop view if exists public.v_objects;

create view public.v_objects as
select o.*,
  c.name as customer_name,
  rp.full_name as responsible_name,
  cur.full_name as curator_name,
  tn.full_name as technadzor_name,
  te.full_name as technadzor_ehz_name,
  case when o.contract_end is not null then o.contract_end - public.msk_today() end as contract_days_left,
  agg.stages_total, agg.stages_closed,
  case when agg.stages_total > 0 then round(100.0 * agg.stages_closed / agg.stages_total) else 0 end as progress_pct,
  agg.stages_overdue, agg.stages_no_response, agg.stages_on_review, agg.stages_no_executor,
  cur_st.number as current_stage_number, cur_st.name as current_stage_name,
  coalesce(rq.requests_new, 0) as requests_new, coalesce(rq.requests_overdue, 0) as requests_overdue
from public.objects o
left join public.customers c on c.id = o.customer_id
left join public.profiles rp on rp.id = o.responsible_id
left join public.customer_contacts cur on cur.id = o.curator_contact_id
left join public.customer_contacts tn on tn.id = o.technadzor_contact_id
left join public.customer_contacts te on te.id = o.technadzor_ehz_contact_id
left join lateral (
  select count(*) filter (where true)                         as stages_total,
         count(*) filter (where v.is_closed)                  as stages_closed,
         count(*) filter (where v.is_overdue)                 as stages_overdue,
         count(*) filter (where v.is_no_response)             as stages_no_response,
         count(*) filter (where v.status_code = 'on_review')  as stages_on_review,
         count(*) filter (where v.is_no_executor)             as stages_no_executor
  from public.v_object_stages v where v.object_id = o.id and not v.is_excluded) agg on true
left join lateral (
  select v.number, v.name from public.v_object_stages v
  where v.object_id = o.id and not v.is_excluded and not v.is_closed
  order by v.sort, v.number limit 1) cur_st on true
left join lateral (
  select count(*) filter (where vr.is_new) as requests_new,
         count(*) filter (where vr.is_overdue) as requests_overdue
  from public.v_requests vr where vr.object_id = o.id) rq on true
where o.deleted_at is null and public.can_see_object(o.id);

grant select on public.v_objects to authenticated, anon;


-- =============================================================================
-- 20251020000013_stage_template_norms.sql
-- =============================================================================

-- =====================================================================
-- Нормативы справочника этапов (duration / роли / ответ / напоминание)
-- Источник правды вне демо-скрипта 04 (созвон / ТЗ 3.4)
-- =====================================================================

update public.stage_templates st set
  duration_days  = coalesce(st.duration_days, n.dur),
  executor_role  = coalesce(st.executor_role, n.exec),
  confirmer_role = coalesce(st.confirmer_role, n.conf),
  response_days  = coalesce(st.response_days, case when st.expected_doc is not null then n.resp end),
  remind_days    = coalesce(st.remind_days, n.remind)
from public.work_types w
join (values
  ('Тендер и договор',              10, 'pto',     'director', 7,  3),
  ('Документация и согласования',   14, 'pto',     'director', 10, 3),
  ('Геодезия и съёмки',              5, 'foreman', 'pto',      5,  2),
  ('Земляные работы',               10, 'foreman', 'pto',      5,  2),
  ('Сварочно-монтажные работы',     12, 'foreman', 'pto',      5,  2),
  ('Испытания и просвет стыков',     5, 'foreman', 'pto',      5,  2),
  ('Химзащита (ЭХЗ)',                7, 'foreman', 'pto',      7,  2),
  ('Врезка и сдача',                 7, 'foreman', 'director', 7,  2),
  ('Благоустройство и озеленение',  14, 'foreman', 'director', 10, 3),
  ('Папка ИД и форма 6',            10, 'pto',     'director', 14, 3)
) as n(wt, dur, exec, conf, resp, remind) on n.wt = w.name
where st.work_type_id = w.id and st.deleted_at is null;


-- =============================================================================
-- 20251020000014_request_type_scenario.sql
-- =============================================================================

-- =====================================================================
-- Сценарий заявки: кто переводит на какой статус и какие поля обязательны
-- (созвон 27.10.2026). Цепочка статусов фиксирована; сценарий задаёт роли/поля.
-- =====================================================================

create table if not exists public.request_type_scenario_steps (
  id               uuid primary key default gen_random_uuid(),
  request_type_id  uuid not null references public.request_types(id) on delete cascade,
  step_no          int not null check (step_no >= 1),
  role_code        text not null references public.roles(code),
  -- Статус, НА который переходит заявка на этом шаге (кнопка «следующий»)
  to_status        text not null check (to_status in ('ready','sent','accepted','done')),
  sort             int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (request_type_id, step_no)
);

create trigger request_type_scenario_steps_updated before update on public.request_type_scenario_steps
  for each row execute function public.tg_set_updated_at();

create table if not exists public.request_type_scenario_step_fields (
  step_id   uuid not null references public.request_type_scenario_steps(id) on delete cascade,
  field_id  uuid not null references public.request_type_fields(id) on delete cascade,
  primary key (step_id, field_id)
);

alter table public.request_type_scenario_steps enable row level security;
alter table public.request_type_scenario_step_fields enable row level security;

drop policy if exists request_type_scenario_steps_sel on public.request_type_scenario_steps;
drop policy if exists request_type_scenario_steps_adm on public.request_type_scenario_steps;
create policy request_type_scenario_steps_sel on public.request_type_scenario_steps
  for select to authenticated using (true);
create policy request_type_scenario_steps_adm on public.request_type_scenario_steps
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists request_type_scenario_step_fields_sel on public.request_type_scenario_step_fields;
drop policy if exists request_type_scenario_step_fields_adm on public.request_type_scenario_step_fields;
create policy request_type_scenario_step_fields_sel on public.request_type_scenario_step_fields
  for select to authenticated using (true);
create policy request_type_scenario_step_fields_adm on public.request_type_scenario_step_fields
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Дефолтный сценарий для видов без шагов: прораб → ready, офис → sent/accepted/done
insert into public.request_type_scenario_steps(request_type_id, step_no, role_code, to_status, sort)
select t.id, s.step_no, s.role_code, s.to_status, s.step_no
from public.request_types t
cross join (values
  (1, 'foreman', 'ready'),
  (2, 'office',  'sent'),
  (3, 'office',  'accepted'),
  (4, 'office',  'done')
) as s(step_no, role_code, to_status)
where t.deleted_at is null
  and not exists (
    select 1 from public.request_type_scenario_steps x
    where x.request_type_id = t.id and x.deleted_at is null
  );

create or replace function public.request_set_status(p_request_id uuid, p_status text, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests; v_order text[] := array['new','ready','sent','accepted','done'];
        v_from int; v_to int; v_missing int;
        v_names jsonb := '{"new":"Новая","ready":"Готова к отправке","sent":"Отправлена","accepted":"Принята заказчиком","done":"Исполнена"}';
        v_name text;
        v_step record;
        v_my_role text;
        v_is_admin boolean;
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

  v_is_admin := public.is_admin();
  select role_code into v_my_role from public.profiles where id = public.current_profile_id();

  -- Вперёд по сценарию: проверяем роль шага (админ/руководитель — всегда)
  if v_to = v_from + 1 then
    select s.* into v_step
    from public.request_type_scenario_steps s
    where s.request_type_id = r.request_type_id
      and s.to_status = p_status
      and s.deleted_at is null
    order by s.step_no
    limit 1;

    if found and not v_is_admin and v_step.role_code is distinct from v_my_role then
      raise exception 'Этот шаг выполняет роль «%»', v_step.role_code;
    end if;

    if found then
      select count(*) into v_missing
      from public.request_type_scenario_step_fields sf
      join public.request_type_fields f on f.id = sf.field_id
      where sf.step_id = v_step.id
        and f.is_active and f.deleted_at is null
        and not exists (
          select 1 from public.request_field_values fv
          where fv.request_id = r.id and fv.field_id = f.id
            and fv.value is not null and fv.value <> 'null'::jsonb and fv.value <> '""'::jsonb
        )
        and not (f.field_type = 'file' and exists (
          select 1 from public.files fl
          where fl.entity_type = 'request_field' and fl.entity_id = r.id and fl.deleted_at is null
        ));
      if v_missing > 0 then
        raise exception 'Заполните обязательные поля шага: %', v_missing;
      end if;
    elsif p_status = 'ready' then
      -- Fallback как раньше: все required-поля вида
      select count(*) into v_missing from public.request_type_fields f
      where f.request_type_id = r.request_type_id and f.is_active and f.deleted_at is null and f.is_required
        and not exists (select 1 from public.request_field_values fv
                        where fv.request_id = r.id and fv.field_id = f.id
                          and fv.value is not null and fv.value <> 'null'::jsonb and fv.value <> '""'::jsonb)
        and not (f.field_type = 'file' and exists (select 1 from public.files fl
                 where fl.entity_type = 'request_field' and fl.entity_id = r.id and fl.deleted_at is null));
      if v_missing > 0 then raise exception 'Заполните обязательные поля: %', v_missing; end if;
    end if;
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

  select coalesce((select s.name from public.request_statuses s where s.code = p_status), v_names->>p_status) into v_name;
  perform public.log_history(r.object_id, 'request', r.id, 'status_changed',
    format('Заявка №%s «%s»: %s', r.number, r.type_name, v_name),
    jsonb_build_object('from', r.status, 'to', p_status));
end $$;

grant execute on function public.request_set_status(uuid, text, text) to authenticated;


-- =============================================================================
-- 20251020000015_request_seen.sql
-- =============================================================================

-- «Новая» = статус new и ещё не открывали карточку.
-- Счётчик в меню считает только такие заявки; открытие снимает метку.

alter table public.requests
  add column if not exists seen_at timestamptz;

-- CREATE OR REPLACE нельзя: новая колонка в r.* сдвигает позиции — нужен DROP.
drop view if exists public.v_objects;
drop view if exists public.v_requests;

create view public.v_requests with (security_invoker = true) as
select r.*,
  o.name as object_name,
  rp.name as representative_name,
  i.full_name as initiator_name,
  om.full_name as office_name,
  (r.status = 'new' and r.seen_at is null) as is_new,
  (r.status <> 'done' and r.call_date < public.msk_today()) as is_overdue
from public.requests r
join public.objects o on o.id = r.object_id
left join public.representatives rp on rp.id = r.representative_id
left join public.profiles i  on i.id = r.initiator_id
left join public.profiles om on om.id = r.office_id
where r.deleted_at is null;

grant select on public.v_requests to authenticated, anon;

create view public.v_objects as
select o.*,
  c.name as customer_name,
  rp.full_name as responsible_name,
  cur.full_name as curator_name,
  tn.full_name as technadzor_name,
  te.full_name as technadzor_ehz_name,
  case when o.contract_end is not null then o.contract_end - public.msk_today() end as contract_days_left,
  agg.stages_total, agg.stages_closed,
  case when agg.stages_total > 0 then round(100.0 * agg.stages_closed / agg.stages_total) else 0 end as progress_pct,
  agg.stages_overdue, agg.stages_no_response, agg.stages_on_review, agg.stages_no_executor,
  cur_st.number as current_stage_number, cur_st.name as current_stage_name,
  coalesce(rq.requests_new, 0) as requests_new, coalesce(rq.requests_overdue, 0) as requests_overdue
from public.objects o
left join public.customers c on c.id = o.customer_id
left join public.profiles rp on rp.id = o.responsible_id
left join public.customer_contacts cur on cur.id = o.curator_contact_id
left join public.customer_contacts tn on tn.id = o.technadzor_contact_id
left join public.customer_contacts te on te.id = o.technadzor_ehz_contact_id
left join lateral (
  select count(*) filter (where true)                         as stages_total,
         count(*) filter (where v.is_closed)                  as stages_closed,
         count(*) filter (where v.is_overdue)                 as stages_overdue,
         count(*) filter (where v.is_no_response)             as stages_no_response,
         count(*) filter (where v.status_code = 'on_review')  as stages_on_review,
         count(*) filter (where v.is_no_executor)             as stages_no_executor
  from public.v_object_stages v where v.object_id = o.id and not v.is_excluded) agg on true
left join lateral (
  select v.number, v.name from public.v_object_stages v
  where v.object_id = o.id and not v.is_excluded and not v.is_closed
  order by v.sort, v.number limit 1) cur_st on true
left join lateral (
  select count(*) filter (where vr.is_new) as requests_new,
         count(*) filter (where vr.is_overdue) as requests_overdue
  from public.v_requests vr where vr.object_id = o.id) rq on true
where o.deleted_at is null and public.can_see_object(o.id);

grant select on public.v_objects to authenticated, anon;

create or replace function public.request_mark_seen(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests;
begin
  select * into r from public.requests where id = p_request_id and deleted_at is null for update;
  if not found then raise exception 'Заявка не найдена'; end if;
  if not public.can_see_object(r.object_id) then raise exception 'Нет прав'; end if;
  if r.status <> 'new' or r.seen_at is not null then return; end if;

  perform set_config('lider.rpc', 'on', true);
  update public.requests set seen_at = now() where id = r.id;
end $$;

grant execute on function public.request_mark_seen(uuid) to authenticated;

-- При возврате на «Новая» снова показать в счётчике, пока не откроют.
create or replace function public.request_set_status(p_request_id uuid, p_status text, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests; v_order text[] := array['new','ready','sent','accepted','done'];
        v_from int; v_to int; v_missing int;
        v_names jsonb := '{"new":"Новая","ready":"Готова к отправке","sent":"Отправлена","accepted":"Принята заказчиком","done":"Исполнена"}';
        v_name text;
        v_step record;
        v_my_role text;
        v_is_admin boolean;
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

  v_is_admin := public.is_admin();
  select role_code into v_my_role from public.profiles where id = public.current_profile_id();

  if v_to = v_from + 1 then
    select s.* into v_step
    from public.request_type_scenario_steps s
    where s.request_type_id = r.request_type_id
      and s.to_status = p_status
      and s.deleted_at is null
    order by s.step_no
    limit 1;

    if found and not v_is_admin and v_step.role_code is distinct from v_my_role then
      raise exception 'Этот шаг выполняет роль «%»', v_step.role_code;
    end if;

    if found then
      select count(*) into v_missing
      from public.request_type_scenario_step_fields sf
      join public.request_type_fields f on f.id = sf.field_id
      where sf.step_id = v_step.id
        and f.is_active and f.deleted_at is null
        and not exists (
          select 1 from public.request_field_values fv
          where fv.request_id = r.id and fv.field_id = f.id
            and fv.value is not null and fv.value <> 'null'::jsonb and fv.value <> '""'::jsonb
        )
        and not (f.field_type = 'file' and exists (
          select 1 from public.files fl
          where fl.entity_type = 'request_field' and fl.entity_id = r.id and fl.deleted_at is null
        ));
      if v_missing > 0 then
        raise exception 'Заполните обязательные поля шага: %', v_missing;
      end if;
    elsif p_status = 'ready' then
      select count(*) into v_missing from public.request_type_fields f
      where f.request_type_id = r.request_type_id and f.is_active and f.deleted_at is null and f.is_required
        and not exists (select 1 from public.request_field_values fv
                        where fv.request_id = r.id and fv.field_id = f.id
                          and fv.value is not null and fv.value <> 'null'::jsonb and fv.value <> '""'::jsonb)
        and not (f.field_type = 'file' and exists (select 1 from public.files fl
                 where fl.entity_type = 'request_field' and fl.entity_id = r.id and fl.deleted_at is null));
      if v_missing > 0 then raise exception 'Заполните обязательные поля: %', v_missing; end if;
    end if;
  end if;

  perform set_config('lider.rpc', 'on', true);
  update public.requests set
    status      = p_status,
    office_id   = case when p_status = 'ready' and office_id is null then public.current_profile_id() else office_id end,
    sent_at     = case when p_status = 'sent' then now() when v_to < 3 then null else sent_at end,
    accepted_at = case when p_status = 'accepted' then now() when v_to < 4 then null else accepted_at end,
    done_at     = case when p_status = 'done' then now() else null end,
    done_by     = case when p_status = 'done' then public.current_profile_id() else null end,
    result_text = case when p_status = 'done' and p_comment is not null then p_comment else result_text end,
    seen_at     = case when p_status = 'new' then null else coalesce(seen_at, now()) end
  where id = r.id;

  if p_comment is not null and p_comment <> '' then
    insert into public.request_comments(request_id, author_id, text)
    values (r.id, public.current_profile_id(), p_comment);
  end if;

  select coalesce((select s.name from public.request_statuses s where s.code = p_status), v_names->>p_status) into v_name;
  perform public.log_history(r.object_id, 'request', r.id, 'status_changed',
    format('Заявка №%s «%s»: %s', r.number, r.type_name, v_name),
    jsonb_build_object('from', r.status, 'to', p_status));
end $$;

grant execute on function public.request_set_status(uuid, text, text) to authenticated;


-- =============================================================================
-- 20251020000016_request_status_sort.sql
-- =============================================================================

-- Порядок шагов «Хода заявки» настраивается в справочнике (колонка sort).
-- Переходы в request_set_status() идут по sort, не по жёсткому массиву кодов.

grant select, update (name, action_label, color, sort) on public.request_statuses to authenticated;

create or replace function public.request_set_status(p_request_id uuid, p_status text, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests;
        v_order text[];
        v_from int; v_to int; v_missing int;
        v_sent_pos int; v_accepted_pos int;
        v_names jsonb := '{"new":"Новая","ready":"Готова к отправке","sent":"Отправлена","accepted":"Принята заказчиком","done":"Исполнена"}';
        v_name text;
        v_step record;
        v_my_role text;
        v_is_admin boolean;
begin
  select * into r from public.requests where id = p_request_id and deleted_at is null for update;
  if not found then raise exception 'Заявка не найдена'; end if;
  if not public.can_see_object(r.object_id) then raise exception 'Нет прав'; end if;

  select coalesce(array_agg(code order by sort), array['new','ready','sent','accepted','done'])
    into v_order
  from public.request_statuses;

  v_from := array_position(v_order, r.status);
  v_to   := array_position(v_order, p_status);
  if v_to is null then raise exception 'Неизвестный статус %', p_status; end if;
  if v_from is null then raise exception 'Текущий статус % отсутствует в справочнике', r.status; end if;
  if v_to = v_from then return; end if;
  if v_to > v_from + 1 then raise exception 'Статусы проходятся по порядку'; end if;
  if v_to < v_from and coalesce(trim(p_comment), '') = '' then raise exception 'Укажите причину возврата'; end if;

  v_is_admin := public.is_admin();
  select role_code into v_my_role from public.profiles where id = public.current_profile_id();

  if v_to = v_from + 1 then
    select s.* into v_step
    from public.request_type_scenario_steps s
    where s.request_type_id = r.request_type_id
      and s.to_status = p_status
      and s.deleted_at is null
    order by s.step_no
    limit 1;

    if found and not v_is_admin and v_step.role_code is distinct from v_my_role then
      raise exception 'Этот шаг выполняет роль «%»', v_step.role_code;
    end if;

    if found then
      select count(*) into v_missing
      from public.request_type_scenario_step_fields sf
      join public.request_type_fields f on f.id = sf.field_id
      where sf.step_id = v_step.id
        and f.is_active and f.deleted_at is null
        and not exists (
          select 1 from public.request_field_values fv
          where fv.request_id = r.id and fv.field_id = f.id
            and fv.value is not null and fv.value <> 'null'::jsonb and fv.value <> '""'::jsonb
        )
        and not (f.field_type = 'file' and exists (
          select 1 from public.files fl
          where fl.entity_type = 'request_field' and fl.entity_id = r.id and fl.deleted_at is null
        ));
      if v_missing > 0 then
        raise exception 'Заполните обязательные поля шага: %', v_missing;
      end if;
    elsif p_status = 'ready' then
      select count(*) into v_missing from public.request_type_fields f
      where f.request_type_id = r.request_type_id and f.is_active and f.deleted_at is null and f.is_required
        and not exists (select 1 from public.request_field_values fv
                        where fv.request_id = r.id and fv.field_id = f.id
                          and fv.value is not null and fv.value <> 'null'::jsonb and fv.value <> '""'::jsonb)
        and not (f.field_type = 'file' and exists (select 1 from public.files fl
                 where fl.entity_type = 'request_field' and fl.entity_id = r.id and fl.deleted_at is null));
      if v_missing > 0 then raise exception 'Заполните обязательные поля: %', v_missing; end if;
    end if;
  end if;

  v_sent_pos := array_position(v_order, 'sent');
  v_accepted_pos := array_position(v_order, 'accepted');

  perform set_config('lider.rpc', 'on', true);
  update public.requests set
    status      = p_status,
    office_id   = case when p_status = 'ready' and office_id is null then public.current_profile_id() else office_id end,
    sent_at     = case
      when p_status = 'sent' then now()
      when v_sent_pos is not null and v_to < v_sent_pos then null
      else sent_at
    end,
    accepted_at = case
      when p_status = 'accepted' then now()
      when v_accepted_pos is not null and v_to < v_accepted_pos then null
      else accepted_at
    end,
    done_at     = case when p_status = 'done' then now() else null end,
    done_by     = case when p_status = 'done' then public.current_profile_id() else null end,
    result_text = case when p_status = 'done' and p_comment is not null then p_comment else result_text end,
    seen_at     = case when p_status = 'new' then null else coalesce(seen_at, now()) end
  where id = r.id;

  if p_comment is not null and p_comment <> '' then
    insert into public.request_comments(request_id, author_id, text)
    values (r.id, public.current_profile_id(), p_comment);
  end if;

  select coalesce((select s.name from public.request_statuses s where s.code = p_status), v_names->>p_status) into v_name;
  perform public.log_history(r.object_id, 'request', r.id, 'status_changed',
    format('Заявка №%s «%s»: %s', r.number, r.type_name, v_name),
    jsonb_build_object('from', r.status, 'to', p_status));
end $$;

grant execute on function public.request_set_status(uuid, text, text) to authenticated;


-- =============================================================================
-- 20251020000017_request_sent_action_label.sql
-- =============================================================================

-- Кнопка перехода на «Отправлена» — глагол действия, не название статуса.
update public.request_statuses
set action_label = 'Отправить'
where code = 'sent';



-- =============================================================================
-- 20251109000000_object_stage_numbers.sql
-- =============================================================================

-- Нумерация этапов индивидуальна для каждого объекта: 1…n по порядку.
-- (Функции renumber_object_stages / add_object_stages уже определены выше в этом файле.)

revoke all on function public.renumber_object_stages(uuid) from public, anon, authenticated;

do $$
declare oid uuid;
begin
  for oid in
    select distinct object_id from public.object_stages where deleted_at is null
  loop
    perform public.renumber_object_stages(oid);
  end loop;
end $$;
