import { sendRoomEmail } from "./email";
import { bookingStart } from "./booking";
import { supabaseAdmin, VideoRoomRow } from "./supabase-admin";

type ReminderOptions = {
  retrySent?: boolean;
};

export async function sendUpcomingRoomReminders(options: ReminderOptions = {}) {
  const supabase = supabaseAdmin();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  let query = supabase
    .from("video_rooms")
    .select("*")
    .in("status", ["created", "patched"])
    .is("deleted_at", null)
    .order("occurrence_start", { ascending: true, nullsFirst: false });

  if (!options.retrySent) {
    query = query.is("reminder_email_sent_at", null);
  }

  const { data, error } = await query.limit(500);

  if (error) throw error;

  const sent: string[] = [];
  const failed: Array<{ roomName: string; error: string }> = [];
  const skipped: Array<{ roomName: string; reason: string }> = [];
  const dueRooms = ((data || []) as VideoRoomRow[])
    .map((room) => ({ room, startsAt: reminderStart(room) }))
    .filter(({ room, startsAt }) => {
      if (room.reminder_email_sent_at && !options.retrySent) {
        skipped.push({ roomName: room.room_name, reason: `Already marked sent: ${room.reminder_email_sent_at}` });
        return false;
      }

      if (!startsAt) {
        skipped.push({ roomName: room.room_name, reason: "No occurrence_start or Cal payload start time" });
        return false;
      }

      if (startsAt < now) {
        skipped.push({ roomName: room.room_name, reason: `Starts before reminder window: ${startsAt.toISOString()}` });
        return false;
      }

      if (startsAt > windowEnd) {
        skipped.push({ roomName: room.room_name, reason: `Starts after reminder window: ${startsAt.toISOString()}` });
        return false;
      }

      return true;
    })
    .sort((left, right) => left.startsAt!.getTime() - right.startsAt!.getTime())
    .slice(0, 100)
    .map(({ room }) => room);

  for (const room of dueRooms) {
    try {
      const result = await sendRoomEmail({
        booking: room.cal_payload,
        roomUrl: room.branded_url,
        pending: false
      });

      if (!result.sent) {
        await supabase
          .from("video_rooms")
          .update({
            reminder_email_last_error: result.reason
          })
          .eq("room_name", room.room_name);

        failed.push({ roomName: room.room_name, error: result.reason });
        continue;
      }

      await supabase
        .from("video_rooms")
        .update({
          reminder_email_sent_at: new Date().toISOString(),
          reminder_email_last_error: null
        })
        .eq("room_name", room.room_name);

      sent.push(room.room_name);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown reminder email error";

      await supabase
        .from("video_rooms")
        .update({
          reminder_email_last_error: message
        })
        .eq("room_name", room.room_name);

      failed.push({ roomName: room.room_name, error: message });
    }
  }

  return {
    checked: data?.length || 0,
    retrySent: Boolean(options.retrySent),
    sent,
    failed,
    skipped
  };
}

function reminderStart(room: VideoRoomRow) {
  const start = room.occurrence_start || bookingStart(room.cal_payload);
  if (!start) return null;

  const date = new Date(start);
  return Number.isNaN(date.getTime()) ? null : date;
}
