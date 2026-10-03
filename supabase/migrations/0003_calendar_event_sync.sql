alter table public.video_rooms
  add column if not exists calendar_synced_at timestamptz,
  add column if not exists calendar_sync_payload jsonb,
  add column if not exists calendar_sync_last_error text;
