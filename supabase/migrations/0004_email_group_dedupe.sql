alter table public.video_rooms
  add column if not exists custom_email_group_key text;

create index if not exists video_rooms_custom_email_group_key_idx
  on public.video_rooms (custom_email_group_key);
