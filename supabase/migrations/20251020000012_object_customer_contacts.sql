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
