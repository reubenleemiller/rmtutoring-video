import { deleteDailyRoom } from "./daily";
import { supabaseAdmin } from "./supabase-admin";

export async function cleanupExpiredDailyRooms(supabase: ReturnType<typeof supabaseAdmin>) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("video_rooms")
    .select("room_name")
    .is("deleted_at", null)
    .lte("delete_after", now)
    .limit(50);

  if (error) {
    return { deleted: [], failed: [{ roomName: "query", error: error.message }] };
  }

  const deleted: string[] = [];
  const failed: Array<{ roomName: string; error: string }> = [];

  for (const row of data || []) {
    try {
      await deleteDailyRoom(row.room_name);
      await supabase
        .from("video_rooms")
        .update({ status: "deleted", deleted_at: now, delete_after: now })
        .eq("room_name", row.room_name);
      deleted.push(row.room_name);
    } catch (roomError) {
      const message = roomError instanceof Error ? roomError.message : "Unknown Daily room delete error";
      failed.push({ roomName: row.room_name, error: message });

      await supabase
        .from("video_rooms")
        .update({ status: "delete_failed", delete_after: now })
        .eq("room_name", row.room_name);
    }
  }

  return { deleted, failed };
}
