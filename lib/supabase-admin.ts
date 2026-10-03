import { createClient } from "@supabase/supabase-js";

import { requireEnv } from "./env";

export type VideoRoomRow = {
  id: string;
  cal_booking_uid: string;
  cal_booking_id: string | null;
  cal_event_type_id: string | null;
  cal_recurring_event_id: string | null;
  cal_rescheduled_from_uid: string | null;
  occurrence_start: string | null;
  occurrence_end: string | null;
  room_name: string;
  daily_url: string;
  branded_url: string;
  status: "created" | "patched" | "cancelled" | "ended" | "deleted" | "delete_failed";
  delete_after: string | null;
  deleted_at: string | null;
  recording_ready_at: string | null;
  recording_delete_after: string | null;
  recordings_deleted_at: string | null;
  recordings_delete_last_error: string | null;
  recording_payload: Record<string, unknown> | null;
  custom_email_sent_at: string | null;
  custom_email_last_error: string | null;
  custom_email_group_key: string | null;
  calendar_synced_at: string | null;
  calendar_sync_payload: Record<string, unknown> | null;
  calendar_sync_last_error: string | null;
  reminder_email_sent_at: string | null;
  reminder_email_last_error: string | null;
  cal_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export function supabaseAdmin() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
}
