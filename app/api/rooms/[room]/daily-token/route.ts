import { NextRequest, NextResponse } from "next/server";

import { dashboardSupabaseAdmin } from "@/lib/dashboard-supabase-admin";
import { allowRoomToRunPastExpiration, createDailyMeetingToken } from "@/lib/daily";
import { supabaseAdmin } from "@/lib/supabase-admin";

type RouteContext = {
  params: Promise<{
    room: string;
  }>;
};

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { room } = await params;
  const isDemoRoom = room === "rmt_demo";

  if (isDemoRoom) {
    const token = await createDailyMeetingToken({
      roomName: room,
      canRecord: false
    });

    return NextResponse.json({ token, canRecord: false });
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

  const supabase = supabaseAdmin();
  const { data: roomRow } = await supabase
    .from("video_rooms")
    .select("room_name,status")
    .eq("room_name", room)
    .maybeSingle();

  if (!roomRow || roomRow.status === "deleted" || roomRow.status === "cancelled") {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  await allowRoomToRunPastExpiration(room);

  const { data: profile } = await dashboardSupabase
    .from("profiles")
    .select("full_name,role")
    .eq("id", authData.user.id)
    .maybeSingle();

  const canRecord = profile?.role === "admin";
  const token = await createDailyMeetingToken({
    roomName: room,
    userId: authData.user.id,
    userName:
      typeof profile?.full_name === "string" && profile.full_name.trim()
        ? profile.full_name.trim()
        : authData.user.email || undefined,
    canRecord
  });

  return NextResponse.json({ token, canRecord });
}
