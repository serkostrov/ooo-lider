-- channel больше не enum: произвольный код журнала.
alter table public.registry_entries drop constraint if exists registry_entries_channel_check;
