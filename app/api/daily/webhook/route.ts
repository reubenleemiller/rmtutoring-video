import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

import { isRecord } from "@/lib/booking";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const RECORDING_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!verifyDailySignature(rawBody, request.headers.get("x-webhook-signature"))) {
    return Response.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as Record<string, unknown>;
  const eventType = String(body.type || "");

  if (eventType !== "recording.ready-to-download") {
    return Response.json({ ok: true, ignored: eventType || "unknown" });
  }

  const payload = isRecord(body.payload) ? body.payload : {};
  const roomName = findRoomName(payload);
  if (!roomName) {
    return Response.json({ ok: true, ignored: "missing room_name" });
  }

  const readyAt = eventTime(body) || new Date();
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from("video_rooms")
    .update({
      recording_ready_at: readyAt.toISOString(),
      recording_delete_after: new Date(readyAt.getTime() + RECORDING_RETENTION_MS).toISOString(),
      recordings_deleted_at: null,
      recordings_delete_last_error: null,
      recording_payload: body
    })
    .eq("room_name", roomName);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

function verifyDailySignature(rawBody: string, signature: string | null) {
  const hmac = process.env.DAILY_WEBHOOK_HMAC;
  if (!hmac) return true;
  if (!signature) return false;

  const digest = createHmac("sha256", Buffer.from(hmac, "base64")).update(rawBody).digest("base64");

  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

function eventTime(body: Record<string, unknown>) {
  const raw = numberOrNull(body.event_ts);
  return raw ? new Date(raw * 1000) : null;
}

function findRoomName(payload: Record<string, unknown>): string | null {
  const direct = stringOrNull(payload.room_name || payload.roomName);
  if (direct) return direct;

  const recording = payload.recording;
  if (isRecord(recording)) {
    const nested = stringOrNull(recording.room_name || recording.roomName);
    if (nested) return nested;
  }

  const room = payload.room;
  if (isRecord(room)) {
    return stringOrNull(room.name || room.room_name || room.roomName);
  }

  return null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
