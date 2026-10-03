import { NextRequest, NextResponse } from "next/server";

import { dashboardSupabaseAdmin } from "@/lib/dashboard-supabase-admin";
import { deleteDailyRoom } from "@/lib/daily";
import { supabaseAdmin } from "@/lib/supabase-admin";

type RouteContext = {
  params: Promise<{
    room: string;
  }>;
};

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { room } = await params;
  if (room === "rmt_demo") {
    return NextResponse.json({ ok: true, ignored: "demo-room" });
  }

  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!accessToken) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const dashboardSupabase = dashboardSupabaseAdmin();
  const { data: authData, error: authError } =
    await dashboardSupabase.auth.getUser(accessToken);

  if (authError || !authData.user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const { data: profile } = await dashboardSupabase
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const supabase = supabaseAdmin();
  const { data: roomRow, error: roomError } = await supabase
    .from("video_rooms")
    .select("room_name,status,cal_booking_uid,cal_booking_id")
    .eq("room_name", room)
    .maybeSingle();

  if (roomError) throw roomError;
  if (!roomRow) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  if (roomRow.status === "cancelled") {
    return NextResponse.json({ error: "Room has already been cancelled" }, { status: 409 });
  }

  const completedAt = new Date().toISOString();
  const bookingIds = [...new Set([roomRow.cal_booking_uid, roomRow.cal_booking_id].filter(Boolean))] as string[];
  let dailyDeleted = false;
  if (roomRow.status !== "deleted" && roomRow.status !== "cancelled") {
    try {
      await deleteDailyRoom(roomRow.room_name);
      dailyDeleted = true;
      await supabase
        .from("video_rooms")
        .update({ status: "deleted", deleted_at: completedAt, delete_after: completedAt })
        .eq("room_name", roomRow.room_name);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Daily room delete error";
      await supabase
        .from("video_rooms")
        .update({ status: "delete_failed", delete_after: completedAt })
        .eq("room_name", roomRow.room_name);

      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  if (bookingIds.length > 0) {
    await dashboardSupabase
      .from("bookings")
      .update({
        status: "completed",
        completed_at: completedAt
      })
      .in("cal_booking_id", bookingIds)
      .in("status", ["scheduled"]);
  }

  return NextResponse.json({
    ok: true,
    dailyDeleted,
    completedAt
  });
}
