alter table public.video_rooms
  add column if not exists reminder_email_sent_at timestamptz,
  add column if not exists reminder_email_last_error text;

create index if not exists video_rooms_reminder_email_due_idx
  on public.video_rooms (occurrence_start, reminder_email_sent_at, status);
