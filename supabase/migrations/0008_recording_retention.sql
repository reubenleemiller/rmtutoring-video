alter table public.video_rooms
  add column if not exists recording_delete_after timestamptz,
  add column if not exists recordings_deleted_at timestamptz,
  add column if not exists recordings_delete_last_error text;

update public.video_rooms
set recording_delete_after = recording_ready_at + interval '30 days'
where recording_ready_at is not null
  and recording_delete_after is null;

create index if not exists video_rooms_recording_delete_due_idx
  on public.video_rooms (recording_delete_after, recordings_deleted_at);
