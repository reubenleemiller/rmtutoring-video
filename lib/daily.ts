import { booleanEnv, numberEnv, requireEnv } from "./env";

const DAILY_API_BASE = "https://api.daily.co/v1";

type DailyRoom = {
  name: string;
  url: string;
  config?: {
    nbf?: number;
    exp?: number;
  };
};

type DailyMeetingToken = {
  token: string;
};

type DailyRecording = {
  id: string;
  room_name: string;
  status: "finished" | "in-progress" | "canceled";
};

type DailyRecordingsList = {
  total_count: number;
  data: DailyRecording[];
};

async function dailyFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${DAILY_API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requireEnv("DAILY_API_KEY")}`,
      ...init.headers
    }
  });

  if (!response.ok) {
    if (response.status === 404 && init.method === "DELETE") {
      return undefined as T;
    }

    const body = await response.text();
    throw new Error(`Daily API ${response.status}: ${body}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function demoDailyRoomUrl(): string {
  return process.env.DAILY_DEMO_ROOM_URL || "https://rmtutoring.daily.co/rmt_demo";
}

export async function createDailyRoom(params: {
  name: string;
  startsAt?: string | null;
}): Promise<DailyRoom> {
  const openBefore = numberEnv("ROOM_OPEN_MINUTES_BEFORE", 15);
  const maxParticipants = numberEnv("ROOM_MAX_PARTICIPANTS", 8);
  const joinAnytime = booleanEnv("ROOM_JOIN_ANYTIME", true);

  const startSeconds = params.startsAt
    ? Math.floor(new Date(params.startsAt).getTime() / 1000)
    : Math.floor(Date.now() / 1000);
  return dailyFetch<DailyRoom>("/rooms", {
    method: "POST",
    body: JSON.stringify({
      name: params.name,
      privacy: "private",
      properties: {
        ...(joinAnytime ? {} : { nbf: startSeconds - openBefore * 60 }),
        enable_chat: true,
        enable_people_ui: true,
        enable_prejoin_ui: true,
        enable_screenshare: true,
        enable_knocking: false,
        eject_at_room_exp: false,
        max_participants: maxParticipants,
        start_video_off: true,
        start_audio_off: false,
        recordings_template: "{room_name}/{epoch_time}.mp4"
      }
    })
  });
}

export async function allowRoomToRunPastExpiration(roomName: string): Promise<void> {
  await dailyFetch<void>(`/rooms/${encodeURIComponent(roomName)}`, {
    method: "POST",
    body: JSON.stringify({
      properties: {
        eject_at_room_exp: false
      }
    })
  });
}

export async function createDailyMeetingToken(params: {
  roomName: string;
  userId?: string;
  userName?: string;
  canRecord: boolean;
}): Promise<string> {
  const tokenTtlHours = numberEnv("DAILY_MEETING_TOKEN_TTL_HOURS", 24 * 30);
  const expiresAt =
    tokenTtlHours > 0 ? Math.floor(Date.now() / 1000) + tokenTtlHours * 60 * 60 : null;

  const token = await dailyFetch<DailyMeetingToken>("/meeting-tokens", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        room_name: params.roomName,
        ...(expiresAt ? { exp: expiresAt } : {}),
        is_owner: params.canRecord,
        user_id: params.userId,
        user_name: params.userName,
        enable_screenshare: true,
        enable_recording: params.canRecord ? "cloud" : undefined,
        enable_recording_ui: params.canRecord,
        start_video_off: true,
        start_audio_off: false
      }
    })
  });

  return token.token;
}

export async function deleteDailyRoom(roomName: string): Promise<void> {
  await dailyFetch<void>(`/rooms/${encodeURIComponent(roomName)}`, {
    method: "DELETE"
  });
}

export async function dailyRecordingsForRoom(roomName: string): Promise<DailyRecording[]> {
  const params = new URLSearchParams({
    room_name: roomName,
    limit: "100"
  });
  const result = await dailyFetch<DailyRecordingsList>(`/recordings?${params.toString()}`);
  return result.data || [];
}

export async function deleteDailyRecording(recordingId: string): Promise<void> {
  await dailyFetch<void>(`/recordings/${encodeURIComponent(recordingId)}`, {
    method: "DELETE"
  });
}
