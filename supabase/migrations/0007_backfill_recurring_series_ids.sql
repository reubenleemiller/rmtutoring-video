update public.video_rooms
set cal_recurring_event_id = cal_payload #>> '{existingRecurringEvent,recurringEventId}'
where (cal_recurring_event_id is null or cal_recurring_event_id = '')
  and cal_payload #>> '{existingRecurringEvent,recurringEventId}' is not null;

update public.video_rooms
set cal_recurring_event_id = cal_payload #>> '{recurringEvent,recurringEventId}'
where (cal_recurring_event_id is null or cal_recurring_event_id = '')
  and cal_payload #>> '{recurringEvent,recurringEventId}' is not null;

update public.video_rooms
set custom_email_group_key = 'recurring:' || cal_recurring_event_id
where cal_recurring_event_id is not null
  and cal_recurring_event_id <> '';

create index if not exists video_rooms_cal_recurring_event_id_idx
  on public.video_rooms (cal_recurring_event_id);
