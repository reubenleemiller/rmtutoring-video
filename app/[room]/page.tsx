import { notFound } from "next/navigation";

import VideoRoom from "@/components/video-room";
import { demoDailyRoomUrl } from "@/lib/daily";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    room: string;
  }>;
};

export default async function RoomPage({ params }: PageProps) {
  const { room } = await params;

  if (room === "rmt_demo") {
    return (
      <VideoRoom
        roomName={room}
        dailyUrl={demoDailyRoomUrl()}
        startsAt={null}
        endsAt={null}
        requiresAuth={false}
        isDemoRoom
      />
    );
  }

  const supabase = supabaseAdmin();
  const { data } = await supabase
    .from("video_rooms")
    .select("room_name,daily_url,status,occurrence_start,occurrence_end")
    .eq("room_name", room)
    .maybeSingle();

  if (!data || data.status === "deleted" || data.status === "cancelled") {
    notFound();
  }

  return (
    <VideoRoom
      roomName={data.room_name}
      dailyUrl={data.daily_url}
      startsAt={data.occurrence_start}
      endsAt={data.occurrence_end}
      requiresAuth
      isDemoRoom={false}
    />
  );
}
