create extension if not exists pgcrypto;

create table if not exists public.video_rooms (
  id uuid primary key default gen_random_uuid(),
  cal_booking_uid text not null,
  cal_booking_id text,
  cal_event_type_id text,
  cal_recurring_event_id text,
  cal_rescheduled_from_uid text,
  occurrence_start timestamptz,
  occurrence_end timestamptz,
  room_name text not null unique,
  daily_url text not null,
  branded_url text not null,
  status text not null default 'created',
  delete_after timestamptz,
  deleted_at timestamptz,
  recording_ready_at timestamptz,
  recording_payload jsonb,
  cal_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint video_rooms_status_check check (
    status in ('created', 'patched', 'cancelled', 'ended', 'deleted', 'delete_failed')
  )
);

create index if not exists video_rooms_cal_booking_uid_idx
  on public.video_rooms (cal_booking_uid);

create index if not exists video_rooms_status_delete_after_idx
  on public.video_rooms (status, delete_after);

create or replace function public.set_video_rooms_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_video_rooms_updated_at on public.video_rooms;

create trigger set_video_rooms_updated_at
before update on public.video_rooms
for each row
execute function public.set_video_rooms_updated_at();

alter table public.video_rooms enable row level security;

comment on table public.video_rooms is
  'Server-owned mapping between Cal.com booking occurrences, branded meeting URLs, Daily rooms, deletion state, and recordings.';
