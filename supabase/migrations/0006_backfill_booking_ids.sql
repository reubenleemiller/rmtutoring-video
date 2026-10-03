update public.video_rooms
set cal_booking_id = cal_payload->>'bookingId'
where (cal_booking_id is null or cal_booking_id = '')
  and cal_payload ? 'bookingId';

create index if not exists video_rooms_cal_booking_id_idx
  on public.video_rooms (cal_booking_id);
