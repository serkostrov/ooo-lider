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
create or replace function public.add_object_stages(p_object_id uuid, p_template_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare
  t record; v_stage uuid; v_count int := 0; v_first int;
begin
  if not public.is_admin() then raise exception 'Нет прав'; end if;
  for t in select * from public.stage_templates
           where id = any(p_template_ids) and deleted_at is null
             and not exists (select 1 from public.object_stages s
                             where s.object_id = p_object_id and s.template_id = stage_templates.id
                               and s.deleted_at is null)
           order by sort, number
  loop
    insert into public.object_stages(object_id, template_id, number, name, work_type_id, description,
      duration_days, confirmer_role, outgoing_doc, expected_doc, response_days, remind_days,
      is_critical, sort)
    values (p_object_id, t.id, t.number, t.name, t.work_type_id, t.description, t.duration_days,
      t.confirmer_role, t.outgoing_doc, t.expected_doc, t.response_days, t.remind_days,
      t.is_critical, t.sort)
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
