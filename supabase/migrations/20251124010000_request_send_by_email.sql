-- Отправка заявки на email вида: по умолчанию вкл., можно выключить.

alter table public.request_types
  add column if not exists send_by_email boolean not null default true;

comment on column public.request_types.send_by_email is
  'Отправлять заявки этого вида на send_to_email. По умолчанию включено.';

alter table public.requests
  add column if not exists send_by_email boolean not null default true;

comment on column public.requests.send_by_email is
  'Отправлять эту заявку на email вида. По умолчанию включено; офис может выключить перед «Отправить».';
