import type { Config } from "@netlify/functions";

import { cleanupExpiredDailyRooms } from "../../lib/cleanup";
import { dailyRecordingsForRoom, deleteDailyRecording } from "../../lib/daily";
import { supabaseAdmin } from "../../lib/supabase-admin";

const cleanup = async () => {
  const supabase = supabaseAdmin();
  const roomsResult = await cleanupExpiredDailyRooms(supabase);
  const recordingsResult = await cleanupRecordings(supabase);

  return Response.json({
    ok: roomsResult.failed.length === 0,
    deleted: roomsResult.deleted,
    failed: roomsResult.failed,
    recordings: recordingsResult
  });
};

async function cleanupRecordings(supabase: ReturnType<typeof supabaseAdmin>) {
  const { data, error } = await supabase
    .from("video_rooms")
    .select("room_name")
    .not("recording_ready_at", "is", null)
    .is("recordings_deleted_at", null)
    .lte("recording_delete_after", new Date().toISOString())
    .limit(50);

  if (error) {
    return { deleted: [], failed: [], error: error.message };
  }

  const deleted: string[] = [];
  const failed: Array<{ roomName: string; error: string }> = [];

  for (const row of data || []) {
    try {
      const recordings = await dailyRecordingsForRoom(row.room_name);
      const finishedRecordings = recordings.filter((recording) => recording.status === "finished");

      for (const recording of finishedRecordings) {
        await deleteDailyRecording(recording.id);
        deleted.push(recording.id);
      }

      await supabase
        .from("video_rooms")
        .update({
          recording_ready_at: null,
          recording_delete_after: null,
          recordings_deleted_at: new Date().toISOString(),
          recordings_delete_last_error: null,
          recording_payload: null
        })
        .eq("room_name", row.room_name);
    } catch (recordingError) {
      const message =
        recordingError instanceof Error ? recordingError.message : "Unknown Daily recording delete error";
      failed.push({ roomName: row.room_name, error: message });

      await supabase
        .from("video_rooms")
        .update({ recordings_delete_last_error: message })
        .eq("room_name", row.room_name);
    }
  }

  return { deleted, failed };
}

export default cleanup;

export const config: Config = {
  schedule: "@hourly"
};
