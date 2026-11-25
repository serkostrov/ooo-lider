-- Мягкое удаление заявки: только админ / руководитель (roles.is_admin).

create or replace function public.request_soft_delete(
  p_request_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.requests;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Нет прав';
  end if;

  select * into r
  from public.requests
  where id = p_request_id and deleted_at is null
  for update;
  if not found then
    raise exception 'Заявка не найдена';
  end if;

  update public.requests
  set
    deleted_at = now(),
    delete_reason = coalesce(v_reason, delete_reason, 'Удалено администратором')
  where id = r.id;

  perform public.log_history(
    r.object_id,
    'request',
    r.id,
    'deleted',
    format('Заявка №%s «%s» удалена', r.number, r.type_name),
    jsonb_build_object(
      'reason', coalesce(v_reason, 'Удалено администратором'),
      'status', r.status
    )
  );
end;
$$;

revoke all on function public.request_soft_delete(uuid, text) from public, anon;
grant execute on function public.request_soft_delete(uuid, text) to authenticated;

comment on function public.request_soft_delete(uuid, text) is
  'Мягкое удаление заявки (deleted_at). Доступно ролям с roles.is_admin (админ, руководитель).';
