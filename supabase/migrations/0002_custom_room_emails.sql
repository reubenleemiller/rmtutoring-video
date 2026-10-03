alter table public.video_rooms
  add column if not exists custom_email_sent_at timestamptz,
  add column if not exists custom_email_last_error text;
