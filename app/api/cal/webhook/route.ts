import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

import { bookingDescription, bookingEnd, bookingId, bookingStart, bookingTimeZone, bookingTitle, bookingsFromPayload, bookingUid, brandedRoomUrl, deleteAfter, emailGroupKey, eventTypeId, isRecord, isRecurringBooking, payloadOf, recurringBookingCount, recurringEventId, rescheduledFromUid, roomNameForBooking, webhookEventName } from "@/lib/booking";
import { cancelledRecurringBookingUids, confirmBooking, isRecurringBookingUid, recurringSeriesBookingUids, syncBookingCalendarEvent, updateBookingLocation } from "@/lib/cal";
import { allowRoomToRunPastExpiration, createDailyRoom, deleteDailyRoom } from "@/lib/daily";
import { sendRoomEmail, sendRoomEmailDigest } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!verifyCalSignature(rawBody, request.headers.get("x-cal-signature-256"))) {
    return Response.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as Record<string, unknown>;
  const eventName = webhookEventName(body);
  const payload = payloadOf(body);
  const bookings = bookingsFromPayload(payload);

  if (eventName.includes("BOOKING_REQUESTED")) {
    const rooms = [];

    for (const booking of bookings) {
      if (!usesRmTutoringVideoLocation(booking)) continue;

      const room = await ensureRoomForBooking(booking);
      await confirmBooking(bookingUid(booking));
      await syncCalendarEvent(booking, room.room_name, room.branded_url);
      rooms.push({ booking, room });
    }

    await sendRoomEmailsForWebhook(rooms, true);

    return Response.json({ ok: true, confirmed: true, rooms });
  }

  if (eventName.includes("BOOKING_CREATED") || eventName.includes("BOOKING_RESCHEDULED")) {
    const rooms = [];

    for (const booking of bookings) {
      if (!usesRmTutoringVideoLocation(booking)) continue;

      const room = eventName.includes("BOOKING_RESCHEDULED")
        ? await reassignRoomForRescheduledBooking(booking)
        : await ensureRoomForBooking(booking);
      await syncCalendarEvent(booking, room.room_name, room.branded_url);
      rooms.push({ booking, room });
    }

    await sendRoomEmailsForWebhook(rooms, false);

    return Response.json({ ok: true, rooms });
  }

  if (eventName.includes("BOOKING_CANCELLED") || eventName.includes("BOOKING_REJECTED")) {
    const expandSeries = await isSeriesCancellation(payload, bookings);

    for (const booking of bookings) {
      await deleteRoomsForBooking(booking, "cancelled", { expandSeries });
      await deleteCancelledRecurringRoomsForBooking(booking);
    }

    return Response.json({ ok: true });
  }

  if (eventName.includes("MEETING_ENDED")) {
    return Response.json({ ok: true, ignored: "end-session action controls room closure" });
  }

  if (eventName.includes("RECORDING_READY")) {
    await recordRecordingPayload(payload);
    return Response.json({ ok: true });
  }

  return Response.json({ ok: true, ignored: eventName || "unknown" });
}

async function sendRoomEmailsForWebhook(
  rooms: Array<{
    booking: Record<string, unknown>;
    room: {
      room_name: string;
      branded_url: string;
    };
  }>,
  pending: boolean
) {
  if (rooms.length === 0) return;

  if (rooms.length === 1) {
    const [{ booking, room }] = rooms;
    if (isRecurringBooking(booking)) {
      await sendRecurringSeriesEmailOnce(booking, pending);
      return;
    }

    await sendRoomEmailOnce(booking, room.room_name, room.branded_url, pending);
    return;
  }

  await sendRoomEmailDigestOnce(rooms, pending);
}

async function sendRecurringSeriesEmailOnce(booking: Record<string, unknown>, pending: boolean) {
  const groupKey = emailGroupKey(booking);
  const expectedCount = recurringBookingCount(booking);
  const seriesRooms = await roomsForEmailGroup(groupKey);

  if (seriesRooms.length === 0) return;
  if (seriesRooms.some((room) => room.custom_email_sent_at)) return;

  if (!expectedCount) {
    await sendRoomEmailDigestOnce(
      seriesRooms.map((room) => ({
        booking: room.cal_payload,
        room: {
          room_name: room.room_name,
          branded_url: room.branded_url
        }
      })),
      pending
    );
    return;
  }

  if (seriesRooms.length < expectedCount) {
    await markRoomsEmailError(
      seriesRooms.map((room) => room.room_name),
      `Waiting for all recurring rooms before sending one compiled link email (${seriesRooms.length}/${expectedCount})`
    );
    return;
  }

  await sendRoomEmailDigestOnce(
    seriesRooms.map((room) => ({
      booking: room.cal_payload,
      room: {
        room_name: room.room_name,
        branded_url: room.branded_url
      }
    })),
    pending
  );
}

async function sendRoomEmailDigestOnce(
  rooms: Array<{
    booking: Record<string, unknown>;
    room: {
      room_name: string;
      branded_url: string;
    };
  }>,
  pending: boolean
) {
  const supabase = supabaseAdmin();
  const unsent = [];

  for (const { booking, room } of rooms) {
    const { data, error } = await supabase
      .from("video_rooms")
      .select("custom_email_sent_at")
      .eq("room_name", room.room_name)
      .maybeSingle();

    if (error) throw error;
    if (!data?.custom_email_sent_at) unsent.push({ booking, room });
  }

  if (unsent.length === 0) return;

  const first = unsent[0].booking;

  try {
    const result = await sendRoomEmailDigest({
      booking: first,
      pending,
      rooms: unsent.map(({ booking, room }) => ({
        startsAt: bookingStart(booking),
        endsAt: bookingEnd(booking),
        roomUrl: room.branded_url
      }))
    });

    if (!result.sent) {
      await supabase
        .from("video_rooms")
        .update({
          custom_email_last_error: result.reason
        })
        .in(
          "room_name",
          unsent.map(({ room }) => room.room_name)
        );
      return;
    }

    await supabase
      .from("video_rooms")
      .update({
        custom_email_sent_at: new Date().toISOString(),
        custom_email_last_error: null
      })
      .in(
        "room_name",
        unsent.map(({ room }) => room.room_name)
      );
  } catch (emailError) {
    await supabase
      .from("video_rooms")
      .update({
        custom_email_last_error:
          emailError instanceof Error ? emailError.message : "Unknown email send error"
      })
      .in(
        "room_name",
        unsent.map(({ room }) => room.room_name)
      );
    throw emailError;
  }
}

async function roomsForEmailGroup(groupKey: string) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("video_rooms")
    .select("room_name,branded_url,occurrence_start,occurrence_end,custom_email_sent_at,cal_payload")
    .eq("custom_email_group_key", groupKey)
    .is("deleted_at", null)
    .order("occurrence_start", { ascending: true });

  if (error) throw error;

  return data || [];
}

async function markRoomsEmailError(roomNames: string[], message: string) {
  if (roomNames.length === 0) return;

  const supabase = supabaseAdmin();
  await supabase
    .from("video_rooms")
    .update({ custom_email_last_error: message })
    .in("room_name", roomNames);
}

async function syncCalendarEvent(
  booking: Record<string, unknown>,
  roomName: string,
  brandedUrl: string
) {
  const uid = bookingUid(booking);
  if (!uid) return;

  const supabase = supabaseAdmin();

  try {
    const result = await syncBookingCalendarEvent({
      bookingUid: uid,
      roomUrl: brandedUrl,
      title: bookingTitle(booking),
      description: bookingDescription(booking),
      startsAt: bookingStart(booking),
      endsAt: bookingEnd(booking),
      timeZone: bookingTimeZone(booking)
    });

    await supabase
      .from("video_rooms")
      .update({
        calendar_synced_at: new Date().toISOString(),
        calendar_sync_payload: result,
        calendar_sync_last_error: null
      })
      .eq("room_name", roomName);
  } catch (syncError) {
    await supabase
      .from("video_rooms")
      .update({
        calendar_sync_last_error:
          syncError instanceof Error ? syncError.message : "Unknown calendar sync error"
      })
      .eq("room_name", roomName);
  }
}

async function sendRoomEmailOnce(
  booking: Record<string, unknown>,
  roomName: string,
  brandedUrl: string,
  pending: boolean
) {
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("video_rooms")
    .select("custom_email_sent_at")
    .eq("room_name", roomName)
    .maybeSingle();

  if (error) throw error;
  if (data?.custom_email_sent_at) return;

  try {
    const result = await sendRoomEmail({ booking, roomUrl: brandedUrl, pending });
    if (!result.sent) {
      await supabase
        .from("video_rooms")
        .update({
          custom_email_last_error: result.reason
        })
        .eq("room_name", roomName);
      return;
    }

    await supabase
      .from("video_rooms")
      .update({
        custom_email_sent_at: new Date().toISOString(),
        custom_email_last_error: null
      })
      .eq("room_name", roomName);
  } catch (emailError) {
    await supabase
      .from("video_rooms")
      .update({
        custom_email_last_error:
          emailError instanceof Error ? emailError.message : "Unknown email send error"
      })
      .eq("room_name", roomName);
    throw emailError;
  }
}

async function ensureRoomForBooking(booking: Record<string, unknown>) {
  const uid = bookingUid(booking);
  if (!uid) throw new Error("Cal webhook payload did not include a booking uid.");

  const roomName = roomNameForBooking(booking);
  const brandedUrl = brandedRoomUrl(roomName);
  const supabase = supabaseAdmin();

  const { data: existing, error: existingError } = await supabase
    .from("video_rooms")
    .select("room_name,branded_url,daily_url,status,deleted_at,custom_email_group_key")
    .eq("room_name", roomName)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    const metadata: Record<string, unknown> = roomMetadataForBooking(booking, { status: "patched" });
    if (!recurringEventId(booking) && existing.custom_email_group_key?.startsWith("recurring:")) {
      delete metadata.cal_recurring_event_id;
      delete metadata.custom_email_group_key;
    }

    await allowRoomToRunPastExpiration(roomName);
    await updateBookingLocation(uid, existing.branded_url);
    await supabase
      .from("video_rooms")
      .update(metadata)
      .eq("room_name", roomName);
    return existing;
  }

  const dailyRoom = await createDailyRoom({
    name: roomName,
    startsAt: bookingStart(booking)
  });

  const { error } = await supabase.from("video_rooms").insert({
    ...roomMetadataForBooking(booking, { status: "created" }),
    room_name: roomName,
    daily_url: dailyRoom.url,
    branded_url: brandedUrl
  });

  if (error) throw error;

  await updateBookingLocation(uid, brandedUrl);
  await supabase.from("video_rooms").update({ status: "patched" }).eq("room_name", roomName);

  return {
    room_name: roomName,
    branded_url: brandedUrl,
    daily_url: dailyRoom.url,
    status: "patched"
  };
}

async function reassignRoomForRescheduledBooking(booking: Record<string, unknown>) {
  const previousUid = rescheduledFromUid(booking);
  if (!previousUid || previousUid === bookingUid(booking)) {
    return ensureRoomForBooking(booking);
  }

  const supabase = supabaseAdmin();
  const { data: existing, error } = await supabase
    .from("video_rooms")
    .select("room_name,branded_url,daily_url,status,deleted_at,custom_email_group_key")
    .eq("cal_booking_uid", previousUid)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!existing) {
    return ensureRoomForBooking(booking);
  }

  const metadata: Record<string, unknown> = roomMetadataForBooking(booking, { status: "patched" });
  if (!recurringEventId(booking) && existing.custom_email_group_key?.startsWith("recurring:")) {
    delete metadata.cal_recurring_event_id;
    delete metadata.custom_email_group_key;
  }

  await allowRoomToRunPastExpiration(existing.room_name);
  await updateBookingLocation(bookingUid(booking), existing.branded_url);

  const { error: updateError } = await supabase
    .from("video_rooms")
    .update({
      ...metadata,
      deleted_at: null,
      custom_email_sent_at: null,
      custom_email_last_error: null,
      reminder_email_sent_at: null,
      reminder_email_last_error: null,
      calendar_synced_at: null,
      calendar_sync_payload: null,
      calendar_sync_last_error: null
    })
    .eq("room_name", existing.room_name);

  if (updateError) throw updateError;

  return {
    room_name: existing.room_name,
    branded_url: existing.branded_url,
    daily_url: existing.daily_url,
    status: "patched"
  };
}

function roomMetadataForBooking(
  booking: Record<string, unknown>,
  overrides: Partial<{
    status: "created" | "patched";
  }> = {}
) {
  const metadata = {
    cal_booking_uid: bookingUid(booking),
    cal_booking_id: bookingId(booking),
    cal_event_type_id: eventTypeId(booking),
    cal_recurring_event_id: recurringEventId(booking),
    custom_email_group_key: emailGroupKey(booking),
    cal_rescheduled_from_uid: rescheduledFromUid(booking),
    occurrence_start: bookingStart(booking),
    occurrence_end: bookingEnd(booking),
    delete_after: deleteAfter(),
    cal_payload: booking
  };

  return overrides.status ? { ...metadata, status: overrides.status } : metadata;
}

async function isSeriesCancellation(payload: Record<string, unknown>, bookings: Array<Record<string, unknown>>) {
  if (bookings.length > 1) return true;
  if (hasSeriesCancellationFlag(payload)) return true;

  for (const booking of bookings) {
    if (hasSeriesCancellationFlag(booking)) return true;

    const recurringId = recurringEventId(booking);
    if (!recurringId) continue;

    const uid = bookingUid(booking);
    const id = bookingId(booking);
    const recurringUid = stringOrNull(
      booking.recurringBookingUid ||
        booking.recurring_booking_uid ||
        booking.recurringEventUid ||
        booking.recurring_event_uid
    );

    if (uid === recurringId || id === recurringId || Boolean(recurringUid && (uid === recurringUid || id === recurringUid))) {
      return true;
    }

    if (uid && (await isRecurringBookingUid(uid))) return true;
  }

  return false;
}

function hasSeriesCancellationFlag(value: unknown): boolean {
  return hasSeriesCancellationIntent(value);
}

function hasSeriesCancellationIntent(value: unknown, depth = 0): boolean {
  if (depth > 4 || !isRecord(value)) return false;

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");

    if (
      /cancel.*(all|remaining|series|recurring)|delete.*(all|remaining|series|recurring)|(all|remaining|series|recurring).*cancel|(all|remaining|series|recurring).*delete/.test(
        normalizedKey
      ) &&
      isTruthyFlag(nestedValue)
    ) {
      return true;
    }

    if (
      /(scope|type|action|mode|target|selection|option|intent|reason)/.test(normalizedKey) &&
      typeof nestedValue === "string" &&
      /(all|remaining|series|recurring)/i.test(nestedValue) &&
      /(cancel|delete|reject|all|remaining|series|recurring)/i.test(nestedValue)
    ) {
      return true;
    }

    if (
      /(remaining|all|series)occurrences?|(remaining|all|series)bookings?/.test(normalizedKey) &&
      Array.isArray(nestedValue) &&
      nestedValue.length > 0
    ) {
      return true;
    }

    if (
      isRecord(nestedValue) &&
      /(cancel|delete|reject|scope|action|recurring|series|remaining|all)/.test(normalizedKey) &&
      hasSeriesCancellationIntent(nestedValue, depth + 1)
    ) {
      return true;
    }
  }

  return false;
}

function isTruthyFlag(value: unknown) {
  return value === true || value === "true" || value === "1" || value === 1;
}

async function deleteRoomsForBooking(
  booking: Record<string, unknown>,
  status: "cancelled" | "ended" | "deleted",
  options: { expandSeries?: boolean } = {}
) {
  const filters: Array<{ column: string; value: string }> = [];
  const recurringId = recurringEventId(booking);
  const groupKey = emailGroupKey(booking);
  const id = bookingId(booking);
  const uid = bookingUid(booking);

  if (uid) filters.push({ column: "cal_booking_uid", value: uid });
  if (id) filters.push({ column: "cal_booking_id", value: id });

  if (options.expandSeries) {
    if (recurringId) filters.push({ column: "cal_recurring_event_id", value: recurringId });
    if (groupKey) filters.push({ column: "custom_email_group_key", value: groupKey });
  }

  await deleteRoomsByFilters(filters, status, options);
}

async function deleteCancelledRecurringRoomsForBooking(booking: Record<string, unknown>) {
  const uid = bookingUid(booking);
  const recurringId = recurringEventId(booking);
  if (!uid || !recurringId) return;

  const cancelledUids = await cancelledRecurringBookingUids(uid);
  for (const cancelledUid of cancelledUids) {
    await deleteRoomsByBookingUid(cancelledUid, "cancelled");
  }

  const series = await recurringSeriesBookingUids(uid);
  if (!series) return;

  const calUids = new Set(series.map((item) => item.uid));
  const calCancelledUids = new Set(
    series.filter((item) => item.status && /cancel/i.test(item.status)).map((item) => item.uid)
  );
  const localRooms = await localRoomsForRecurringSeries(recurringId);

  for (const room of localRooms) {
    if (!room.cal_booking_uid) continue;
    if (calCancelledUids.has(room.cal_booking_uid) || !calUids.has(room.cal_booking_uid)) {
      await deleteRoomsByBookingUid(room.cal_booking_uid, "cancelled");
    }
  }
}

async function localRoomsForRecurringSeries(recurringId: string) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("video_rooms")
    .select("cal_booking_uid")
    .eq("cal_recurring_event_id", recurringId)
    .is("deleted_at", null);

  if (error) throw error;
  return data || [];
}

async function deleteRoomsByBookingUid(bookingUid: string, status: "cancelled" | "ended" | "deleted") {
  await deleteRoomsByFilters([{ column: "cal_booking_uid", value: bookingUid }], status);
}

async function deleteRoomsByFilters(
  filters: Array<{ column: string; value: string }>,
  status: "cancelled" | "ended" | "deleted",
  options: { expandSeries?: boolean } = {}
) {
  const supabase = supabaseAdmin();
  const rooms = new Map<
    string,
    {
      room_name: string;
      cal_recurring_event_id: string | null;
      custom_email_group_key: string | null;
    }
  >();

  await collectRoomsByFilters(supabase, filters, rooms);

  if (options.expandSeries) {
    const seriesFilters = seriesFiltersForRooms([...rooms.values()]);
    await collectRoomsByFilters(supabase, seriesFilters, rooms);
  }

  const failed: Array<{ roomName: string; error: string }> = [];

  for (const row of rooms.values()) {
    const deletedAt = new Date().toISOString();
    await supabase
      .from("video_rooms")
      .update({ status, deleted_at: deletedAt })
      .eq("room_name", row.room_name);

    try {
      await deleteDailyRoom(row.room_name);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Unknown Daily room delete error";
      failed.push({ roomName: row.room_name, error: message });

      await supabase
        .from("video_rooms")
        .update({ status: "delete_failed", deleted_at: null })
        .eq("room_name", row.room_name);
    }
  }

  if (failed.length > 0) {
    throw new Error(
      `Failed to delete ${failed.length} Daily room(s): ${failed
        .map((failure) => `${failure.roomName}: ${failure.error}`)
        .join("; ")}`
    );
  }
}

async function collectRoomsByFilters(
  supabase: ReturnType<typeof supabaseAdmin>,
  filters: Array<{ column: string; value: string }>,
  rooms: Map<
    string,
    {
      room_name: string;
      cal_recurring_event_id: string | null;
      custom_email_group_key: string | null;
    }
  >
) {
  for (const filter of dedupeFilters(filters)) {
    const { data, error } = await supabase
      .from("video_rooms")
      .select("room_name,cal_recurring_event_id,custom_email_group_key")
      .eq(filter.column, filter.value)
      .is("deleted_at", null);

    if (error) throw error;

    for (const row of data || []) {
      rooms.set(row.room_name, row);
    }
  }
}

function seriesFiltersForRooms(
  rooms: Array<{
    cal_recurring_event_id: string | null;
    custom_email_group_key: string | null;
  }>
) {
  const filters: Array<{ column: string; value: string }> = [];

  for (const room of rooms) {
    if (room.cal_recurring_event_id) {
      filters.push({ column: "cal_recurring_event_id", value: room.cal_recurring_event_id });
      filters.push({ column: "custom_email_group_key", value: `recurring:${room.cal_recurring_event_id}` });
    }

    if (room.custom_email_group_key?.startsWith("recurring:")) {
      filters.push({ column: "custom_email_group_key", value: room.custom_email_group_key });
      filters.push({
        column: "cal_recurring_event_id",
        value: room.custom_email_group_key.replace(/^recurring:/, "")
      });
    }
  }

  return dedupeFilters(filters);
}

function dedupeFilters(filters: Array<{ column: string; value: string }>) {
  const seen = new Set<string>();
  return filters.filter((filter) => {
    const key = `${filter.column}:${filter.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function recordRecordingPayload(payload: Record<string, unknown>) {
  const roomName = findRoomName(payload);
  if (!roomName) return;

  const supabase = supabaseAdmin();
  const readyAt = new Date();
  await supabase
    .from("video_rooms")
    .update({
      recording_ready_at: readyAt.toISOString(),
      recording_delete_after: new Date(readyAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      recordings_deleted_at: null,
      recordings_delete_last_error: null,
      recording_payload: payload
    })
    .eq("room_name", roomName);
}

function verifyCalSignature(rawBody: string, header: string | null) {
  const secret = process.env.CAL_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!header) return false;

  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = header.replace(/^sha256=/, "");

  try {
    return timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}

function findRoomName(payload: Record<string, unknown>): string | null {
  const direct = stringOrNull(payload.roomName || payload.room_name);
  if (direct) return direct;

  const recording = payload.recording;
  if (isRecord(recording)) {
    return stringOrNull(recording.roomName || recording.room_name);
  }

  const dailyRoom = payload.dailyRoom;
  if (isRecord(dailyRoom)) {
    return stringOrNull(dailyRoom.name || dailyRoom.roomName || dailyRoom.room_name);
  }

  return null;
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number") return String(value);
  return null;
}

function usesRmTutoringVideoLocation(booking: Record<string, unknown>): boolean {
  const appOrigin = normalizedAppOrigin();
  if (!appOrigin) return false;

  for (const candidate of locationCandidates(booking)) {
    if (urlMatchesOrigin(candidate, appOrigin)) return true;
  }

  return false;
}

function normalizedAppOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function urlMatchesOrigin(value: unknown, origin: string): boolean {
  if (typeof value !== "string" || value.length === 0) return false;

  try {
    return new URL(value).origin === origin;
  } catch {
    return false;
  }
}

function locationCandidates(booking: Record<string, unknown>): unknown[] {
  const candidates: unknown[] = [];
  collectLocationCandidates(booking.location, candidates);
  collectLocationCandidates(booking.locations, candidates);

  const eventType = booking.eventType;
  if (isRecord(eventType)) {
    collectLocationCandidates(eventType.location, candidates);
    collectLocationCandidates(eventType.locations, candidates);
  }

  const metadata = booking.metadata;
  if (isRecord(metadata)) {
    collectLocationCandidates(metadata.videoCallUrl, candidates);
    collectLocationCandidates(metadata.brandedRoomUrl, candidates);
  }

  return candidates;
}

function collectLocationCandidates(value: unknown, candidates: unknown[]) {
  if (!value) return;

  if (typeof value === "string") {
    candidates.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectLocationCandidates(item, candidates);
    return;
  }

  if (!isRecord(value)) return;

  candidates.push(
    value.link,
    value.url,
    value.address,
    value.value,
    value.location,
    value.hostPhoneNumber,
    value.credentialId
  );
}
