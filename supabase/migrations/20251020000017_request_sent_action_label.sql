-- Кнопка перехода на «Отправлена» — глагол действия, не название статуса.
update public.request_statuses
set action_label = 'Отправить'
where code = 'sent';
